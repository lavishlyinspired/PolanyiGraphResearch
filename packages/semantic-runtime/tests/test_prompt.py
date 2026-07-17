from polanyi.models import (
    BusinessRuleContext,
    EntityRelationship,
    GlossaryEntry,
    SemanticContext,
)
from polanyi.semantic.prompt import build_agent_prompt


def make_context() -> SemanticContext:
    return SemanticContext(
        domain="Financial Services",
        glossary=[
            GlossaryEntry(
                term="Notional Amount",
                definition="Total value of a trade",
                formula="quantity * price",
                source_tables=["trades"],
                source_columns=["notional_amount"],
                unit="USD",
            )
        ],
        relationships=[
            EntityRelationship(
                from_entity="trades",
                to_entity="counterparties",
                relationship_type="many-to-one",
                foreign_key="counterparty_id",
                description="Each trade has one counterparty",
            )
        ],
        business_rules=[
            BusinessRuleContext(
                rule_id="BR-001",
                name="Sanctioned Counterparty Check",
                description="No trades with sanctioned counterparties",
                sql_hints=["WHERE is_sanctioned = 0"],
                affected_entities=["trades", "counterparties"],
                severity="CRITICAL",
            )
        ],
        key_entities=["trades", "counterparties"],
        common_queries=["Which counterparties are sanctioned?"],
    )


def test_prompt_contains_glossary_definitions_and_formulas():
    prompt = build_agent_prompt(make_context())
    assert "Notional Amount" in prompt
    assert "quantity * price" in prompt


def test_prompt_contains_relationships_and_rules():
    prompt = build_agent_prompt(make_context())
    assert "counterparty_id" in prompt
    assert "BR-001" not in prompt or "Sanctioned" in prompt
    assert "WHERE is_sanctioned = 0" in prompt


def test_prompt_instructs_agent_not_to_guess():
    prompt = build_agent_prompt(make_context())
    assert "NEVER guess" in prompt
