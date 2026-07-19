# Plan: SemanticAgent Specialist Subagents

**Branch**: feat/semantic-agent-specialists
**Status**: Draft — awaiting slice-1 acceptance criteria approval

## Goal

Reduce `SemanticAgent`'s observed tool-selection confusion by regrouping its flat ~13-tool list into two focused specialist sub-agents (ontology, graph) that the supervisor calls as single tools — without touching `SemanticAgent`'s own checkpointer/session logic.

## Background (do not re-derive — established this session)

- **Problem, confirmed not speculative**: the user has observed real tool misselection against the current flat list (3 SQL + `search_ontology`/`expand_ontology`/`query_ontology` + `query_knowledge_graph`/`search_knowledge_graph`/`graph_rag_query`/`graph_page_rank`/`find_graph_communities`/`find_similar_terms` + skill-plugin tools like `convert_currency`).
- **The `agentskills` PyPI package used in the shared notebook does not exist** (confirmed, no PyPI listing). But `agentskills.io` itself is real — it's **not a Python package at all**. It's the **Agent Skills open format**, originally developed by Anthropic and released as an open standard: a skill is a *folder* containing a `SKILL.md` file (YAML frontmatter — `name` + `description` minimum — plus a markdown instructions body), optionally bundling `scripts/`, `references/`, `assets/`. Agents load skills via **progressive disclosure**: Discovery (name+description only, at startup) → Activation (full `SKILL.md` read into context when a task matches) → Execution (follow the instructions, optionally run bundled scripts). It's adopted broadly across agent *clients* (Claude Code, Cursor, VS Code Copilot, Gemini CLI, OpenAI Codex, and dozens more) — confirmed directly: **every skill this project's own CLAUDE.md loads (`tdd`, `testing`, `mutation-testing`, ...) is already a real `SKILL.md` file in exactly this format** (`/Users/akash/.claude/skills/tdd/SKILL.md` — YAML frontmatter `name:`/`description:`, then a markdown body). This is a genuinely real, already-in-use-in-this-environment standard, just not something `SemanticAgent` (an in-process LangChain agent, not a CLI harness) can adopt by installing a package.
- **LangChain's own "Skills" feature is a separate, related thing**: a hand-rolled *Python re-implementation* of the same progressive-disclosure idea for `langchain.agents.create_agent(...)`, not the literal `SKILL.md` file format. Confirmed from `docs.langchain.com/oss/python/langchain/multi-agent/skills-sql-assistant`'s actual code: a `Skill(TypedDict)` with `name`/`description`/`content` fields (an in-memory list, not files on disk), a `load_skill(skill_name: str) -> str` tool, and a `SkillMiddleware(AgentMiddleware)` whose `wrap_model_call` injects every skill's `name`+`description` into the system prompt upfront and lets the model pull a skill's full `content` into context on demand via `load_skill`. LangChain also ships a separate `langchain-ai/langchain-skills` GitHub repo installable via `npx skills add langchain-ai/langchain-skills ...` (per `langchain.com/blog/langchain-skills`) — that CLI installer is itself built on the real `agentskills.io`/`SKILL.md` open format, distributing pre-written `SKILL.md`-format skills into supported agent clients (including Claude Code). So there are genuinely two related-but-distinct things: the open file-format standard, and LangChain's own in-process middleware pattern for achieving the same *effect* inside a `create_agent(...)` loop.
- **Polanyi's `platform/skills/` (`skill.yaml` + `handler.py`) is a third, bespoke thing, confirmed by direct comparison** — `platform/skills/finance/fx-conversion/skill.yaml` has fields `name`, `capability`, `description`, `handler` (a Python function reference), `agent_tool: true`, `metadata` — a *tool-registration manifest*, not `SKILL.md`-compatible (no YAML+markdown instructions body, no progressive-disclosure semantics — `load_skills()` binds every `agent_tool: true` entry to the agent from turn one, confirmed in the v4 plan's correction 3). Nothing here changes what correction 3 already concluded; it just now cites the *real* standard by name instead of a vague "progressive disclosure" reference.
- **How this actually gets used in this plan** (see design decisions 10–13 below, "Self-contained specialist folders," and "Real progressive disclosure on the supervisor's own tool list"): each specialist is a genuinely self-contained `platform/specialists/<name>/` folder — a real `SKILL.md` (name, description, instructions) *plus its own `tools.py`* — and, separately, LangChain's own real `SkillMiddleware`/`load_skill` classes are wired onto the supervisor itself (Slice 4) for on-demand procedural knowledge, not tool-hiding. Both mechanisms are built in this plan, at the layer each actually fits.
- **Subagents pattern re-verified in full** against `docs.langchain.com/oss/python/langchain/multi-agent/subagents-personal-assistant` (previously only summarized from memory/the v4 plan; now read directly). Confirms the design below matches the docs' own recommended shape (worker `create_agent(...)` wrapped as one `@tool`, checkpointer on the supervisor only, subagents stateless) and surfaces two concrete requirements folded into the design decisions below: (a) the docs' own stated default is that **sub-agent internal tool calls do NOT surface to the supervisor** — "we return only the sub-agent's final response, as the supervisor doesn't need to see intermediate reasoning" — visible only via LangSmith tracing, which Polanyi doesn't use, hence design decision 7's deliberate deviation (forward via `on_event` instead); (b) "make sure sub-agent prompts emphasize that their final message should contain all relevant information — a common failure mode is sub-agents that perform tool calls but don't include the results in their final response" — folded into decision 12 below.
- **Router and Handoffs conclusions re-verified, unchanged**: `docs.langchain.com/oss/python/langchain/multi-agent/router-knowledge-base` confirms the `Annotated[list, operator.add]` reducer fix from the v4 plan's correction 2, and explicitly recommends "the subagents pattern... when you want the LLM to decide which agents to call dynamically" over Router for exactly this situation. `docs.langchain.com/oss/python/langchain/multi-agent/handoffs-customer-support` confirms Handoffs is for "workflows where an agent's behavior changes as it moves through different states of a task" with "clear sequential progression," not "arbitrary transitions" — and itself names subagents as the alternative for centralized orchestration of multiple specialized agents. Both conclusions were already correct; this is now backed by direct quotes rather than the earlier from-memory summary. (`docs.langchain.com/oss/python/langchain/knowledge-base` was also checked — it's an unrelated semantic-search/RAG tutorial, not a multi-agent index page; a dead end for this research, ruled out.)
- **`.opencode/plans/neo4j-graphdb-capability-integration-plan.md` (v4) correction 1 still governs**: `SemanticAgent`'s checkpointer (built in S10, with a live session-resume UI) must remain the *only* stateful conversational layer. This plan's entire design is built to satisfy that by construction — `SemanticAgent`'s own class does not change structurally in any slice below.

## Resolved Design Decisions

1. **Two specialists**: `ontology` (`search_ontology`, `expand_ontology`, `query_ontology` — GraphDB/FIBO) and `graph` (`query_knowledge_graph`, `search_knowledge_graph`, `graph_rag_query`, `graph_page_rank`, `find_graph_communities`, `find_similar_terms` — all Neo4j-based, retrieval + GDS together since it's only 6 tools). SQL tools and skill-plugin tools (e.g. `convert_currency`) stay directly on the supervisor — SQL is `SemanticAgent`'s native domain, and one skill-plugin tool doesn't justify a third specialist yet.
2. **No routing LLM.** `SemanticAgent`'s existing model+tool-calling loop *is* the supervisor. It sees `ask_ontology_specialist(question: str) -> str` and `ask_graph_specialist(question: str) -> str` instead of the 9 raw tools they wrap. `SemanticAgent.__init__`'s `create_agent(model=llm, tools=registry.agent_tools(), system_prompt=..., checkpointer=build_checkpointer())` call is untouched — the whole change lives in a new `packages/kernel/specialists.py` module plus `capabilities.py`'s registration.
3. **Specialists are stateless per-call** — fresh `create_agent(...).invoke({"messages": [HumanMessage(question)]})` each time, no checkpointer of their own. Matches LangChain's documented Subagents pattern exactly.
4. **Multi-specialist turns need no orchestration.** `SemanticAgent`'s existing single-turn tool-calling loop can call `ask_graph_specialist` then `ask_ontology_specialist` sequentially within one turn (e.g. "which FIBO class does the top-PageRank entity belong to?") exactly like it already sequences raw tool calls today. No `StateGraph`, no `Send`, no routing state field.
5. **Each specialist gets a focused `system_prompt`** — this, not just a smaller tool list, is the actual fix for the observed confusion.
6. **Model role: `resolve_llm("agent")` (stronger tier) for specialists too, not `resolve_llm("pipeline")`.** Corrected during Slice 1 implementation by live evidence, not assumed: against the real running GraphDB, the "pipeline" tier (`meta/llama-3.1-8b-instruct`) failed to sequence `search_ontology` → `expand_ontology` for "what are the subclasses of Bond?" — it returned "no subclasses found" despite 43 real ones existing (confirmed separately: both tools work correctly in isolation). The "agent" tier (`nemotron-super-49b`) sequenced them correctly and returned all 43 real subclasses. Specialists need the same multi-step tool-reasoning strength as the supervisor — a single-step question ("what is a Bond?") worked fine on either tier, but specialists exist specifically to handle the multi-tool-call questions a flat list made confusing, so the tier must match that job. Reuses the existing role convention in `packages/kernel/llm.py`, no new role.
7. **Observability must not regress.** `trace_from_messages` (`semantic_agent.py`) builds Studio's Agent Workspace trace from the supervisor's own `AIMessage.tool_calls`/`ToolMessage` pairs. Once ontology/graph tools sit behind a specialist, the supervisor's own message list would only show `tool_call: ask_ontology_specialist` → `tool_result: <final text>`, losing which raw tool the specialist called internally. `default_registry()` already accepts an `on_event` callback (wired to `SemanticAgent._steps.append`) — each specialist must forward its own internal tool_call/tool_result events through that same callback so the trace stays fully granular.
8. **Testing convention** (confirmed: no existing test constructs `SemanticAgent`/`create_agent` with a real or fake chat model — only deterministic wiring is unit-tested). Specialist factories are tested for plumbing — right tool subset, right system prompt, correct final-message extraction, `on_event` forwarding, no checkpointer — via monkeypatching `langchain.agents.create_agent` at its origin module (matches this codebase's established convention of patching origin-module attributes, e.g. `kg_module.Neo4jGraphStore`, rather than injecting constructor params).
9. **Superseded — see "Self-contained specialist folders" below.** Earlier draft of this plan had specialists coexist with the raw tools they wrap during slices 1–2, cutting over in a separate slice 3. Once each specialist folder owns its *own* tool code (decision 10), that two-step shape no longer applies — there's nothing left in `capabilities.py` to keep exposing directly once a specialist's tools live in its own folder. Each specialist slice is now its own direct, complete replacement of that domain's raw tools.
10. **Each specialist is a genuinely self-contained folder under `platform/specialists/`** — real `agentskills.io` format (`SKILL.md`: YAML frontmatter `name`+`description`, markdown instructions body) *plus its own bundled code* (`tools.py`: a `build_tools() -> list[BaseTool]` function). This is a stronger form of adoption than "SKILL.md for prompt text only" — the folder owns both what the specialist knows (instructions) and what it can do (tool implementations), matching the real spec's intent that a skill folder bundles its own `scripts/`. See "Self-contained specialist folders" below for the full design, mirroring `packages/kernel/skills.py`'s existing `platform/skills/` discovery convention exactly (same `importlib.util` dynamic-import technique, same per-item try/except resilience, same `CapabilityRegistry` registration).
11. **`description` from the `SKILL.md` frontmatter becomes the wrapper tool's own docstring/description** (`ask_ontology_specialist`'s `@tool`-visible description = the skill file's `description` field) — one authored sentence serves both the human editing the file and the supervisor deciding whether to call it, rather than maintaining the description twice.
12. **Specialist system prompts must end with an explicit final-message-completeness instruction** (per the subagents docs' own stated failure mode): "Your final message must contain the complete answer/data — the supervisor only sees your last message, not your tool calls." This is a real, concrete requirement, not boilerplate — folded into both `SKILL.md` files' instructions body.
13. **`tools.py` is genuinely self-contained — no reach-back into `capabilities.py`.** `build_tools()` constructs its own store (`GraphDBOntologyStore()`, `Neo4jGraphStore()`) the same zero-arg, env-var-driven way those classes already work everywhere else in this codebase, and explicitly checks `graphdb_configured()`/`neo4j_configured()` itself, raising a clear error if absent. This is safe against the hang class this session already fixed twice (GDS's eager version-check, `Neo4jGraphStore`'s default `connection_timeout`) — confirmed by re-reading both constructors: neither makes an eager network call in `__init__` (`GraphDatabase.driver(...)` is lazy; `GraphDBOntologyStore.__init__` only raises on a *missing* endpoint, no network I/O). The loader's per-specialist `try/except` (mirroring `load_skills()`) is the safety net if a specialist's own backend genuinely isn't configured — one broken specialist must not block the others or the registry build.

## Self-contained specialist folders

Mirrors `packages/kernel/skills.py`'s existing `platform/skills/` discovery convention (confirmed by direct read: `rglob("skill.yaml")`, dynamic import via `importlib.util.spec_from_file_location`, per-item `try/except Exception: logger.warning(...); continue`, registration into `CapabilityRegistry`) — same technique, same resilience, applied to multi-tool specialist folders using the real `SKILL.md` format instead of the bespoke `skill.yaml`.

**Folder layout:**

```
platform/specialists/
├── ontology/
│   ├── SKILL.md      # name, description, instructions (the system prompt)
│   └── tools.py       # build_tools() -> list[BaseTool] — its own bundled code
└── graph/
    ├── SKILL.md
    └── tools.py
```

**`platform/specialists/ontology/SKILL.md`** — real Agent Skills format, same shape as `/Users/akash/.claude/skills/tdd/SKILL.md`:

```markdown
---
name: ontology
description: FIBO ontology specialist. Searches and expands ontology classes via GraphDB SPARQL. Use for FIBO class hierarchy, definition, or alignment questions.
---

You are a FIBO ontology expert. Use your tools to search classes by business
term, expand class hierarchies, and run read-only SPARQL when needed.

Be concise. If you cannot find an answer, say so clearly rather than guessing.

Your final message must contain the complete answer — the supervisor only
sees your last message, not your tool calls.
```

**`platform/specialists/ontology/tools.py`** — genuinely self-contained, constructs its own store, no dependency on `capabilities.py`:

```python
"""Ontology specialist's own tools — self-contained bundled code, not a
reach-back into capabilities.py. Constructs its own GraphDBOntologyStore
the same zero-arg, env-var-driven way that class already works everywhere
else in this codebase."""

from __future__ import annotations


def build_tools() -> list:
    from langchain.tools import tool
    from polanyi.semantic.ontology import (
        GraphDBOntologyStore,
        graphdb_configured,
        guard_sparql,
    )

    if not graphdb_configured():
        raise RuntimeError("GraphDB not configured (GRAPHDB_ENDPOINT unset)")

    store = GraphDBOntologyStore()

    @tool
    def search_ontology(term: str) -> str:
        """Search FIBO ontology classes in GraphDB by business term."""
        return str(store.search_classes(term))

    @tool
    def expand_ontology(uri: str) -> str:
        """Expand an ontology class URI to all its transitive subclasses."""
        return str(store.expand_subclasses(uri))

    @tool
    def query_ontology(sparql: str) -> str:
        """Run read-only SPARQL against the FIBO ontology repository."""
        violation = guard_sparql(sparql)
        if violation:
            return f"QUERY BLOCKED: {violation}"
        try:
            rows = store.sparql_query(sparql)
        except Exception as exc:  # noqa: BLE001
            return f"Error: {exc}"
        return str(rows[:50])

    return [search_ontology, expand_ontology, query_ontology]
```

(`platform/specialists/graph/tools.py` is the same shape, using `Neo4jGraphStore`/`neo4j_configured` and the 6 graph tool bodies already live in `capabilities.py` today — relocated, not rewritten.)

**`packages/kernel/specialists.py`** (new loader module, sibling to `skills.py`, generic — adding a third specialist later means adding a folder here, no code changes to this file):

```python
"""Specialist subagents: drop a folder into platform/specialists/ and
Polanyi Works discovers it — the real agentskills.io SKILL.md format
applied to multi-tool specialist sub-agents, mirroring skills.py's
platform/skills/ discovery convention exactly.

A specialist directory contains:
    SKILL.md   name + description frontmatter, markdown instructions body —
               becomes the specialist's own create_agent(...) system prompt
    tools.py   a build_tools() -> list[BaseTool] function — the specialist's
               own bundled code, no dependency on capabilities.py

Each discovered specialist becomes ONE @tool (ask_<name>_specialist) — a
stateless create_agent(...) worker (LangChain's documented Subagents
pattern: fresh context per call, checkpointer stays on the supervisor
only). Internal tool_call/tool_result events forward to on_event so
Studio's Agent Workspace trace stays granular — a deliberate deviation
from the docs' own default (they rely on LangSmith tracing instead;
Polanyi doesn't use it).
"""

from __future__ import annotations

import importlib.util
import logging
import os
import re
from pathlib import Path
from typing import Any, Callable, Optional

from polanyi.kernel.capabilities import CapabilityProvider, CapabilityRegistry

logger = logging.getLogger(__name__)

DEFAULT_SPECIALISTS_DIR = "platform/specialists"

_FRONTMATTER = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.DOTALL)


def parse_skill_md(text: str) -> tuple[str, str, str]:
    """(name, description, instructions) from a real SKILL.md file — simple
    scalar frontmatter fields, the same shape as every skill this project's
    own CLAUDE.md already loads."""
    match = _FRONTMATTER.match(text)
    if not match:
        raise ValueError("SKILL.md must start with --- frontmatter ---")
    frontmatter, body = match.groups()
    fields = dict(
        line.split(":", 1) for line in frontmatter.strip().splitlines() if ":" in line
    )
    return fields["name"].strip(), fields["description"].strip(), body.strip()


def load_specialists(
    registry: CapabilityRegistry,
    on_event: Optional[Callable[[Any], None]] = None,
    specialists_dir: str | None = None,
) -> list[str]:
    """Discover and register every valid specialist under `specialists_dir`."""
    root = Path(
        specialists_dir or os.environ.get("POLANYI_SPECIALISTS_DIR", DEFAULT_SPECIALISTS_DIR)
    )
    if not root.is_dir():
        return []

    loaded: list[str] = []
    for skill_md_path in sorted(root.rglob("SKILL.md")):
        try:
            name = _load_one(registry, skill_md_path, on_event)
        except Exception as exc:  # noqa: BLE001 — one broken specialist must not kill the rest
            logger.warning("Skipping specialist at %s: %s", skill_md_path.parent, exc)
            continue
        loaded.append(name)
    return loaded


def _load_one(
    registry: CapabilityRegistry,
    skill_md_path: Path,
    on_event: Optional[Callable[[Any], None]],
) -> str:
    name, description, instructions = parse_skill_md(
        skill_md_path.read_text(encoding="utf-8")
    )

    tools_file = skill_md_path.parent / "tools.py"
    module_name = f"polanyi_specialist_{name.replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(module_name, tools_file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    tools = module.build_tools()

    wrapped = build_specialist_tool(name, description, instructions, tools, on_event)

    registry.register(
        CapabilityProvider(
            name=f"specialist-{name}",
            capability=f"Ask{name.title()}Specialist",
            kind="tool",
            description=description,
            handler=wrapped,
            metadata={"source": "specialist", "path": str(skill_md_path.parent)},
        )
    )
    return name


def build_specialist_tool(
    name: str,
    description: str,
    instructions: str,
    tools: list,
    on_event: Optional[Callable[[Any], None]] = None,
) -> Any:
    """One @tool wrapping a stateless create_agent(...) worker. resolve_llm
    is checked per-call (not cached at build time), using the "agent" tier
    -- not "pipeline" -- since specialists need the same multi-step
    tool-reasoning strength as the supervisor (see design decision 6)."""
    from langchain.tools import tool as make_tool

    def ask(question: str) -> str:
        from polanyi.kernel.llm import resolve_llm

        llm = resolve_llm("agent")
        if llm is None:
            return (
                f"The {name} specialist needs an LLM to answer, and none is "
                "configured. Set NVIDIA_API_KEY, OPENAI_API_KEY, or "
                "DATABRICKS_TOKEN + DATABRICKS_SERVING_ENDPOINT."
            )

        from langchain.agents import create_agent
        from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

        agent = create_agent(model=llm, tools=tools, system_prompt=instructions)
        result = agent.invoke({"messages": [HumanMessage(content=question)]})
        messages = result["messages"]
        if on_event is not None:
            from polanyi.models import AgentStep

            for message in messages:
                if isinstance(message, AIMessage):
                    for call in message.tool_calls or []:
                        on_event(AgentStep(
                            kind="tool_call", name=call["name"],
                            detail=str(call.get("args", {}))[:500],
                        ))
                elif isinstance(message, ToolMessage):
                    on_event(AgentStep(
                        kind="tool_result", name=str(message.name or "tool"),
                        detail=str(message.content)[:500],
                    ))
        return str(messages[-1].content) if messages else ""

    wrapped = make_tool(ask)
    wrapped.name = f"ask_{name}_specialist"
    wrapped.description = description
    return wrapped
```

**`capabilities.py`'s `default_registry()`** then loses its entire `search_ontology`/`expand_ontology`/`query_ontology` block and its 6-tool graph block, replaced by one call (placed where `load_skills(registry)` already runs, at the end of `default_registry()`):

```python
from polanyi.kernel.specialists import load_specialists
load_specialists(registry, on_event=on_event)
```

**Real limitation, worth stating plainly**: `llm is None` (no LLM configured) is not handled by `build_specialist_tool` above — unlike `SemanticAgent.__init__`'s explicit check, a specialist with no LLM configured would fail inside `create_agent(model=None, ...)` at call time, not at registration time. Slice 1's RED tests must cover this — `resolve_llm("agent")` returning `None` should surface as an honest, clear message from the wrapped tool, not a raw `AttributeError`/`TypeError` from `create_agent`.

## Real progressive disclosure on the supervisor's own tool list (Slice 4)

Built, not deferred (per your explicit ask) — LangChain's actual `SkillMiddleware`/`load_skill` pattern (confirmed via direct code extraction from `skills-sql-assistant`), applied to a different layer than slices 1–2. Specialists (slices 1–2) use their own `SKILL.md` directly as `system_prompt` — no middleware, no on-demand loading, because a specialist should have its full instructions from the start. This slice is genuinely different: it's the **supervisor's own** `create_agent(...)` call in `SemanticAgent.__init__` that gains `SkillMiddleware`, for **procedural knowledge** the supervisor rarely needs but shouldn't always pay context for — not for hiding tools (tools stay bound either way).

**First skill: `disambiguation`** — guidance for when a question needs both specialists in one turn, e.g. "which FIBO class does the term with the highest PageRank score belong to?" (graph specialist finds the top term, ontology specialist classifies it). This is exactly the kind of detail too specific to always inline in the supervisor's system prompt but valuable when a cross-domain question actually shows up.

**New directory, distinct from the other two skill mechanisms already in this codebase** — three, now genuinely different in kind:
- `platform/skills/*/skill.yaml` + handler.py → single opt-in **tool**, bound directly (existing, e.g. `fx-conversion`)
- `platform/specialists/*/SKILL.md` + `tools.py` → sub-agent wrapped as **one tool** (slices 1–2)
- `platform/agent-skills/*/SKILL.md` (content only, no code) → on-demand **procedural knowledge** for the supervisor (this slice)

**`platform/agent-skills/disambiguation/SKILL.md`**:

```markdown
---
name: disambiguation
description: When to consult the ontology specialist, the graph specialist, or both for a question that could span domains.
---

Some questions need both the ontology specialist and the graph specialist
in the same turn — for example, "which FIBO class does the term with the
highest PageRank score belong to?" needs the graph specialist to find the
top-ranked term first, then the ontology specialist to classify it.

Call ask_graph_specialist first for anything about structure, similarity,
or centrality in the knowledge graph. Call ask_ontology_specialist for
anything about FIBO class hierarchy or definitions. If a question needs
both, call them in sequence, using the first specialist's answer to form
the second specialist's question.
```

**`packages/kernel/agent_skills.py`** (new — reuses `parse_skill_md` from `specialists.py`, since both mechanisms consume the identical real `SKILL.md` format):

```python
"""Content-only Agent Skills for the supervisor's own SkillMiddleware —
procedural knowledge loaded on demand via LangChain's real load_skill
pattern. Distinct from specialists.py's folders (SKILL.md used directly
as a system prompt, no middleware, no tools.py — this mechanism adds
knowledge to the supervisor's context, not new callable capability)."""

from __future__ import annotations

import os
from pathlib import Path
from typing import TypedDict

from polanyi.kernel.specialists import parse_skill_md

DEFAULT_AGENT_SKILLS_DIR = "platform/agent-skills"


class Skill(TypedDict):
    name: str
    description: str
    content: str


def load_agent_skills(skills_dir: str | None = None) -> list[Skill]:
    """Every valid SKILL.md under `skills_dir`, in the exact Skill(TypedDict)
    shape LangChain's real SkillMiddleware/load_skill code expects."""
    root = Path(
        skills_dir or os.environ.get("POLANYI_AGENT_SKILLS_DIR", DEFAULT_AGENT_SKILLS_DIR)
    )
    if not root.is_dir():
        return []
    return [
        Skill(name=name, description=description, content=content)
        for name, description, content in (
            parse_skill_md(p.read_text(encoding="utf-8"))
            for p in sorted(root.rglob("SKILL.md"))
        )
    ]
```

**`SemanticAgent.__init__`'s one-line change** (the *only* code this plan touches in that file — everything else about it, including the checkpointer, is unchanged):

```python
from polanyi.kernel.agent_skills import load_agent_skills
from polanyi.kernel.skill_middleware import SkillMiddleware, load_skill  # exact import path TBD — see note below

skills = load_agent_skills()
middleware = [SkillMiddleware(skills)] if skills else []  # no skills configured -> no pointless middleware

self._agent = create_agent(
    model=llm,
    tools=registry.agent_tools(),
    system_prompt=system_prompt,
    middleware=middleware,
    checkpointer=build_checkpointer(),
)
```

**Real open item, must be resolved in Slice 4's own RED phase, not assumed**: the tutorial's `SkillMiddleware(AgentMiddleware)` is example code for the reader to adapt, not an importable LangChain class — Polanyi must write its own small (~20 line) version. `AgentMiddleware`'s real base class and `wrap_model_call`'s real signature need to be checked directly against the actually-installed `langchain` package (same discipline already applied to `neo4j-graphrag` in S19 — verify the real API before writing code against it, never assume from a doc summary) before any implementation. This is a live risk worth naming now rather than discovering mid-slice.

## Open Knowledge Format (OKF) export

Researched directly (not from memory): [`GoogleCloudPlatform/knowledge-catalog`'s `okf/SPEC.md`](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md) (v0.1, draft) and [`tractorjuice/arc-kit`](https://github.com/tractorjuice/arc-kit). This is a **different thing from `agentskills.io`/`SKILL.md`** — not agent capability packaging, but a knowledge/data-catalog format: a directory of markdown files representing facts *about the world* (tables, business concepts, metrics), not instructions for an agent's own behavior. Genuinely relevant to Polanyi specifically, since Polanyi's core domain — glossary terms, FIBO alignments, entity/relationship graph, ingested documents — *is* exactly the kind of knowledge OKF represents.

**What OKF actually specifies** (confirmed by reading the real spec):
- A **bundle** is a directory tree of markdown files. Each **concept** = one file: YAML frontmatter (`type` — REQUIRED; `title`, `description`, `resource` (a URI for the underlying asset, when the concept describes one), `tags`, `timestamp` — all recommended, all optional) + a free-form markdown body.
- Cross-linking is **plain markdown links** — bundle-relative (`/tables/customers.md`) or path-relative — untyped; meaning comes from surrounding prose. Consumers MUST tolerate broken links.
- Conventional (not required) body section headings: `# Schema`, `# Examples`, `# Citations`.
- `index.md` (reserved filename, no frontmatter except optionally `okf_version` at the bundle root) enumerates a directory's concepts for progressive disclosure. `log.md` (reserved) is a date-grouped changelog.
- **Conformance is deliberately minimal and permissive** (§9): a bundle is conformant if every concept has parseable frontmatter with a non-empty `type`. Consumers MUST NOT reject a bundle for unknown types, missing optional fields, or broken links.

**`tractorjuice/arc-kit`** is a large, unrelated enterprise-architecture-governance toolkit (UK-government-flavored — HM Treasury business cases, Wardley Mapping, RFPs, ServiceNow design) — not itself relevant to Polanyi's domain. What *is* relevant: it ships real, working `/arckit:export-okf` and `/arckit:import-okf` commands, converting its own artifacts to/from OKF-shaped frontmatter — a live proof that OKF works as a genuine interop format between independent tools, not just a paper spec.

**Where this fits Polanyi**: an **export** of `SemanticContext` into a real, conformant OKF bundle — portable, git-diffable, human-readable, consumable by any OKF-aware tool independent of Polanyi's own Neo4j/GraphDB runtime. This is additive and separate from the specialist/`SKILL.md` work above — different problem (knowledge portability, not agent tool-selection or context bloat).

**Real, explicit scoping corrections after review — this must ship as a genuine vertical slice, not a backend-only module:**

- **Not a `SemanticAgent` tool.** Exporting the glossary to files is a deterministic bulk operation with one correct outcome — a UI button + API call does it cheaper, faster, and more auditable than routing it through an LLM, the same reasoning that keeps SQL validation itself LLM-optional throughout this project. No `export_okf_bundle` tool gets registered anywhere.
- **`tractorjuice/arc-kit` is never embedded in Polanyi's UI or runtime.** It's a separate, independent tool (its own CLI/plugin ecosystem, a large and mostly UK-government-flavored enterprise-architecture toolkit unrelated to Polanyi's domain) that happens to speak the same file format via its own `/arckit:export-okf`/`/arckit:import-okf` commands. The only real connection: someone running ArcKit *separately* could import a bundle Polanyi exports. Nothing from ArcKit runs inside Polanyi.
- **A real UI/API surface is part of this slice's acceptance criteria, not a deferred follow-up.** No download mechanism of any kind exists anywhere in `studio-v1` today (checked directly — no `Blob`/`createObjectURL`/`download=` pattern anywhere) — treating "wire it up" as mechanical and non-blocking would have shipped a Python function nobody could actually invoke, the exact horizontal-work anti-pattern this whole plan's own slicing discipline has avoided everywhere else. `POST /api/okf/export` streams a real zip (Python's stdlib `zipfile` — no new dependency; OKF's own spec §3 explicitly names "a tarball or zip archive of the directory" as a valid distribution form) built from `export_okf_bundle()`'s output; a real "Export as OKF bundle" button on `GlossaryPage` (the page most directly tied to what's being exported — no need to wait for the far-off, differently-sequenced S14 Overview dashboard) triggers the download via the standard `Blob` + `createObjectURL` + `<a download>` pattern. This also transparently satisfies S14's own already-planned-but-unbuilt "Export context" action later, for free, via the same endpoint.
- **OKF *import* would be the genuinely agentic direction, deliberately not built here.** A future specialist could search an imported OKF bundle as an additional knowledge source — real, but separate scope (needs an import pipeline + merge/search logic against Polanyi's existing glossary), named honestly as a later possibility, not conflated with this export-only slice.

**New module `packages/semantic-runtime/semantic/okf_export.py`** (grounded in the real `GlossaryEntry`/`EntityRelationship` shapes in `packages/common/models.py`, not guessed):

```python
"""OKF (Open Knowledge Format v0.1) export: serializes a SemanticContext
into a real, conformant OKF bundle -- portable markdown files any
OKF-aware tool can consume (e.g. ArcKit's /arckit:import-okf),
independent of Polanyi's own Neo4j/GraphDB runtime."""

from __future__ import annotations

import re
from pathlib import Path

from polanyi.models import EntityRelationship, GlossaryEntry, SemanticContext


def _slugify(text: str) -> str:
    """Same rule knowledge_graph.py's document_materialization_statements
    already uses for doc_slug -- one slugify convention, not two."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def glossary_concept_markdown(entry: GlossaryEntry) -> str:
    """resource/# Citations appear only for an actually FIBO-aligned term
    -- never fabricated for an unaligned one (same discipline as
    build_agent_prompt's FIBO line)."""
    lines = ["---", "type: Glossary Term", f"title: {entry.term}",
             f"description: {entry.definition}"]
    if entry.ontology_uri:
        lines.append(f"resource: {entry.ontology_uri}")
    tags = ["glossary"] + ([entry.unit] if entry.unit else [])
    lines += [f"tags: [{', '.join(tags)}]", "---", "", entry.definition]
    if entry.source_tables:
        links = ", ".join(f"[{t}](/tables/{_slugify(t)}.md)" for t in entry.source_tables)
        lines += ["", f"Found in: {links}"]
    if entry.ontology_class and entry.ontology_uri:
        lines += ["", "# Citations", "", f"[1] [FIBO: {entry.ontology_class}]({entry.ontology_uri})"]
    return "\n".join(lines) + "\n"


def table_concept_markdown(entity_name: str, relationships: list[EntityRelationship]) -> str:
    """Cross-linked to FK-related tables via the real relationships
    SemanticContext already carries. Column-level `# Schema` needs
    introspect(db_uri) output too -- not this slice's scope, an honest
    gap rather than a fabricated section."""
    lines = ["---", "type: Database Table", f"title: {entity_name}", "tags: [table]",
             "---", "", f"# {entity_name}"]
    related = [r for r in relationships if entity_name in (r.from_entity, r.to_entity)]
    if related:
        lines += ["", "# Relationships", ""]
        for r in related:
            other = r.to_entity if r.from_entity == entity_name else r.from_entity
            lines.append(f"- {r.description} ([{other}](/tables/{_slugify(other)}.md), via `{r.foreign_key}`)")
    return "\n".join(lines) + "\n"


def index_markdown(entries: list[tuple[str, str, str]], okf_version: str | None = None) -> str:
    """entries: (title, relative_path, description). okf_version is only
    ever set on the bundle-root index.md (SPEC.md sec. 11 -- the one
    place frontmatter is permitted in an index.md)."""
    lines = []
    if okf_version:
        lines += ["---", f'okf_version: "{okf_version}"', "---", ""]
    lines.append("# Contents")
    lines += [f"* [{title}]({path}) - {description}" for title, path, description in entries]
    return "\n".join(lines) + "\n"


def export_okf_bundle(context: SemanticContext, output_dir: Path) -> dict[str, int]:
    """The only I/O in this module -- writes a real, conformant OKF v0.1
    bundle. Returns real counts, never guessed."""
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "glossary").mkdir(exist_ok=True)
    (output_dir / "tables").mkdir(exist_ok=True)

    entries = []
    for entry in context.glossary:
        slug = _slugify(entry.term)
        (output_dir / "glossary" / f"{slug}.md").write_text(
            glossary_concept_markdown(entry), encoding="utf-8"
        )
        entries.append((entry.term, f"glossary/{slug}.md", entry.definition))

    for name in sorted(set(context.key_entities)):
        slug = _slugify(name)
        (output_dir / "tables" / f"{slug}.md").write_text(
            table_concept_markdown(name, context.relationships), encoding="utf-8"
        )
        entries.append((name, f"tables/{slug}.md", f"{name} table"))

    (output_dir / "index.md").write_text(
        index_markdown(entries, okf_version="0.1"), encoding="utf-8"
    )
    return {"glossary": len(context.glossary), "tables": len(set(context.key_entities))}
```

**`is_okf_conformant(bundle_dir: Path) -> bool`** — implements SPEC.md §9's own conformance rule literally (every non-reserved `.md` file has parseable frontmatter with a non-empty `type`) — a genuinely spec-grounded regression check, not an invented one, and reusable to verify the export never regresses into producing an invalid bundle.

**Real, explicit scoping decision — documents are excluded from this slice, and why**: `document_concept_markdown(doc: IngestedDocument)` is a natural extension (mapping `ExtractedMention.resolved_term` to real `/glossary/<term>.md` cross-links — the exact same knowledge S9 already extracts), but S9's own checklist entry already recorded the real blocker: *"no document history/list — `document_to_rdf` only persists mentions/metadata, not the original text, so a genuine revisit-a-past-doc view isn't honestly buildable without a separate text store."* The same blocker applies here — a bulk historical OKF export of documents isn't honestly buildable today. Deferred until that storage gap is closed (a separate, already-known parking-lot item, not new scope this plan introduces).

## OKF bundle persistence, browse/view/edit UI, and the real ArcKit relationship

**Correction after review, refined further below**: ArcKit's actual mechanics, checked directly: its `arckit` CLI has exactly one standalone (non-chat) command — `arckit init`, project scaffolding. Every real governance command — including `/arckit:export-okf`/`/arckit:import-okf` — is a **chat slash-command**, meaningful only inside a full coding-agent harness (Claude Code, Copilot Chat, Codex, Mistral Vibe) with file/shell access. There is no REST API and no importable package for these operations. What *is* real: Claude Code (and the other harnesses ArcKit supports) has a headless/non-interactive invocation mode — a backend process can shell out, drive a real session with a slash-command prompt, and capture what it produces. So a Studio-triggered, backend-executed ArcKit run is genuinely buildable — see "OKF Workspaces" below — it just isn't a simple API call; it's a real, sandboxed, billed agentic session, which changes the shape of the feature considerably (async job model, cost controls, isolation), not just its plumbing.

**The baseline, always-available equivalent, independent of any workspace feature**: Polanyi's own OKF bundle viewer/editor opens, browses, and edits *any* conformant OKF bundle — including one a user separately produced with ArcKit's own `/arckit:export-okf` (run in their own Claude Code/Copilot/Codex session, or via the sandboxed workspace below) and uploads or imports here.

**Grounded against the real codebase before designing**: no markdown renderer exists anywhere in `studio-v1` today (confirmed — `react-markdown` is a new, small, directly-justified dependency, since "view" specifically means rendering markdown, not raw text with visible `#`/`**` characters); no file-upload pattern exists yet (a plain `<input type="file">` + `FormData` + fetch POST is the standard mechanism, no library needed); `semantics/knowledge/` is Polanyi's real, already-used local artifact store (`financial_demo.db`, `semantic-models/`, `documents/`, `embeddings/`, `graphs/`, `owl/`, `rdf/`, `vectors/`, `indexes/`, `cache/` all already live there) — a new `semantics/knowledge/okf/` subdirectory is the natural, consistent home for a persisted bundle, not an invented new convention.

**Real design correction versus the earlier `okf_export.py` sketch**: OKF frontmatter needs genuine YAML parsing (`tags` is a list; producers can add arbitrary nested keys) — the ad-hoc `line.split(":", 1)` approach used for `SKILL.md`'s simple two-scalar-field case is not sufficient here. Use `yaml.safe_load()` on the frontmatter block, exactly matching `packages/kernel/skills.py`'s own existing convention for `skill.yaml` (`manifest = yaml.safe_load(manifest_path.read_text(...))`) — `pyyaml` is already a direct dependency (`pyproject.toml`), no new one needed. Full slice detail (6, 7, 8) is under "## Slices" below, in sequence after Slice 5.

## Acceptance Criteria (whole feature)

- [ ] `SemanticAgent`'s visible tool list no longer contains the 9 raw ontology/graph tools directly — only `ask_ontology_specialist` and `ask_graph_specialist` (plus SQL + skill-plugin tools)
- [ ] Both specialists answer real questions correctly against the live GraphDB/Neo4j instances (not mocked)
- [ ] A single conversational turn requiring both specialists resolves correctly with no new orchestration code
- [ ] Studio's Agent Workspace trace still shows the specialist's internal tool calls, not just the specialist's final answer
- [ ] `SemanticAgent.__init__`'s diff is empty through slices 1–2, and exactly one line (`middleware=[...]`) through slice 4 — no other structural change, the checkpointer remains the only stateful layer
- [ ] `SkillMiddleware`/`load_skill` are real, working LangChain middleware — the `disambiguation` skill loads on demand and a real cross-specialist question answers correctly using it
- [ ] All existing tests updated to reflect the new registry shape (not left stale alongside new tests)

## Slices

Every slice follows RED-GREEN-MUTATE-KILL MUTANTS-REFACTOR. No production code without a failing test.

### Slice 1: `packages/kernel/specialists.py` loader + ontology specialist folder fully replace the 3 raw ontology tools

**Value**: `SemanticAgent` gains a self-contained, folder-based ontology specialist with a focused system prompt — the actual fix for that domain's share of the observed confusion — and the codebase gains a real, reusable specialist-discovery mechanism (adding a third specialist later needs no `capabilities.py` changes).
**Path**: `platform/specialists/ontology/SKILL.md` + `tools.py` (both new, per the design above) → `packages/kernel/specialists.py`'s `parse_skill_md`/`load_specialists`/`build_specialist_tool` (new module) → `capabilities.py`'s `default_registry()` calls `load_specialists(registry, on_event=on_event)` once, replacing the current inline `search_ontology`/`expand_ontology`/`query_ontology` registration block entirely → real invocation against the live GraphDB `fibo` repository.
**Required implementation skills**: Before code changes, load `tdd`, `testing`, `mutation-testing`, and `refactoring`.
**Acceptance criteria** (needs your confirmation before any code):
- `parse_skill_md` correctly extracts `(name, description, instructions)` from real `SKILL.md` content (frontmatter + body), and raises a clear error for malformed content (missing frontmatter delimiters, missing `name`/`description` fields)
- `load_specialists(registry)` discovers `platform/specialists/ontology/`, registers `ask_ontology_specialist` as a `kind="tool"` `CapabilityProvider`, and its `description` matches the `SKILL.md` frontmatter exactly
- A specialist whose `tools.py` raises (e.g. `graphdb_configured()` is false) is skipped with a logged warning — the registry build itself does not fail, and no other specialist's registration is affected (mirrors `load_skills()`'s existing per-skill resilience test pattern)
- The specialist's own `create_agent(...)` call receives exactly the 3 ontology tools built by `tools.py`'s `build_tools()`, the `SKILL.md` instructions as `system_prompt`, and no `checkpointer` kwarg
- Two separate `ask_ontology_specialist` invocations do not see each other's messages (stateless — a fresh `create_agent(...).invoke(...)` per call)
- Invoking `ask_ontology_specialist` with a question that internally requires calling `search_ontology` forwards a real `tool_call`/`tool_result` pair for `search_ontology` to `on_event` — not just the specialist's own final answer
- `resolve_llm("agent")` returning `None` (no LLM configured) surfaces as an honest message from `ask_ontology_specialist`, not a raw exception from inside `create_agent`
- `search_ontology`/`expand_ontology`/`query_ontology` no longer appear as separate top-level entries in `registry.agent_tools()` — they're internal to the specialist now; every existing `test_capabilities.py` assertion that expected them directly is updated to expect their absence and `ask_ontology_specialist`'s presence instead
- Live-verified against the real running GraphDB: a real question (e.g. "what are the subclasses of bond?") returns a real, correctly-grounded answer citing real FIBO classes, via the actual `platform/specialists/ontology/` folder (not a mock)
**RED**: Failing tests for (a) `parse_skill_md`'s frontmatter parsing (pure function, no I/O — the mutator-aware gaps: wrong field extraction, frontmatter-delimiter boundary off-by-one, missing-field error path), (b) `load_specialists`'s discovery/registration/resilience against a temp directory with a real minimal `SKILL.md`+`tools.py` pair (and a second, deliberately-broken one to prove the try/except isolation), (c) `build_specialist_tool`'s plumbing (tool subset, system prompt, no checkpointer, final-message extraction, `on_event` forwarding, statelessness across two calls, the no-LLM-configured honest-degrade path) via a fake object standing in for `create_agent`'s return value, monkeypatched at `langchain.agents.create_agent`, and (d) updates to the existing raw-ontology-tool-presence assertions in `test_capabilities.py` to their new expected (currently failing) shape.
**GREEN**: `platform/specialists/ontology/SKILL.md` + `tools.py`, `packages/kernel/specialists.py`, and the one-line swap in `capabilities.py`.
**MUTATE**: Run `mutation-testing` skill — produce a report.
**KILL MUTANTS**: Address survivors (ask when ambiguous).
**REFACTOR**: Assess after mutation testing confirms test strength — is `specialists.py` generic enough to load slice 2's graph specialist with zero changes (it should be, by design), or does something in it turn out to be ontology-specific and need broadening? Decide with slice 2's real requirements in hand, not preemptively.
**Done when**: All acceptance criteria met, mutation report reviewed, live verification shown, you approve the commit.

### Slice 2: Graph specialist folder fully replaces the 6 raw graph tools, reusing `specialists.py` unchanged

**Value**: Same category of value as slice 1, for the Neo4j/GDS/GraphRAG domain — the second (and, per today's tool count, final) specialist, independently reviewable/revertible.
**Path**: `platform/specialists/graph/SKILL.md` + `tools.py` (the 6 existing graph tool bodies — `query_knowledge_graph`, `search_knowledge_graph`, `graph_rag_query`, `graph_page_rank`, `find_graph_communities`, `find_similar_terms` — relocated from `capabilities.py`, not rewritten) → discovered by the *same*, unmodified `load_specialists()` from slice 1.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Acceptance criteria** (needs your confirmation before any code):
- `ask_graph_specialist` appears in `registry.agent_tools()` when Neo4j is configured, absent otherwise
- The 6 raw graph tools no longer appear as separate top-level entries — every existing test asserting their direct presence (including the GDS-plugin-availability-gated ones from S18) is updated
- The specialist's `create_agent(...)` call receives exactly the 6 graph tools, the graph-specific system prompt, no checkpointer
- Internal tool_call/tool_result events forward to `on_event`, including for the GDS tools (which have their own real-vs-empty-result honest-degrade behavior from S18 — that behavior must survive the relocation unchanged)
- Live-verified against the real running Neo4j: a real question exercising at least one retrieval tool and one GDS tool (e.g. "which term is most similar to Realized Pnl, and how central is it in the graph?") returns a real, correctly-grounded answer
**RED/GREEN/MUTATE/KILL MUTANTS**: Same shape as slice 1, using `specialists.py` as-is. Extra mutator-aware attention here: the GDS tools' existing honest-degrade paths (empty results when the plugin isn't installed server-side, from S18) and the graph-tool registration's existing gate on `gds_plugin_available(gds)` must be preserved exactly during relocation — a real risk of "moved the code, subtly changed the gating condition."
**REFACTOR**: Assess whether `capabilities.py` is meaningfully smaller/clearer now that both raw-tool blocks are gone (it should be — this was the whole point) and whether anything in `_register_optional_backends` beyond the SQL tools and `load_skills()`/`load_specialists()` calls still belongs there.
**Done when**: All acceptance criteria met, mutation report reviewed, live verification shown, you approve the commit.

### Slice 3: Cross-specialist turn proven live; whole-feature acceptance criteria verified

**Value**: Confirms the actual stated problem is fixed — a real end-to-end proof that the leaner ~6-tool supervisor still handles a question spanning both domains correctly, with no new orchestration code.
**Path**: No new production code expected (this slice is primarily verification) — unless live-verification surfaces a real gap, in which case it becomes a small, named fix with its own RED/GREEN.
**Required implementation skills**: `tdd`, `testing` (if a gap surfaces), `refactoring`.
**Acceptance criteria** (needs your confirmation before any code, if any is needed):
- `registry.agent_tools()` contains exactly `ask_ontology_specialist`, `ask_graph_specialist`, the 3 SQL tools, and any skill-plugin tools — none of the 9 original raw names
- `SemanticAgent.__init__`'s own diff across all of slices 1–2 is empty (confirms the checkpointer was never touched)
- Live-verified against a real `SemanticAgent` (real LLM key, real GraphDB, real Neo4j): a single conversational turn requiring both specialists (e.g. "which FIBO class does the term with the highest PageRank score belong to?") produces a correct answer, and Studio's Agent Workspace trace (`trace_from_messages`) shows the internal `search_ontology`/`graph_page_rank`-level steps via the forwarded `on_event` calls, not just two opaque specialist calls
**Done when**: All acceptance criteria met, the cross-specialist live-verification transcript shown, you approve.

### Slice 4: Real progressive disclosure — `SkillMiddleware`/`load_skill` on the supervisor, `disambiguation` skill

**Value**: The supervisor gains detailed cross-specialist guidance without paying for it on every turn — genuine adoption of LangChain's real progressive-disclosure mechanism, layered on top of (not instead of) the Subagents split from slices 1–2.
**Path**: `platform/agent-skills/disambiguation/SKILL.md` (new) → `packages/kernel/agent_skills.py`'s `load_agent_skills()` (new, reuses `parse_skill_md` from `specialists.py`) → a small Polanyi-authored `SkillMiddleware(AgentMiddleware)` + `load_skill` tool (new — adapted from the real tutorial's shown code, not imported from a package) → `SemanticAgent.__init__`'s `create_agent(...)` call gains one `middleware=[...]` argument.
**Required implementation skills**: Before code changes, load `tdd`, `testing`, `mutation-testing`, and `refactoring`.
**Acceptance criteria** (needs your confirmation before any code):
- **First**: `AgentMiddleware`'s real base class import path and `wrap_model_call`'s real signature are confirmed directly against the installed `langchain` package (not assumed from a doc summary) — this is a spike/verification step, not itself a test
- `load_agent_skills()` returns the correct `Skill(TypedDict)` list from real `SKILL.md` files under a temp directory, and `[]` (not an error) when the directory doesn't exist or is empty
- `SemanticAgent.__init__` passes `middleware=[]` (not `[SkillMiddleware([])]`) when no agent-skills are configured — no pointless middleware wired in for nothing
- `SemanticAgent.__init__` passes `middleware=[SkillMiddleware(skills)]` when `platform/agent-skills/` has at least one skill, with the real loaded skill list
- `SkillMiddleware`'s injected system-prompt addendum contains the `disambiguation` skill's `name`+`description`, not its full `content`, before any `load_skill` call is made
- `load_skill("disambiguation")` returns the skill's full `content` string
- Live-verified against a real `SemanticAgent`: the cross-specialist question from Slice 3 ("which FIBO class does the term with the highest PageRank score belong to?") triggers a real `load_skill("disambiguation")` tool call (visible in Studio's Agent Workspace trace, alongside the two specialist calls), and the answer is correct
**RED**: Failing tests for `load_agent_skills()` (real temp-directory file reads, mutator-aware gaps: empty-directory-returns-`[]` not error, correct field mapping into the `Skill` TypedDict) and for `SemanticAgent.__init__`'s middleware-wiring plumbing (monkeypatch `create_agent` at its origin module per this codebase's established convention; assert the empty-skills-list-means-no-middleware behavior explicitly, since forgetting that check is an easy, silent-cost mutant).
**GREEN**: `platform/agent-skills/disambiguation/SKILL.md`, `packages/kernel/agent_skills.py`, the small `SkillMiddleware`/`load_skill` module, and the one-line `SemanticAgent.__init__` change.
**MUTATE**: Run `mutation-testing` skill — produce a report.
**KILL MUTANTS**: Address survivors (ask when ambiguous).
**REFACTOR**: Assess whether `load_agent_skills()` and `packages/kernel/specialists.py`'s discovery loop share enough shape to warrant consolidating the file-scanning logic — only if it removes real duplication (both already share `parse_skill_md`; the scanning/`try-except`-per-item shape is the remaining candidate).
**Done when**: All acceptance criteria met, mutation report reviewed, the live cross-specialist transcript (showing the real `load_skill` call) shown, you approve the commit.

### Slice 5: A user clicks "Export as OKF bundle" on the Glossary page and downloads a real, conformant zip

**Value**: Polanyi's glossary/table knowledge becomes genuinely portable — a real actor (any Studio user) can, in one click, get a standards-based, git-diffable artifact any OKF-aware tool can consume, independent of Polanyi's own runtime. Not a backend module alone — the full path from click to downloaded file, since nothing here is useful until a real user can actually invoke it (no download mechanism of any kind exists anywhere in `studio-v1` today, confirmed by direct check).
**Path**: `GlossaryPage.tsx`'s new "Export as OKF bundle" button → `apps/studio-v1/src/api/okf.ts` (new client, same convention as the existing `api/*.ts` files) → `POST /api/okf/export` (new route in `apps/server/polanyi/api/__init__.py`) → `export_okf_bundle()` (`packages/semantic-runtime/semantic/okf_export.py`, new) writes the real bundle to a temp directory → the route zips it (stdlib `zipfile`, no new dependency) and streams it back as `application/zip` → the browser downloads it via the standard `Blob` + `createObjectURL` + `<a download>` pattern (newly introduced to this codebase — no existing precedent to mirror, confirmed by direct check, so this is new surface area worth extra test attention, not an assumed-safe copy of something already proven here).
**Required implementation skills**: Before code changes, load `tdd`, `testing`, `mutation-testing`, `refactoring`, and `react-testing` (for the new download-trigger behavior on the frontend).
**Acceptance criteria** (needs your confirmation before any code):
- `glossary_concept_markdown` produces valid frontmatter with `type: Glossary Term`, and includes `resource`+`# Citations` only for an actually-aligned entry (`ontology_class`/`ontology_uri` both set) — never for an unaligned one
- `table_concept_markdown` cross-links to every FK-related table via real `EntityRelationship` data, using real relationship descriptions — not fabricated prose
- `index_markdown` sets `okf_version: "0.1"` frontmatter only when explicitly asked (bundle-root call), never on a subdirectory index
- `export_okf_bundle()` writes a real bundle to a `tmp_path` directory; every glossary term and table produces exactly one file; the root `index.md` lists all of them
- `is_okf_conformant()` returns `True` for the real exported bundle, and `False` for a deliberately-broken one (missing frontmatter, empty `type`) — proving the check actually discriminates, not just always passing
- `POST /api/okf/export` returns a real `application/zip` response whose contents, when unzipped, are byte-for-byte the same files `export_okf_bundle()` would have written directly — no divergent zip-building logic
- Clicking "Export as OKF bundle" in `GlossaryPage.tsx` triggers a real browser download (tested via the Blob/anchor mechanism actually firing, not just that the button exists) — no server round-trip is silently dropped
- No `SemanticAgent` tool is registered for this — confirmed by asserting `registry.agent_tools()` is unaffected by this slice
- Live-verified end-to-end: export the real demo `SemanticContext` (44 glossary terms, FIBO-aligned subset) through the real running Studio UI in a browser, confirm a real `.zip` downloads, unzip it and inspect the real files — at least one aligned term's `# Citations` section contains its real FIBO URI, at least one unaligned term's concept has no `# Citations` section
**RED**: Failing tests for each pure builder function (mutator-aware gaps: the aligned/unaligned branch for `# Citations` and `resource`, the FK cross-link direction — `from_entity`/`to_entity` swapped is a realistic mutant, the `okf_version` frontmatter appearing where it shouldn't), for `export_okf_bundle`'s file-writing orchestration against a `tmp_path` fixture (matching this codebase's established convention, e.g. the existing `demo_uri` fixture), for the API route's zip-streaming behavior (status code, content-type, byte-identical contents to the unzipped module output), and for the frontend button's click-triggers-download behavior (Browser Mode test per this project's testing conventions).
**GREEN**: `packages/semantic-runtime/semantic/okf_export.py`, the new `POST /api/okf/export` route, `apps/studio-v1/src/api/okf.ts`, and the button in `GlossaryPage.tsx`.
**MUTATE**: Run `mutation-testing` skill — produce a report.
**KILL MUTANTS**: Address survivors (ask when ambiguous).
**REFACTOR**: Assess after mutation testing confirms test strength — is the frontmatter-line-building duplicated enough across the three concept-builder functions to warrant a small shared `_frontmatter(fields: dict) -> list[str]` helper? Only if it removes real duplication.
**Done when**: All acceptance criteria met, mutation report reviewed, a real browser download shown (screenshot or recording of the actual click-to-file flow, not just passing tests), you approve the commit.

## OKF Workspaces — sandboxed, on-demand ArcKit execution

Scoped after explicit discussion of the real cost/security tradeoffs this introduces (billing: **support both** — a Polanyi-provided API key with a hard budget cap, and bring-your-own-key; isolation: **one Docker container per workspace**, resolved as your explicit choices, not defaults I picked silently).

**Nothing like this exists in Polanyi today, confirmed by direct check**: no job queue, no background-task mechanism, no sandboxing infrastructure. This is a materially bigger and riskier feature than everything else in this plan — it runs a real, billed, LLM-driven agent session with file/shell access, server-side, triggered by a web user. Treat it as such: gated behind an explicit operator opt-in (`POLANYI_OKF_WORKSPACES_ENABLED=true`, off by default — matches this project's existing opt-in conventions, e.g. `POLANYI_EMBEDDING_PROVIDER`, `IMPORT_FIBO`), not silently live just because the code exists.

**Execution harness default: Claude Code**, unless you'd rather leave it open — ArcKit itself calls Claude Code its "premier" platform (most complete command/agent/MCP-server support, automatic updates), and it's this project's own tooling context already. Not asked as a blocking decision; stated as the sensible default, changeable later.

**Job mechanism: SQLite-backed, not a new Celery/Redis dependency.** These are low-frequency, high-latency, high-value-per-run operations (ArcKit's own published cost table puts some commands over 60K tokens and multiple minutes of wall-clock time) — a full task-queue stack would be disproportionate new infrastructure for that usage shape, and Polanyi's own conventions already favor SQLite over adding a broker (the existing `langgraph-checkpoint-sqlite` session store is the precedent). A new `semantics/knowledge/okf-jobs.db` table + an in-process async worker loop is consistent with what's already here; revisit only if usage volume later proves this insufficient.

**Container lifecycle**:
1. `POST /api/okf/workspaces` — creates `semantics/knowledge/okf-workspaces/<workspace_id>/` on the host, launches a dedicated container (built from a new image with `arckit` + the chosen harness CLI pre-installed) with **only that workspace's directory** bind-mounted, runs `arckit init . --ai claude-code` once inside it (the one real, safe, standalone ArcKit command). Billing mode (`polanyi-key` / `byok`) is chosen at creation time.
2. `POST /api/okf/workspaces/{id}/jobs` — enqueues a request (a natural-language ask or a specific ArcKit command) as a new SQLite job row.
3. The worker loop picks up queued jobs, launches the actual headless CLI invocation inside the workspace's container (`asyncio.create_subprocess_exec` around `docker exec`/`docker run`, consistent with this project's existing Docker-based infra rather than a new orchestration layer) with: filesystem confined to the workspace directory only, no network egress beyond what the command needs, CPU/memory limits, and a hard wall-clock timeout (job is killed, not left to hang, if it exceeds it).
4. **Budget enforcement (`polanyi-key` mode)**: before launching, check the workspace's remaining token/dollar budget; refuse the job with a clear, honest message if exhausted — never silently proceed past a configured cap.
5. **BYOK key handling**: the user's own API key is never logged, never written to any file the container image or its layers could expose, and — if persisted at all across jobs for convenience — stored encrypted at rest (server-side secret key), decrypted only in-memory at the moment a job's container is launched, injected purely as a process environment variable for that single run.
6. `GET /api/okf/workspaces/{id}/jobs/{job_id}` — status (`queued`/`running`/`succeeded`/`failed`/`timed_out`) plus the full transcript for human review once complete. Output is **never auto-imported** — matches ArcKit's own stated design philosophy ("AI generates, you review") and this project's own "never fabricate, always verify" discipline. The user explicitly reviews the transcript, then approves import — which reuses Slice 6's existing `is_okf_conformant()`/import pipeline unchanged, not a second import mechanism.
7. `DELETE /api/okf/workspaces/{id}` — stops and removes the real container and (optionally) its directory; workspaces are real resources (disk, a running container) and must be cleanly destroyable, not left to accumulate.

**Explicitly out of scope for this plan, named rather than silently assumed**: a full security threat-model review (container-escape monitoring, anomalous-job-volume alerting, abuse-rate-limiting policy) before this reaches a real production deployment with untrusted external users — that's a dedicated security-review exercise this plan recommends but does not itself perform. Licensing/Terms-of-Service implications of running a given AI CLI headlessly, embedded as a feature of a separate product, are the operator's own diligence to confirm for whichever harness is deployed — not something resolved by this plan.

Full slice detail (9, 10) is under "## Slices" below, in sequence after Slice 8.

### Slice 6: A user imports (or has exported) an OKF bundle and browses/views its concepts in Studio

**Value**: A real actor (any Studio user) can bring in an externally-produced bundle (from ArcKit or anywhere else honestly conformant) or browse Polanyi's own export, and actually *read* it — rendered markdown, not raw files on a server only reachable by SSH.
**Path**: New "Knowledge Bundles" page in Studio → `GET /api/okf/concepts` (list) + `GET /api/okf/concepts/{concept_id}` (one concept, parsed) → `packages/semantic-runtime/semantic/okf_bundle.py` (new — read-side counterpart to `okf_export.py`, real YAML frontmatter parsing) → `semantics/knowledge/okf/` (real, persisted directory; Slice 5's export writes here too, not just an ephemeral zip) → `POST /api/okf/import` accepts an uploaded `.zip`, extracts it, and validates with `is_okf_conformant()` before accepting it — a non-conformant upload is rejected with a clear, honest error, never silently accepted as garbage.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`, `react-testing`.
**Acceptance criteria** (needs your confirmation before any code):
- `parse_okf_concept(text: str) -> dict` correctly parses real frontmatter via `yaml.safe_load` (including a `tags` list) plus the body, and raises a clear error for a concept missing the required `type` field (SPEC.md §9's own conformance rule)
- `POST /api/okf/import` accepts a real `.zip`, extracts it into `semantics/knowledge/okf/`, and rejects (with a clear message, not a silent partial import) a bundle containing even one non-conformant concept
- `GET /api/okf/concepts` lists every real concept in the persisted bundle (id, type, title, description) — empty list, not an error, when no bundle has been imported/exported yet
- `GET /api/okf/concepts/{concept_id}` returns the real parsed frontmatter + body for one concept; a 404 for an unknown id, not a silent empty response
- The Studio page renders a concept's markdown body as actual formatted markdown (headings, tables, links) via `react-markdown` — not raw text
- Live-verified: import a real bundle built by Slice 5's own export, browse it in a real running browser, confirm at least one FIBO-aligned term's `# Citations` section renders as a real clickable link to its real FIBO URI
**RED**: Failing tests for `parse_okf_concept` (mutator-aware: missing `type` raises, `tags` list parses correctly not as a raw string, unknown extra frontmatter keys are preserved not dropped per SPEC.md §4.1's own "consumers SHOULD preserve unknown keys" guidance), for the import endpoint's conformance-rejection path (a deliberately-broken uploaded zip), and for the list/get endpoints against a real `tmp_path`-backed bundle directory.
**GREEN**: `packages/semantic-runtime/semantic/okf_bundle.py`, the three new API routes, the new Studio page.
**MUTATE / KILL MUTANTS / REFACTOR**: Standard cycle.
**Done when**: All acceptance criteria met, mutation report reviewed, a real browser screenshot/recording of browsing an imported bundle shown, you approve the commit.

### Slice 7: Edit a concept's frontmatter and body, save it back to the real bundle

**Value**: The bundle becomes genuinely editable in place — correcting a description, adding a tag, fixing a broken cross-link — without needing to touch files on a server directly.
**Path**: Extends Slice 6's detail view with an edit mode → `PUT /api/okf/concepts/{concept_id}` re-serializes the edited frontmatter (YAML) + body back to the real file.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`, `react-testing`.
**Acceptance criteria** (needs your confirmation before any code):
- `PUT /api/okf/concepts/{concept_id}` writes real, valid frontmatter + body back to disk; re-reading the file afterward returns exactly the edited content
- Editing a concept whose `type` field is cleared to empty is rejected (SPEC.md §9's own conformance rule enforced on write, not just on import)
- **Explicit, load-bearing scoping limit, stated plainly in the UI copy, not just the plan**: editing a concept that happens to have originated from Polanyi's own export does **not** feed back into the live `SemanticContext`/glossary — this is a standalone, decoupled bundle. Two-way sync (an edit here updating the real glossary term) is a separate, materially bigger, and riskier initiative (real data-integrity risk if built carelessly) — named here as a deliberately deferred future item, not built in this slice.
- Live-verified: edit a real concept's description in the running Studio UI, save, reload the page, confirm the edit persisted to the real file on disk
**RED/GREEN/MUTATE/KILL MUTANTS/REFACTOR**: Standard cycle, extending Slice 6's test fixtures.
**Done when**: All acceptance criteria met, mutation report reviewed, a real edit-save-reload cycle shown, you approve the commit.

### Slice 8: `search_okf_knowledge` — the real agentic opportunity, fully scoped

This is the "OKF import as agentic opportunity" named-but-deferred earlier, now scoped in full detail as asked.

**Value**: `SemanticAgent` (via a third specialist) can search and cite an imported knowledge bundle — architecture documentation, business context, or anything else a bundle carries that Polanyi's native database schema and FIBO ontology don't — as an explicitly-attributed, separate knowledge source.
**Path**: A **third specialist folder**, `platform/specialists/knowledge-bundle/` (`SKILL.md` + `tools.py`), reusing the *exact* self-contained specialist mechanism from Slices 1–2 (`packages/kernel/specialists.py`'s loader, unchanged) — no new architecture, the concrete proof the mechanism generalizes to a third, unrelated domain. `tools.py`'s `build_tools()` reads the same `semantics/knowledge/okf/` directory Slices 6–7 read and write, and builds:
- `search_okf_knowledge(query: str) -> str` — lexical match on `title`/`description`/`tags`/body (a pure `score_concept(query, concept) -> float`, mirroring `ontology.py`'s existing `score_label` convention exactly) across every persisted concept; embeddings-optional via the *same* already-existing `resolve_embedding_provider()`/`POLANYI_EMBEDDING_PROVIDER` opt-in this whole project already uses for FIBO alignment and knowledge-graph search — no new embeddings-policy invented.
- `get_okf_concept(concept_id: str) -> str` — fetch one concept's full content by id, for follow-up detail once search has found it.

**Real design decisions, not left implicit:**
- **No silent merging with Polanyi's native knowledge.** `search_knowledge_graph` (Neo4j) and `search_ontology` (FIBO) stay completely separate tools/specialists. An imported bundle might describe the *same* real-world table or concept differently than Polanyi's own glossary — silently blending the two would blur which source an answer actually came from, violating this project's "never fabricate, always attribute" discipline. `search_okf_knowledge`'s own `SKILL.md` instructions require every citation to name the concept id explicitly (e.g. "per imported concept `tables/customers.md`"), never presented as native Polanyi knowledge.
- **Honest empty state.** If `semantics/knowledge/okf/` doesn't exist or has never had a bundle imported, `search_okf_knowledge` returns a clear "no knowledge bundle imported yet" message — not a fabricated answer, not a silent empty result — matching the same empty-state discipline established for every other specialist tool in this plan and the S17/S18/S19 stories before it.
- **Model role**: `resolve_llm("agent")`, same convention as the other two specialists (corrected during Slice 1 — see design decision 6).
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`.
**Acceptance criteria** (needs your confirmation before any code):
- `score_concept(query, concept)` ranks a concept whose title/description lexically matches the query above one that doesn't — direct unit test, no bundle/LLM/network involved
- `search_okf_knowledge` returns the honest "no bundle imported" message when `semantics/knowledge/okf/` is empty or absent
- `search_okf_knowledge`'s real results include the concept id in every returned match, never just a bare description with no attribution
- The third specialist is discovered by the *unmodified* `load_specialists()` loader from Slice 1 — proof of genericity, not a special case
- Live-verified: import a real bundle (Slice 6), ask `SemanticAgent` a question only the imported bundle can answer, confirm the real answer cites the real concept id and is never silently presented as native Polanyi knowledge
**RED/GREEN/MUTATE/KILL MUTANTS/REFACTOR**: Standard cycle, mirroring Slices 1–2's test shape exactly (fake `create_agent`, monkeypatched at its origin module).
**Done when**: All acceptance criteria met, mutation report reviewed, the live cross-source citation transcript shown, you approve the commit.

### Slice 9: A user creates their own sandboxed OKF workspace with one click

**Value**: A real actor gets a genuinely isolated, ArcKit-ready environment — the concrete infrastructure every later job depends on — without yet running any billed LLM session (this slice is the walking skeleton: container lifecycle only).
**Path**: "Create OKF Workspace" button (Studio) → `POST /api/okf/workspaces` → new Docker image (`arckit` + Claude Code CLI pre-installed) → `docker run` with only the new workspace directory mounted → `arckit init . --ai claude-code` executed once inside the container → workspace row persisted (id, container id, billing mode, created-at) in a new `semantics/knowledge/okf-workspaces.db`.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`, `react-testing`.
**Acceptance criteria** (needs your confirmation before any code):
- Feature is inert unless `POLANYI_OKF_WORKSPACES_ENABLED=true` is explicitly set — the route/button don't exist otherwise, confirmed by a test asserting their absence when unset
- `POST /api/okf/workspaces` creates a real, running container with only the new workspace's directory bind-mounted — no access to any other workspace's files or the host filesystem beyond that mount, verified by a real check (attempt to read a path outside the mount from inside the container, confirm it fails)
- Choosing `byok` at creation time requires a real API key in the request; it is never written to any log line or persisted file in plaintext (grep the real log output and the real persisted row after a test run to confirm)
- Choosing `polanyi-key` at creation time initializes a real, enforced budget cap for that workspace
- `DELETE /api/okf/workspaces/{id}` stops and removes the real container — verified by checking `docker ps` no longer lists it, not just that the API returned 200
- Live-verified: create a real workspace, `docker exec` into it directly and confirm `arckit`'s scaffolded files genuinely exist inside the container's mounted directory
**RED**: Failing tests for the feature-flag gate, workspace-row persistence, container-launch invocation (mocked `asyncio.create_subprocess_exec` at first for the pure orchestration logic, then a real container in live verification), the BYOK-key-never-logged/never-plaintext-persisted property, and deletion actually tearing down the container.
**GREEN**: New Docker image, `packages/execution-runtime/execution/okf_workspaces.py` (workspace lifecycle orchestration), new API routes, the Studio button.
**MUTATE / KILL MUTANTS / REFACTOR**: Standard cycle — extra attention on the BYOK-key-handling code path given its security sensitivity.
**Done when**: All acceptance criteria met, mutation report reviewed, a real container proven isolated and cleanly destroyable, you approve the commit.

### Slice 10: Submit a real ArcKit job, review the transcript, approve import into Polanyi's own bundle

**Value**: The actual point of a workspace — a real ArcKit-generated OKF export, reviewed by a human before being trusted, then folded into Polanyi's own bundle via the already-built import pipeline (Slice 6), not a second, divergent mechanism.
**Path**: A request box in the workspace's Studio view → `POST /api/okf/workspaces/{id}/jobs` (new `semantics/knowledge/okf-jobs.db` row, `queued`) → an in-process async worker loop picks it up, runs the real headless CLI invocation inside the workspace's container (budget-checked first for `polanyi-key` mode, hard wall-clock timeout enforced) → `GET .../jobs/{job_id}` polled from the UI for status + the full transcript once done → an explicit "Approve & Import" action hands the resulting files to Slice 6's existing `is_okf_conformant()`/import routine.
**Required implementation skills**: `tdd`, `testing`, `mutation-testing`, `refactoring`, `react-testing`.
**Acceptance criteria** (needs your confirmation before any code):
- A job exceeding its configured wall-clock timeout is actually killed, not left running — verified against a real, deliberately-slow command, not just asserted in a mock
- A `polanyi-key` workspace whose budget is already exhausted refuses a new job with a clear, honest message — the job is never silently queued and later denied after work has already started
- The full real transcript is retrievable via `GET .../jobs/{job_id}` once a job completes — success and failure paths both produce a real, inspectable transcript, not just a bare status code
- Nothing gets imported into `semantics/knowledge/okf/` without an explicit, separate "Approve & Import" action after the transcript is shown — a completed job alone never triggers an import
- The approved import reuses Slice 6's `is_okf_conformant()` check unchanged — a non-conformant ArcKit output is rejected the same honest way an uploaded bundle would be, not given a free pass because it came from a "trusted" workspace
- Live-verified end-to-end: submit a real request in a real workspace, watch a real job run to completion, read its real transcript, approve it, confirm the resulting concepts appear in Slice 6's bundle viewer
**RED**: Failing tests for the worker loop's job-picking/status-transition logic, the timeout-kill path (a deliberately slow fake subprocess), the budget-refusal path, and the "import requires explicit approval, never automatic" boundary — the single most important behavior in this slice, worth its own dedicated, hard-to-accidentally-invert test.
**GREEN**: The job table + worker loop, the three new job-related routes, the workspace request/transcript/approve UI.
**MUTATE / KILL MUTANTS / REFACTOR**: Standard cycle — extra scrutiny on the auto-import boundary given how much trust depends on it never silently flipping.
**Done when**: All acceptance criteria met, mutation report reviewed, the real end-to-end transcript-then-import flow shown, you approve the commit.

## Pre-PR Quality Gate

Before each PR:
1. Mutation testing — run `mutation-testing` skill
2. Refactoring assessment — run `refactoring` skill
3. Full backend test suite run with a wall-clock timer (per this session's own established discipline — a specialist's `create_agent(...)` construction is a new eager-ish call path; confirm it doesn't introduce a new registration-time hang the way GDS and `Neo4jGraphStore`'s default timeout once did)
4. Live verification against the real running GraphDB/Neo4j, not just mocked tests

