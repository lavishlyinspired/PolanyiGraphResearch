"""Render a SemanticContext into an agent system prompt."""

from __future__ import annotations

from graphos.models import SemanticContext


def build_agent_prompt(ctx: SemanticContext) -> str:
    lines = [
        f"# Enterprise Semantic Context — {ctx.domain}",
        "",
        "You are an AI assistant for a financial services company.",
        "Use the following business context to answer questions accurately.",
        "NEVER guess definitions. Use ONLY the glossary below.",
        "",
        "## Business Glossary",
        "",
    ]
    for entry in ctx.glossary:
        lines.append(f"### {entry.term}")
        lines.append(f"Definition: {entry.definition}")
        if entry.formula:
            lines.append(f"Formula: {entry.formula}")
        lines.append(f"Source: {', '.join(entry.source_tables)}")
        if entry.unit:
            lines.append(f"Unit: {entry.unit}")
        lines.append("")

    lines.append("## Entity Relationships")
    lines.append("")
    for rel in ctx.relationships:
        lines.append(
            f"- {rel.from_entity} --[{rel.relationship_type}]--> {rel.to_entity} "
            f"(via {rel.foreign_key})"
        )
        lines.append(f"  {rel.description}")
    lines.append("")

    lines.append("## Business Rules (MUST enforce)")
    lines.append("")
    for rule in ctx.business_rules:
        lines.append(f"### [{rule.severity}] {rule.name}")
        lines.append(rule.description)
        if rule.sql_hints:
            lines.append("SQL patterns:")
            for hint in rule.sql_hints:
                lines.append(f"  {hint}")
        lines.append("")

    lines.append("## Key Entities")
    lines.append(" > ".join(ctx.key_entities))
    lines.append("")
    lines.append("## Common Questions")
    for q in ctx.common_queries:
        lines.append(f"- {q}")

    return "\n".join(lines)
