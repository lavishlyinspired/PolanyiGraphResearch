"""Semantic context generation.

Two engines, following the Polanyi Works design principle that the LLM is optional:

- `deterministic_context` derives glossary, relationships, and rule contexts
  purely from schema metadata (foreign keys, column names) and the declared
  business rules. It always works — no API key required.
- `llm_context` enriches the same inputs with an LLM via structured output.

`generate_context` prefers the LLM when one is supplied and falls back to the
deterministic engine on any failure.
"""

from __future__ import annotations

import logging
import re
from collections import Counter
from typing import Optional

from polanyi.models import (
    BusinessRule,
    BusinessRuleContext,
    EntityRelationship,
    GlossaryEntry,
    SchemaSnapshot,
    SemanticContext,
)

logger = logging.getLogger(__name__)

_ID_SUFFIXES = ("_id", "_key")
_SKIP_COLUMNS = {"id"}
_PREDICATE_PATTERN = re.compile(
    r"\b([a-z_][a-z0-9_.]*)\s*(=|>=|<=|>|<|IN)\s*([^,;]+?)(?=(?:\s+and\s|\s+or\s|,|;|$))",
    re.IGNORECASE,
)


def generate_context(
    snapshot: SchemaSnapshot,
    rules: list[BusinessRule],
    llm=None,
    domain: str = "Financial Services",
) -> SemanticContext:
    """Generate semantic context, preferring the LLM but never failing without one."""
    if llm is not None:
        try:
            return llm_context(snapshot, rules, llm, domain=domain)
        except Exception as exc:  # noqa: BLE001 — any LLM failure falls back
            logger.warning("LLM context generation failed (%s); using deterministic engine", exc)
    return deterministic_context(snapshot, rules, domain=domain)


# ── Deterministic engine ─────────────────────────────────────────


def deterministic_context(
    snapshot: SchemaSnapshot,
    rules: list[BusinessRule],
    domain: str = "Financial Services",
) -> SemanticContext:
    relationships = _relationships_from_foreign_keys(snapshot)
    return SemanticContext(
        domain=domain,
        glossary=_glossary_from_columns(snapshot),
        relationships=relationships,
        business_rules=build_rule_contexts(rules),
        key_entities=_rank_entities(snapshot),
        common_queries=_common_queries(relationships, rules),
        generated_by="deterministic",
    )


def _humanize(column: str) -> str:
    return " ".join(part.capitalize() for part in column.split("_"))


def _is_plumbing(column: str) -> bool:
    return column.lower() in _SKIP_COLUMNS or column.lower().endswith(_ID_SUFFIXES)


def _glossary_from_columns(snapshot: SchemaSnapshot) -> list[GlossaryEntry]:
    by_term: dict[str, GlossaryEntry] = {}
    for table in snapshot.tables:
        for col in table.columns:
            if _is_plumbing(col.name) or col.primary_key:
                continue
            term = _humanize(col.name)
            entry = by_term.get(term)
            if entry is None:
                by_term[term] = GlossaryEntry(
                    term=term,
                    definition=f"{term} as recorded in the {table.name} table ({col.type}).",
                    source_tables=[table.name],
                    source_columns=[col.name],
                )
            else:
                if table.name not in entry.source_tables:
                    entry.source_tables.append(table.name)
                if col.name not in entry.source_columns:
                    entry.source_columns.append(col.name)
    return list(by_term.values())


def _relationships_from_foreign_keys(snapshot: SchemaSnapshot) -> list[EntityRelationship]:
    return [
        EntityRelationship(
            from_entity=table.name,
            to_entity=fk.references_table,
            relationship_type="many-to-one",
            foreign_key=fk.column,
            description=(
                f"Each {table.name} row references one {fk.references_table} row "
                f"via {fk.column}."
            ),
        )
        for table in snapshot.tables
        for fk in table.foreign_keys
    ]


def _rank_entities(snapshot: SchemaSnapshot) -> list[str]:
    """Tables referenced by the most foreign keys are the most central entities."""
    in_degree: Counter[str] = Counter()
    for table in snapshot.tables:
        in_degree[table.name] += 0
        for fk in table.foreign_keys:
            in_degree[fk.references_table] += 1
    return [name for name, _ in in_degree.most_common()]


def _common_queries(
    relationships: list[EntityRelationship], rules: list[BusinessRule]
) -> list[str]:
    queries = [
        f"Which {rel.from_entity} are linked to each {rel.to_entity}?"
        for rel in relationships[:3]
    ]
    queries += [f"Which records violate {rule.name}?" for rule in rules if rule.severity in
                ("CRITICAL", "HIGH")]
    return queries


def build_rule_contexts(rules: list[BusinessRule]) -> list[BusinessRuleContext]:
    """Turn declared business rules into agent-facing contexts with SQL hints."""
    return [
        BusinessRuleContext(
            rule_id=rule.rule_id,
            name=rule.name,
            description=rule.description,
            sql_hints=extract_predicates(rule.description),
            affected_entities=rule.tables,
            severity=rule.severity,
        )
        for rule in rules
    ]


def extract_predicates(description: str) -> list[str]:
    """Pull `column op value` predicates out of a rule description."""
    hints = []
    for match in _PREDICATE_PATTERN.finditer(description):
        column, op, value = match.group(1), match.group(2), match.group(3).strip()
        hints.append(f"{column} {op} {value}")
    return hints


# ── LLM engine ───────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are a financial services data architect.
Given a database schema and business rules, generate a structured semantic context
that an AI agent can use to accurately answer business questions.

The glossary should define key business terms with formulas where applicable.
Relationships should capture how tables connect.
Business rules should include SQL hints showing how to enforce them."""

_HUMAN_PROMPT = """Database schema:

{table_info}

Business rules:
{rules}

Generate semantic context. Focus on:
1. Business terms a CFO or risk manager would use
2. How to correctly calculate revenue, exposure, and risk
3. Compliance rules that must be enforced in queries
4. The most important entity relationships"""


def llm_context(
    snapshot: SchemaSnapshot,
    rules: list[BusinessRule],
    llm,
    domain: str = "Financial Services",
) -> SemanticContext:
    from langchain_core.prompts import ChatPromptTemplate

    structured_llm = llm.with_structured_output(SemanticContext)
    prompt = ChatPromptTemplate.from_messages(
        [("system", _SYSTEM_PROMPT), ("human", _HUMAN_PROMPT)]
    )
    rules_text = "\n".join(
        f"[{r.rule_id}] {r.name}: {r.description} (Severity: {r.severity})" for r in rules
    )
    result: Optional[SemanticContext] = (prompt | structured_llm).invoke(
        {"table_info": snapshot.table_info_text, "rules": rules_text}
    )
    if result is None:
        raise ValueError("LLM returned no structured output")
    result.domain = result.domain or domain
    result.generated_by = "llm"
    # Declared rules are authoritative for symbolic validation. LLM rewrites of
    # sql_hints/affected_entities would weaken (or break) enforcement, so the
    # deterministic contexts replace them; LLM-discovered extras are kept.
    authoritative = build_rule_contexts(rules)
    declared_ids = {r.rule_id for r in authoritative}
    extras = [r for r in result.business_rules if r.rule_id not in declared_ids]
    result.business_rules = authoritative + extras
    return result
