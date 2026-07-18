"""Core data models for the Polanyi Works semantic runtime."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Severity = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"]


# ── Schema introspection ─────────────────────────────────────────


class ColumnInfo(BaseModel):
    name: str
    type: str
    nullable: bool = True
    primary_key: bool = False


class ForeignKeyInfo(BaseModel):
    column: str
    references_table: str
    references_column: str


class TableInfo(BaseModel):
    name: str
    columns: list[ColumnInfo] = Field(default_factory=list)
    foreign_keys: list[ForeignKeyInfo] = Field(default_factory=list)


class SchemaSnapshot(BaseModel):
    dialect: str
    tables: list[TableInfo] = Field(default_factory=list)
    table_info_text: str = ""


# ── Business rules (input) ───────────────────────────────────────


class BusinessRule(BaseModel):
    rule_id: str
    name: str
    description: str
    tables: list[str] = Field(default_factory=list)
    severity: Severity = "INFO"


# ── Semantic context (output) ────────────────────────────────────


class GlossaryEntry(BaseModel):
    term: str = Field(description="Business term (e.g., 'Notional Amount')")
    definition: str = Field(description="Clear business definition")
    formula: Optional[str] = Field(default=None, description="Formula if applicable")
    source_tables: list[str] = Field(description="Which tables contain this data")
    source_columns: list[str] = Field(description="Specific columns")
    unit: Optional[str] = Field(default=None, description="Unit of measurement")
    synonyms: list[str] = Field(default_factory=list, description="Alternative names")
    ontology_class: Optional[str] = Field(
        default=None, description="Aligned ontology class label (e.g., FIBO)"
    )
    ontology_uri: Optional[str] = Field(
        default=None, description="URI of the aligned ontology class"
    )
    rejected_ontology_uris: list[str] = Field(
        default_factory=list,
        description="Candidate URIs a steward rejected for this term (precision-first)",
    )


class EntityRelationship(BaseModel):
    from_entity: str = Field(description="Source table/entity")
    to_entity: str = Field(description="Target table/entity")
    relationship_type: str = Field(description="one-to-many, many-to-one, many-to-many")
    foreign_key: str = Field(description="The joining column(s)")
    description: str = Field(description="Business meaning of this relationship")


class BusinessRuleContext(BaseModel):
    rule_id: str
    name: str
    description: str
    sql_hints: list[str] = Field(
        default_factory=list,
        description="SQL patterns that satisfy or violate this rule",
    )
    affected_entities: list[str] = Field(
        default_factory=list, description="Entities this rule applies to"
    )
    severity: str = "INFO"


class SemanticContext(BaseModel):
    """Complete semantic context handed to an AI agent."""

    domain: str = Field(description="Business domain")
    glossary: list[GlossaryEntry] = Field(default_factory=list)
    relationships: list[EntityRelationship] = Field(default_factory=list)
    business_rules: list[BusinessRuleContext] = Field(default_factory=list)
    key_entities: list[str] = Field(default_factory=list)
    common_queries: list[str] = Field(default_factory=list)
    generated_by: Literal["deterministic", "llm"] = "deterministic"


# ── Symbolic validation ──────────────────────────────────────────


class Violation(BaseModel):
    rule_id: str
    severity: str
    message: str


class ValidationResult(BaseModel):
    valid: bool
    violations: list[Violation] = Field(default_factory=list)
    checked_rules: list[str] = Field(default_factory=list)


class SqlExecutionResult(BaseModel):
    """Result of a guarded SQL execution: the gate's verdict plus rows, if any ran."""

    validation: ValidationResult
    columns: list[str] = Field(default_factory=list)
    rows: list[dict] = Field(default_factory=list)


# ── Ontology alignment review ────────────────────────────────────

AlignmentBand = Literal["auto", "review", "rejected", "unmapped"]


class AlignmentReviewItem(BaseModel):
    """One glossary term's best ontology candidate and its confidence band."""

    term: str
    band: AlignmentBand
    candidate_label: Optional[str] = None
    candidate_uri: Optional[str] = None
    score: float = Field(default=0.0, ge=0.0, le=1.0)


class AlignmentQueue(BaseModel):
    """The alignment review queue: every glossary term, bucketed by confidence."""

    items: list[AlignmentReviewItem] = Field(default_factory=list)


# ── Agent interaction ────────────────────────────────────────────


class AgentStep(BaseModel):
    kind: Literal["tool_call", "tool_result", "validation", "answer"]
    name: str = ""
    detail: str = ""


class AskResult(BaseModel):
    question: str
    answer: str
    steps: list[AgentStep] = Field(default_factory=list)
