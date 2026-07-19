"""Real named-entity extraction over free text (compliance-flag
narratives, investment-policy notes) via spaCy. Optional, like every
other heavy dependency in this project (embeddings, GDS, GraphRAG):
degrades honestly when spaCy or its model isn't installed, never
fabricates an entity that wasn't actually extracted.

audit_compliance_narrative is the genuinely valuable capability this
enables: a compliance flag's free-text description states a percentage
exposure at the time it was raised, but that number can go stale as real
positions change. Extracting the stated figure and comparing it against
the real, currently-computed percentage catches a narrative that no
longer matches the portfolio's actual numbers."""

from __future__ import annotations

import re
from typing import Any, Optional

_MODEL_NAME = "en_core_web_sm"
_PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")


def spacy_available() -> bool:
    try:
        import spacy

        spacy.util.get_package_path(_MODEL_NAME)
        return True
    except Exception:  # noqa: BLE001 — availability probe
        return False


def resolve_nlp_model() -> Optional[Any]:
    """The real loaded spaCy model, or None if spaCy/the model isn't
    installed -- never raises."""
    if not spacy_available():
        return None
    import spacy

    return spacy.load(_MODEL_NAME)


def extract_flag_entities(text: str, nlp: Optional[Any] = None) -> dict[str, list[str]]:
    """Real spaCy NER over free text. Empty lists -- never fabricated --
    when no model is available or nothing was found."""
    if nlp is None:
        return {"percentages": [], "organizations": [], "money": []}
    doc = nlp(text)
    return {
        "percentages": [ent.text for ent in doc.ents if ent.label_ == "PERCENT"],
        "organizations": [ent.text for ent in doc.ents if ent.label_ == "ORG"],
        "money": [ent.text for ent in doc.ents if ent.label_ == "MONEY"],
    }


def parse_stated_percentage(text: str) -> Optional[float]:
    """'2.1%' -> 0.021. None for text with no percentage, never guessed."""
    match = _PERCENT_RE.match(text.strip())
    if not match:
        return None
    return float(match.group(1)) / 100


def audit_compliance_narrative(
    description: str,
    real_percentage: float,
    nlp: Optional[Any] = None,
    tolerance: float = 0.005,
) -> dict[str, Any]:
    """Extract the first percentage the narrative states and compare it to
    the real, currently-computed percentage. `matches_real_data` is None
    (not False) when the narrative states no percentage at all -- an
    honest "can't judge," not a fabricated mismatch."""
    entities = extract_flag_entities(description, nlp=nlp)
    stated_texts = entities["percentages"]
    stated_percentage = parse_stated_percentage(stated_texts[0]) if stated_texts else None
    if stated_percentage is None:
        return {"stated_percentage": None, "real_percentage": real_percentage, "matches_real_data": None}
    matches = abs(stated_percentage - real_percentage) <= tolerance
    return {
        "stated_percentage": stated_percentage,
        "real_percentage": real_percentage,
        "matches_real_data": matches,
    }
