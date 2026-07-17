"""The grounded SQL agent: LLM reasoning + symbolic rule enforcement.

Every SQL statement the model proposes passes through `validate_sql` before it
touches the database. Blocked queries are returned to the model with the rule
text so it can self-correct — the neurosymbolic loop from the design docs.
"""

from __future__ import annotations

from typing import Callable, Optional

from langchain.tools import tool

from graphos.models import (
    AgentStep,
    AskResult,
    BusinessRuleContext,
    SemanticContext,
)
from graphos.prompt import build_agent_prompt
from graphos.validate import validate_sql

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
):
    """SQL tools with the symbolic validator wired in front of execution."""
    from langchain_community.utilities import SQLDatabase

    db = SQLDatabase.from_uri(db_uri)
    emit = on_event or (lambda step: None)

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


class SemanticAgent:
    """A SQL agent grounded in a SemanticContext.

    Tools come from a CapabilityRegistry, so alternative executors (Databricks,
    Neo4j, MCP servers) can be plugged in without changing agent code.
    """

    def __init__(self, db_uri: str, context: SemanticContext, llm, registry=None):
        if llm is None:
            raise ValueError(
                "No LLM configured. Set NVIDIA_API_KEY, OPENAI_API_KEY, or "
                "DATABRICKS_TOKEN + DATABRICKS_SERVING_ENDPOINT to enable the agent."
            )
        self._steps: list[AgentStep] = []
        if registry is None:
            from graphos.capabilities import default_registry

            registry = default_registry(
                db_uri, context.business_rules, on_event=self._steps.append
            )
        dialect = db_uri.split(":", 1)[0]
        system_prompt = _AGENT_PREAMBLE.format(dialect=dialect) + build_agent_prompt(context)

        from langchain.agents import create_agent

        self._agent = create_agent(
            model=llm, tools=registry.agent_tools(), system_prompt=system_prompt
        )

    def ask(self, question: str) -> AskResult:
        from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

        self._steps.clear()
        result = self._agent.invoke({"messages": [HumanMessage(content=question)]})
        messages = result["messages"]

        steps: list[AgentStep] = []
        validation_steps = list(self._steps)
        for message in messages:
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
        steps.extend(validation_steps)

        answer = str(messages[-1].content) if messages else ""
        steps.append(AgentStep(kind="answer", name="final", detail=answer[:500]))
        return AskResult(question=question, answer=answer, steps=steps)
