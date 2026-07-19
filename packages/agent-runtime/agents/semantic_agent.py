"""The grounded SQL agent: LLM reasoning + symbolic rule enforcement.

Every SQL statement the model proposes passes through `validate_sql` before it
touches the database. Blocked queries are returned to the model with the rule
text so it can self-correct — the neurosymbolic loop from the design docs.
"""

from __future__ import annotations

from typing import Callable, Optional

from langchain.tools import tool

from polanyi.models import (
    AgentStep,
    AskResult,
    BusinessRuleContext,
    SemanticContext,
    ValidationResult,
)
from polanyi.semantic.prompt import build_agent_prompt
from polanyi.execution.validate import validate_sql

_AGENT_PREAMBLE = """You are an agent designed to interact with a SQL database.
Given an input question, create a syntactically correct {dialect} query to run,
then look at the results and return the answer.

Unless the user specifies a specific number of examples, always limit your
query to at most 5 results.

DO NOT make any DML statements (INSERT, UPDATE, DELETE, DROP etc.).

Every query is checked against enterprise business rules before execution.
If a query is BLOCKED, read the violation message and rewrite the query so it
satisfies the rule (for example by adding the required filter or column).

ALWAYS look at the tables first using sql_db_list_tables.
Then query the schema of the most relevant tables using sql_db_schema.

"""


def build_sql_tools(
    db_uri: str,
    rules: list[BusinessRuleContext],
    on_event: Optional[Callable[[AgentStep], None]] = None,
    on_validation: Optional[Callable[[str, ValidationResult], None]] = None,
):
    """SQL tools with the symbolic validator wired in front of execution."""
    from langchain_community.utilities import SQLDatabase

    db = SQLDatabase.from_uri(db_uri)
    emit = on_event or (lambda step: None)
    record_validation = on_validation or (lambda sql, result: None)

    @tool
    def sql_db_list_tables() -> str:
        """Output is a comma-separated list of tables in the database."""
        return ", ".join(db.get_usable_table_names())

    @tool
    def sql_db_schema(table_names: str) -> str:
        """Input is a comma-separated list of tables, output is the schema and sample rows.
        Be sure the tables exist by calling sql_db_list_tables first!"""
        results = []
        for table in table_names.split(","):
            table = table.strip()
            if table not in db.get_usable_table_names():
                results.append(f"Error: table '{table}' not found")
                continue
            results.append(db.get_table_info([table]))
        return "\n\n".join(results)

    @tool
    def sql_db_query(query: str) -> str:
        """Input is a SQL query, output is the result from the database.
        Queries are validated against enterprise business rules first; if the
        query is BLOCKED, rewrite it following the violation guidance."""
        result = validate_sql(query, rules)
        record_validation(query, result)
        if not result.valid:
            messages = "; ".join(v.message for v in result.violations)
            emit(
                AgentStep(
                    kind="validation",
                    name="blocked",
                    detail=f"{query.strip()} — {messages}",
                )
            )
            return f"QUERY BLOCKED by business rules: {messages}"
        warnings = [v for v in result.violations if v.severity not in ("CRITICAL",)]
        emit(AgentStep(kind="validation", name="passed", detail=query.strip()))
        try:
            output = db.run(query)
        except Exception as exc:  # noqa: BLE001 — surface DB errors to the model
            return f"Error: {exc}"
        if warnings:
            notes = "; ".join(v.message for v in warnings)
            return f"{output}\n\nRule warnings: {notes}"
        return str(output)

    return [sql_db_list_tables, sql_db_schema, sql_db_query]


def trace_from_messages(messages: list, question: str) -> list[AgentStep]:
    """Build the reasoning trace for the turn that answered `question`.

    With session memory the message list contains the whole conversation;
    only messages from the latest matching HumanMessage onward belong to
    this turn's trace.
    """
    from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

    start = 0
    for index, message in enumerate(messages):
        if isinstance(message, HumanMessage) and message.content == question:
            start = index

    steps: list[AgentStep] = []
    for message in messages[start:]:
        if isinstance(message, AIMessage):
            for call in message.tool_calls or []:
                steps.append(
                    AgentStep(
                        kind="tool_call",
                        name=call["name"],
                        detail=str(call.get("args", {}))[:500],
                    )
                )
        elif isinstance(message, ToolMessage):
            steps.append(
                AgentStep(
                    kind="tool_result",
                    name=str(message.name or "tool"),
                    detail=str(message.content)[:500],
                )
            )

    answer = str(messages[-1].content) if messages else ""
    steps.append(AgentStep(kind="answer", name="final", detail=answer[:500]))
    return steps


class SemanticAgent:
    """A SQL agent grounded in a SemanticContext.

    Tools come from a CapabilityRegistry, so alternative executors (Databricks,
    Neo4j, MCP servers) can be plugged in without changing agent code. The
    memory runtime supplies a durable checkpointer, so each session_id keeps
    its multi-turn conversation across restarts.
    """

    def __init__(
        self,
        db_uri: str,
        context: SemanticContext,
        llm,
        registry=None,
        on_validation: Optional[Callable[[str, ValidationResult], None]] = None,
    ):
        if llm is None:
            raise ValueError(
                "No LLM configured. Set NVIDIA_API_KEY, OPENAI_API_KEY, or "
                "DATABRICKS_TOKEN + DATABRICKS_SERVING_ENDPOINT to enable the agent."
            )
        self._steps: list[AgentStep] = []
        if registry is None:
            from polanyi.kernel.capabilities import default_registry

            registry = default_registry(
                db_uri,
                context.business_rules,
                on_event=self._steps.append,
                on_validation=on_validation,
            )
        dialect = db_uri.split(":", 1)[0]

        from polanyi.kernel.agent_skills import build_skills_addendum, load_agent_skills

        system_prompt = (
            _AGENT_PREAMBLE.format(dialect=dialect)
            + build_agent_prompt(context)
            + build_skills_addendum(load_agent_skills())
        )

        from langchain.agents import create_agent

        from polanyi.memory import build_checkpointer

        self._agent = create_agent(
            model=llm,
            tools=registry.agent_tools(),
            system_prompt=system_prompt,
            checkpointer=build_checkpointer(),
        )

    def ask(self, question: str, session_id: Optional[str] = None) -> AskResult:
        from langchain_core.messages import HumanMessage

        self._steps.clear()
        config = {"configurable": {"thread_id": session_id or "default"}}
        result = self._agent.invoke(
            {"messages": [HumanMessage(content=question)]}, config
        )
        messages = result["messages"]

        answer = str(messages[-1].content) if messages else ""
        steps = trace_from_messages(messages, question)
        answer_step = steps.pop()
        steps.extend(self._steps)
        steps.append(answer_step)
        return AskResult(question=question, answer=answer, steps=steps)

    def ask_stream(self, question: str, session_id: Optional[str] = None):
        """Real-time events as the agent works, using LangGraph's own
        stream_mode=["updates", "messages"] (verified directly against the
        installed langchain/langgraph before writing this): "updates"
        carries a complete tool_call the moment the model decides to make
        it and a complete tool_result the moment a tool finishes;
        "messages" carries token-by-token content for the streamed final
        answer. Scoped to the supervisor's own top-level steps -- a
        specialist's internal tool calls run inside their own separate
        create_agent().invoke() call and aren't part of this outer
        stream, matching ask()'s existing trace-consolidation shape."""
        from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage, ToolMessage

        config = {"configurable": {"thread_id": session_id or "default"}}
        answer_chunks: list[str] = []
        for mode, data in self._agent.stream(
            {"messages": [HumanMessage(content=question)]}, config, stream_mode=["updates", "messages"]
        ):
            if mode == "messages":
                message, _metadata = data
                if isinstance(message, AIMessageChunk) and message.content:
                    answer_chunks.append(message.content)
                    yield {"type": "token", "content": message.content}
            elif mode == "updates":
                for node, update in data.items():
                    if node not in ("model", "tools"):
                        continue
                    for message in update.get("messages", []):
                        if isinstance(message, AIMessage) and message.tool_calls:
                            for call in message.tool_calls:
                                yield {
                                    "type": "tool_call",
                                    "name": call["name"],
                                    "detail": str(call.get("args", {}))[:500],
                                }
                        elif isinstance(message, ToolMessage):
                            yield {
                                "type": "tool_result",
                                "name": str(message.name or "tool"),
                                "detail": str(message.content)[:500],
                            }
        yield {"type": "done", "answer": "".join(answer_chunks)}
