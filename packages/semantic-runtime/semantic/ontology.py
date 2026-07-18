"""Ontology alignment: ground glossary terms in a formal ontology (FIBO).

Retrieval is deterministic — SPARQL label search against a GraphDB repository,
lexically scored. No LLM invents ontology classes; an LLM may later *rank*
retrieved candidates, never expand them (readgpt5 design note).
"""

from __future__ import annotations

import os
import re
from typing import Optional, Protocol

import httpx
from pydantic import BaseModel, Field  # noqa: F401 — Field used by _RankingChoice

from polanyi.models import AlignmentBand, AlignmentQueue, AlignmentReviewItem, SemanticContext

# Prefix/substring hits (0.5–0.7) are useful for search ranking but too
# imprecise to attach automatically ("Revenue" is not a "revenue bond").
_MIN_ALIGNMENT_SCORE = 0.9

# Below this a candidate is too imprecise to even warrant a human's review;
# also the floor `align_glossary` uses before asking the LLM to rank.
_MIN_REVIEW_SCORE = 0.5


class OntologyCandidate(BaseModel):
    uri: str
    label: str
    definition: str = ""
    score: float = Field(default=0.0, ge=0.0, le=1.0)


class OntologyStore(Protocol):
    def search_classes(self, term: str, limit: int = 5) -> list[OntologyCandidate]: ...


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", " ", text.lower()).strip()


def _singular(word: str) -> str:
    if word.endswith("ies"):
        return word[:-3] + "y"
    if word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def score_label(term: str, label: str) -> float:
    """Lexical similarity between a business term and an ontology class label."""
    term_n, label_n = _normalize(term), _normalize(label)
    if not term_n or not label_n:
        return 0.0
    if term_n == label_n:
        return 1.0
    term_s = " ".join(_singular(w) for w in term_n.split())
    label_s = " ".join(_singular(w) for w in label_n.split())
    if term_s == label_s:
        return 0.9
    if label_s.startswith(term_s) or term_s.startswith(label_s):
        return 0.7
    if term_s in label_s or label_s in term_s:
        return 0.5
    return 0.0


class GraphDBOntologyStore:
    """SPARQL-backed ontology search against an Ontotext GraphDB repository."""

    def __init__(self, endpoint: Optional[str] = None, repository: Optional[str] = None):
        self.endpoint = (endpoint or os.environ.get("GRAPHDB_ENDPOINT", "")).rstrip("/")
        self.repository = repository or os.environ.get("GRAPHDB_REPOSITORY", "fibo")
        if not self.endpoint:
            raise ValueError("GRAPHDB_ENDPOINT is required for ontology search")

    @property
    def _query_url(self) -> str:
        return f"{self.endpoint}/repositories/{self.repository}"

    def is_available(self) -> bool:
        try:
            response = httpx.get(f"{self.endpoint}/rest/repositories", timeout=3)
            return response.status_code == 200
        except httpx.HTTPError:
            return False

    def sparql_query(self, query: str) -> list[dict]:
        """Run an arbitrary read-only SPARQL query, flattened to plain dicts.

        Shared by the CLI (`polanyi sparql`) and the API (`POST /api/sparql`) —
        one implementation of the GraphDB query call, not two drifting copies.
        """
        response = httpx.post(
            self._query_url,
            data={"query": query},
            headers={"Accept": "application/sparql-results+json"},
            timeout=30,
        )
        response.raise_for_status()
        bindings = response.json()["results"]["bindings"]
        return [{key: value["value"] for key, value in binding.items()} for binding in bindings]

    def expand_subclasses(self, class_uri: str, limit: int = 100) -> list[OntologyCandidate]:
        """All transitive subclasses of a class — deterministic hierarchy
        expansion ("all financial instruments" → every subclass), no reasoner
        or LLM required."""
        query = f"""
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        SELECT DISTINCT ?class ?label WHERE {{
            ?class rdfs:subClassOf* <{class_uri}> .
            OPTIONAL {{ ?class rdfs:label ?label }}
        }} LIMIT {int(limit)}
        """
        response = httpx.post(
            self._query_url,
            data={"query": query},
            headers={"Accept": "application/sparql-results+json"},
            timeout=30,
        )
        response.raise_for_status()
        return [
            OntologyCandidate(
                uri=binding["class"]["value"],
                label=binding.get("label", {}).get("value", ""),
                score=1.0,
            )
            for binding in response.json()["results"]["bindings"]
        ]

    def search_classes(self, term: str, limit: int = 5) -> list[OntologyCandidate]:
        token = _normalize(term).split(" ")[0] if term else ""
        if not token:
            return []
        query = f"""
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
        SELECT DISTINCT ?class ?label ?definition ?subCount WHERE {{
            ?class a owl:Class ; rdfs:label ?label .
            OPTIONAL {{ ?class skos:definition ?skosDef }}
            OPTIONAL {{ ?class rdfs:comment ?comment }}
            BIND(COALESCE(?skosDef, ?comment, "") AS ?definition)
            {{
                SELECT ?class (COUNT(DISTINCT ?sub) AS ?subCount) WHERE {{
                    ?sub rdfs:subClassOf ?class .
                }} GROUP BY ?class
            }}
            UNION
            {{
                SELECT ?class (0 AS ?subCount) WHERE {{
                    ?class a owl:Class .
                    MINUS {{ ?sub rdfs:subClassOf ?class }}
                }}
            }}
            FILTER(CONTAINS(LCASE(STR(?label)), "{token}"))
        }} LIMIT 50
        """
        response = httpx.post(
            self._query_url,
            data={"query": query},
            headers={"Accept": "application/sparql-results+json"},
            timeout=15,
        )
        response.raise_for_status()
        candidates = []
        for binding in response.json()["results"]["bindings"]:
            label = binding["label"]["value"]
            base_score = score_label(term, label)
            sub_count = int(binding.get("subCount", {}).get("value", "0"))
            # Boost main classes (has subclasses) and penalize leaf nodes
            if sub_count > 0:
                boosted = min(base_score + 0.15, 1.0)
            else:
                boosted = max(base_score - 0.1, 0.0)
            candidates.append(
                OntologyCandidate(
                    uri=binding["class"]["value"],
                    label=label,
                    definition=binding.get("definition", {}).get("value", ""),
                    score=round(boosted, 2),
                )
            )
        candidates.sort(key=lambda c: c.score, reverse=True)
        return candidates[:limit]


class _RankingChoice(BaseModel):
    """LLM output schema for candidate ranking: pick one URI or decline."""

    chosen_uri: Optional[str] = Field(
        default=None,
        description="URI of the best-matching candidate, or null if none fit",
    )


_RANKING_PROMPT = """You are aligning an enterprise business glossary with a formal ontology.

Business term: {term}
Definition: {definition}

Candidate ontology classes (choose ONE or none):
{candidates}

Pick the candidate whose meaning matches the business term itself — reject
candidates that are merely related, broader, or narrower concepts (for
example, "revenue bond" is NOT a match for "Revenue"). Respond with the
chosen candidate's URI, or null if no candidate is a true match."""


def _rank_with_llm(entry, candidates: list[OntologyCandidate], llm) -> Optional[OntologyCandidate]:
    """Ask the LLM to choose among retrieved candidates — never to invent one."""
    listing = "\n".join(
        f"- {c.uri}\n  label: {c.label}" + (f"\n  definition: {c.definition}" if c.definition else "")
        for c in candidates
    )
    prompt = _RANKING_PROMPT.format(
        term=entry.term, definition=entry.definition, candidates=listing
    )
    try:
        choice = llm.with_structured_output(_RankingChoice).invoke(prompt)
    except Exception:  # noqa: BLE001 — ranking is best-effort enrichment
        return None
    if choice is None or not choice.chosen_uri:
        return None
    return next((c for c in candidates if c.uri == choice.chosen_uri), None)


def align_glossary(
    context: SemanticContext, store: OntologyStore, llm=None
) -> SemanticContext:
    """Attach ontology classes to glossary terms.

    Exact/inflection matches (score >= 0.9) attach directly. When an LLM is
    supplied, ambiguous retrievals (0.5–0.9) are ranked by it — constrained
    to the retrieved list, with the option to decline.
    """
    aligned = context.model_copy(deep=True)
    for entry in aligned.glossary:
        entry.ontology_class = None
        entry.ontology_uri = None
        candidates = store.search_classes(entry.term)
        best = max(candidates, key=lambda c: c.score, default=None)
        if best is not None and best.score >= _MIN_ALIGNMENT_SCORE:
            entry.ontology_class = best.label
            entry.ontology_uri = best.uri
            continue
        if llm is not None:
            plausible = [c for c in candidates if c.score >= _MIN_REVIEW_SCORE]
            chosen = _rank_with_llm(entry, plausible, llm) if plausible else None
            if chosen is not None:
                entry.ontology_class = chosen.label
                entry.ontology_uri = chosen.uri
    return aligned


def classify_band(score: Optional[float]) -> AlignmentBand:
    """Bucket a candidate score into a review band.

    ≥ 0.90 attaches automatically; 0.50–0.89 needs a human decision; below the
    floor (or no candidate at all) is unmapped.
    """
    if score is None or score < _MIN_REVIEW_SCORE:
        return "unmapped"
    if score >= _MIN_ALIGNMENT_SCORE:
        return "auto"
    return "review"


def _resolve_best_candidate(
    entry, candidates: list[OntologyCandidate], llm=None
) -> Optional[OntologyCandidate]:
    """The single source of truth for "which candidate is currently best for this
    term" — shared by the review queue (what's displayed) and accept/reject (what's
    persisted), so a user can never accept or reject a different candidate than the
    one they were actually shown.

    Ranking only ever applies to the ambiguous 0.50–0.89 band: an already-confident
    top candidate (>=0.90) is returned as-is, matching `align_glossary`'s rule that
    the LLM ranks retrieved candidates, never overrides a clear lexical match.
    """
    best = max(candidates, key=lambda c: c.score, default=None)
    if best is None or best.score >= _MIN_ALIGNMENT_SCORE or llm is None:
        return best
    plausible = [c for c in candidates if c.score >= _MIN_REVIEW_SCORE]
    if not plausible:
        return best
    chosen = _rank_with_llm(entry, plausible, llm)
    return chosen if chosen is not None else best


def alignment_queue(context: SemanticContext, store: OntologyStore, llm=None) -> AlignmentQueue:
    """Every glossary term, bucketed by alignment state.

    A term already aligned (persisted ``ontology_uri`` — auto ≥0.90 or a human
    accept) is reported as 'auto'; the rest are classified by their best live
    candidate's score. Honoring persisted state makes this a real review queue:
    a term you align stays aligned rather than reappearing every load.

    When `llm` is given, a term in the 'review' band displays the LLM's ranked
    pick among real candidates instead of the raw top lexical score — the 'auto'/
    'unmapped'/'rejected' bands are never affected.
    """
    items = []
    for entry in context.glossary:
        candidates = store.search_classes(entry.term)
        if entry.ontology_uri is not None:
            score = next((c.score for c in candidates if c.uri == entry.ontology_uri), 0.0)
            items.append(
                AlignmentReviewItem(
                    term=entry.term,
                    band="auto",
                    candidate_label=entry.ontology_class,
                    candidate_uri=entry.ontology_uri,
                    score=score,
                )
            )
            continue
        best = max(candidates, key=lambda c: c.score, default=None)
        if best is not None and best.uri in entry.rejected_ontology_uris:
            band: AlignmentBand = "rejected"
        else:
            band = classify_band(best.score if best is not None else None)
        displayed = best
        if band == "review":
            displayed = _resolve_best_candidate(entry, candidates, llm) or best
        items.append(
            AlignmentReviewItem(
                term=entry.term,
                band=band,
                candidate_label=displayed.label if displayed is not None else None,
                candidate_uri=displayed.uri if displayed is not None else None,
                score=displayed.score if displayed is not None else 0.0,
            )
        )
    return AlignmentQueue(items=items)


def accept_alignment(
    context: SemanticContext, term: str, store: OntologyStore, llm=None
) -> SemanticContext:
    """Attach a term's best retrieved candidate — a human accepting the alignment.

    Re-runs retrieval server-side and resolves the same candidate the review queue
    displayed (see `_resolve_best_candidate`), so an accept can only ever pick from
    what the deterministic search returned, never an arbitrary URI, and never drifts
    from what the user actually reviewed. Raises ``LookupError`` for an unknown term
    or one with no candidate.
    """
    entry = next((e for e in context.glossary if e.term == term), None)
    if entry is None:
        raise LookupError(f"No glossary term named {term!r}")
    best = _resolve_best_candidate(entry, store.search_classes(entry.term), llm)
    if best is None:
        raise LookupError(f"No ontology candidate to accept for {term!r}")
    entry.ontology_class = best.label
    entry.ontology_uri = best.uri
    return context


def reject_alignment(
    context: SemanticContext, term: str, store: OntologyStore, llm=None
) -> SemanticContext:
    """Reject a term's best retrieved candidate — precision over recall.

    Records the candidate URI so the term surfaces in the 'rejected' band and is
    not re-suggested, and clears any persisted alignment that pointed at it. Resolves
    the same candidate the review queue displayed, symmetric with `accept_alignment`.
    Raises ``LookupError`` for an unknown term or one with no candidate.
    """
    entry = next((e for e in context.glossary if e.term == term), None)
    if entry is None:
        raise LookupError(f"No glossary term named {term!r}")
    best = _resolve_best_candidate(entry, store.search_classes(entry.term), llm)
    if best is None:
        raise LookupError(f"No ontology candidate to reject for {term!r}")
    if best.uri not in entry.rejected_ontology_uris:
        entry.rejected_ontology_uris.append(best.uri)
    if entry.ontology_uri == best.uri:
        entry.ontology_uri = None
        entry.ontology_class = None
    return context


def graphdb_configured() -> bool:
    return bool(os.environ.get("GRAPHDB_ENDPOINT"))
