import pytest

from polanyi.demo import DEMO_BUSINESS_RULES, seed_demo_db
from polanyi.semantic.generate import deterministic_context, generate_context
from polanyi.semantic.introspect import introspect
from polanyi.models import SemanticContext


@pytest.fixture()
def snapshot(tmp_path):
    db_path = tmp_path / "demo.db"
    seed_demo_db(str(db_path))
    return introspect(f"sqlite:///{db_path}")


def test_deterministic_context_derives_relationships_from_foreign_keys(snapshot):
    ctx = deterministic_context(snapshot, DEMO_BUSINESS_RULES)
    rels = {(r.from_entity, r.to_entity) for r in ctx.relationships}
    assert ("trades", "counterparties") in rels
    assert ("trades", "instruments") in rels
    trade_cp = next(
        r for r in ctx.relationships if (r.from_entity, r.to_entity) == ("trades", "counterparties")
    )
    assert trade_cp.relationship_type == "many-to-one"
    assert "counterparty_id" in trade_cp.foreign_key


def test_deterministic_context_builds_glossary_from_business_columns(snapshot):
    ctx = deterministic_context(snapshot, DEMO_BUSINESS_RULES)
    terms = {g.term for g in ctx.glossary}
    assert "Notional Amount" in terms
    entry = next(g for g in ctx.glossary if g.term == "Notional Amount")
    assert "trades" in entry.source_tables
    # id columns are plumbing, not business vocabulary
    assert "Trade Id" not in terms


def test_deterministic_context_carries_business_rules_with_sql_hints(snapshot):
    ctx = deterministic_context(snapshot, DEMO_BUSINESS_RULES)
    br = next(r for r in ctx.business_rules if r.rule_id == "BR-001")
    assert br.severity == "CRITICAL"
    assert any("is_sanctioned" in h for h in br.sql_hints)


def test_deterministic_context_ranks_key_entities_by_reference_count(snapshot):
    ctx = deterministic_context(snapshot, DEMO_BUSINESS_RULES)
    # instruments is referenced by trades and positions — must rank ahead of daily_pnl
    assert ctx.key_entities.index("instruments") < ctx.key_entities.index("daily_pnl")


def test_generate_context_without_llm_falls_back_to_deterministic(snapshot):
    ctx = generate_context(snapshot, DEMO_BUSINESS_RULES, llm=None)
    assert isinstance(ctx, SemanticContext)
    assert ctx.generated_by == "deterministic"


def test_generate_context_with_broken_llm_falls_back_to_deterministic(snapshot):
    class BrokenLLM:
        def with_structured_output(self, schema):
            raise RuntimeError("model unavailable")

    ctx = generate_context(snapshot, DEMO_BUSINESS_RULES, llm=BrokenLLM())
    assert ctx.generated_by == "deterministic"


def test_llm_rewritten_rules_never_weaken_enforcement(snapshot):
    """Declared rules stay authoritative: LLM prose must not replace the
    predicate hints that symbolic validation depends on."""
    from polanyi.models import BusinessRuleContext, SemanticContext

    llm_output = SemanticContext(
        domain="Financial Services",
        business_rules=[
            BusinessRuleContext(
                rule_id="BR-001",
                name="Sanctioned Counterparty Check",
                description="Do not trade with sanctioned parties",
                # full-SQL hint: useless (actively harmful) for validation
                sql_hints=["SELECT * FROM trades WHERE is_sanctioned = FALSE"],
                affected_entities=["trades"],
                severity="CRITICAL",
            ),
            BusinessRuleContext(
                rule_id="LLM-EXTRA",
                name="Discovered rule",
                description="An extra rule the LLM found",
                severity="INFO",
            ),
        ],
        generated_by="llm",
    )

    class FakeStructuredLLM:
        def with_structured_output(self, schema):
            return lambda _inputs: llm_output

    ctx = generate_context(snapshot, DEMO_BUSINESS_RULES, llm=FakeStructuredLLM())
    assert ctx.generated_by == "llm"
    br1 = next(r for r in ctx.business_rules if r.rule_id == "BR-001")
    assert br1.sql_hints == ["is_sanctioned = TRUE"]
    assert set(br1.affected_entities) == {"counterparties", "trades"}
    assert any(r.rule_id == "LLM-EXTRA" for r in ctx.business_rules)
