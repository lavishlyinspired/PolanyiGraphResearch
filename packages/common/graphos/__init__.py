"""GraphOS — a semantic runtime that grounds AI agents in enterprise data.

Pipeline: introspect a database -> generate governed semantic context
(glossary, relationships, business rules) -> validate agent queries against
the rules -> answer questions through a grounded SQL agent.
"""

from graphos.models import (
    BusinessRule,
    BusinessRuleContext,
    EntityRelationship,
    GlossaryEntry,
    SchemaSnapshot,
    SemanticContext,
    ValidationResult,
)

__version__ = "0.1.0"

__all__ = [
    "BusinessRule",
    "BusinessRuleContext",
    "EntityRelationship",
    "GlossaryEntry",
    "SchemaSnapshot",
    "SemanticContext",
    "ValidationResult",
    "__version__",
]
