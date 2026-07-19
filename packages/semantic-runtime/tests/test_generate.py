import pytest

from polanyi.demo import DEMO_BUSINESS_RULES, seed_demo_db
from polanyi.semantic.generate import deterministic_context, generate_context
from polanyi.semantic.introspect import introspect
from polanyi.models import GlossaryEntry, SemanticContext


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


def test_generate_context_preserves_accepted_alignment_from_previous_context(snapshot):
    """Regenerating context must not wipe FIBO alignment a steward already accepted."""
    previous = deterministic_context(snapshot, DEMO_BUSINESS_RULES)
    aligned = previous.glossary[0]
    aligned.ontology_class = "MonetaryAmount"
    aligned.ontology_uri = "https://spec.edmcouncil.org/fibo/ontology/FND/Accounting/CurrencyAmount/MonetaryAmount"
    rejected = previous.glossary[1]
    rejected.rejected_ontology_uris = ["https://example.org/ontology/NotAMatch"]

    ctx = generate_context(snapshot, DEMO_BUSINESS_RULES, llm=None, previous=previous)

    regenerated_aligned = next(g for g in ctx.glossary if g.term == aligned.term)
    assert regenerated_aligned.ontology_class == "MonetaryAmount"
    assert regenerated_aligned.ontology_uri == aligned.ontology_uri

    regenerated_rejected = next(g for g in ctx.glossary if g.term == rejected.term)
    assert regenerated_rejected.rejected_ontology_uris == ["https://example.org/ontology/NotAMatch"]

    # A term untouched in `previous` must not pick up alignment from elsewhere.
    untouched = next(g for g in ctx.glossary if g.term not in {aligned.term, rejected.term})
    assert untouched.ontology_class is None
    assert untouched.ontology_uri is None
    assert untouched.rejected_ontology_uris == []


def test_generate_context_without_previous_leaves_alignment_unset(snapshot):
    ctx = generate_context(snapshot, DEMO_BUSINESS_RULES, llm=None)
    assert all(g.ontology_class is None and g.ontology_uri is None for g in ctx.glossary)


def test_generate_context_preserves_alignment_when_llm_succeeds(snapshot):
    """Preservation must apply on the llm_context path too — /api/context/generate
    calls generate_context with both llm and previous set together."""
    previous = deterministic_context(snapshot, DEMO_BUSINESS_RULES)
    aligned = previous.glossary[0]
    aligned.ontology_class = "MonetaryAmount"
    aligned.ontology_uri = "urn:fibo:MonetaryAmount"

    class FakeStructuredLLM:
        def with_structured_output(self, schema):
            return lambda _inputs: SemanticContext(
                domain="Financial Services",
                glossary=[
                    GlossaryEntry(
                        term=aligned.term,
                        definition=aligned.definition,
                        source_tables=aligned.source_tables,
                        source_columns=aligned.source_columns,
                    )
                ],
                generated_by="llm",
            )

    ctx = generate_context(
        snapshot, DEMO_BUSINESS_RULES, llm=FakeStructuredLLM(), previous=previous
    )
    regenerated = next(g for g in ctx.glossary if g.term == aligned.term)
    assert regenerated.ontology_uri == "urn:fibo:MonetaryAmount"


def test_generate_context_drops_alignment_for_terms_no_longer_in_the_schema(snapshot):
    previous = deterministic_context(snapshot, DEMO_BUSINESS_RULES)
    ghost = previous.glossary[0].model_copy(
        update={"term": "Ghost Term", "ontology_class": "Ghost", "ontology_uri": "urn:ghost"}
    )
    previous.glossary.append(ghost)

    ctx = generate_context(snapshot, DEMO_BUSINESS_RULES, llm=None, previous=previous)

    assert all(g.term != "Ghost Term" for g in ctx.glossary)


def test_generate_context_leaves_a_brand_new_term_unaligned(snapshot):
    """A term that exists now but had no counterpart in `previous` (e.g. a column
    just added to the schema) must get None alignment, not crash and not
    inherit some other term's alignment."""
    previous = deterministic_context(snapshot, DEMO_BUSINESS_RULES)
    new_term = previous.glossary[0].term
    previous.glossary = [g for g in previous.glossary if g.term != new_term]

    ctx = generate_context(snapshot, DEMO_BUSINESS_RULES, llm=None, previous=previous)

    regenerated = next(g for g in ctx.glossary if g.term == new_term)
    assert regenerated.ontology_class is None
    assert regenerated.ontology_uri is None
    assert regenerated.rejected_ontology_uris == []


def test_generate_context_with_broken_llm_falls_back_to_deterministic(snapshot):
    class BrokenLLM:
        def with_structured_output(self, schema):
            raise RuntimeError("model unavailable")

    ctx = generate_context(snapshot, DEMO_BUSINESS_RULES, llm=BrokenLLM())
    assert ctx.generated_by == "deterministic"


def test_llm_context_receives_real_ddl_text_when_db_uri_is_provided(tmp_path):
    """table_info_text is generated lazily now — this is the one place it
    actually needs to reach the LLM prompt, so it must be real, not empty."""
    db_path = tmp_path / "demo.db"
    seed_demo_db(str(db_path))
    uri = f"sqlite:///{db_path}"
    snap = introspect(uri)

    captured: dict = {}

    class CapturingLLM:
        def with_structured_output(self, schema):
            def _invoke(prompt_value):
                captured["rendered"] = prompt_value.to_string()
                return SemanticContext(domain="Financial Services", generated_by="llm")

            return _invoke

    ctx = generate_context(snap, DEMO_BUSINESS_RULES, llm=CapturingLLM(), db_uri=uri)
    assert ctx.generated_by == "llm"
    assert "CREATE TABLE" in captured["rendered"]
    assert "trades" in captured["rendered"]


def test_llm_context_sends_no_table_info_when_db_uri_is_omitted(snapshot):
    captured: dict = {}

    class CapturingLLM:
        def with_structured_output(self, schema):
            def _invoke(prompt_value):
                captured["rendered"] = prompt_value.to_string()
                return SemanticContext(domain="Financial Services", generated_by="llm")

            return _invoke

    generate_context(snapshot, DEMO_BUSINESS_RULES, llm=CapturingLLM())
    assert "CREATE TABLE" not in captured["rendered"]


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
