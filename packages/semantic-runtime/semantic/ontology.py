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

from polanyi.models import (
    AlignmentBand,
    AlignmentQueue,
    AlignmentReviewItem,
    OntologyCandidate,
    SemanticContext,
)

# Prefix/substring hits (0.5–0.7) are useful for search ranking but too
# imprecise to attach automatically ("Revenue" is not a "revenue bond").
_MIN_ALIGNMENT_SCORE = 0.9

# Below this a candidate is too imprecise to even warrant a human's review;
# also the floor `align_glossary` uses before asking the LLM to rank.
_MIN_REVIEW_SCORE = 0.5

# How many candidates AlignmentReviewItem.candidates carries for a review-band
# term — enough to show real alternatives without overwhelming the UI.
_MAX_REVIEW_CANDIDATES = 3


class OntologyStore(Protocol):
    def search_classes(self, term: str, limit: int = 5) -> list[OntologyCandidate]: ...
    def class_hierarchy(self, class_uri: str) -> tuple[list[str], list[str]]: ...


class EmbeddingIndex(Protocol):
    """What `embeddings.EmbeddingOntologyIndex` provides — declared here (not
    imported) so ontology.py never depends on embeddings.py; embeddings.py
    already depends on this module for `OntologyCandidate`."""

    def search(self, text: str, limit: int = 5) -> list[OntologyCandidate]: ...
    def is_bidirectionally_confirmed(
        self, term: str, glossary_terms: list[str], candidate_label: str
    ) -> bool: ...


def _normalize(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", " ", text.lower()).strip()


def _singular(word: str) -> str:
    if word.endswith("ies"):
        return word[:-3] + "y"
    if word.endswith("s") and not word.endswith("ss"):
        return word[:-1]
    return word


def _score_and_reason(term: str, label: str) -> tuple[float, str]:
    """The score_label decision, plus which rule produced it — one
    implementation so the score and its human-readable explanation can never
    drift apart."""
    term_n, label_n = _normalize(term), _normalize(label)
    if not term_n or not label_n:
        return 0.0, "no match"
    if term_n == label_n:
        return 1.0, "exact match"
    term_s = " ".join(_singular(w) for w in term_n.split())
    label_s = " ".join(_singular(w) for w in label_n.split())
    if term_s == label_s:
        return 0.9, "singular/plural match"
    if label_s.startswith(term_s) or term_s.startswith(label_s):
        return 0.7, "prefix match"
    if term_s in label_s or label_s in term_s:
        return 0.5, "substring match"
    return 0.0, "no match"


def score_label(term: str, label: str) -> float:
    """Lexical similarity between a business term and an ontology class label."""
    return _score_and_reason(term, label)[0]


def score_reason(term: str, label: str) -> str:
    """Which rule `score_label` matched — for human-readable rationale text."""
    return _score_and_reason(term, label)[1]


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

    def class_hierarchy(self, class_uri: str) -> tuple[list[str], list[str]]:
        """Immediate parent and children labels (one hop each direction) for a
        class — real structural context for LLM ranking (the "right level of
        abstraction" signal), without a graph database."""
        query = f"""
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        SELECT ?kind ?label WHERE {{
            {{
                <{class_uri}> rdfs:subClassOf ?parent .
                ?parent rdfs:label ?label .
                BIND("parent" AS ?kind)
            }}
            UNION
            {{
                ?child rdfs:subClassOf <{class_uri}> .
                ?child rdfs:label ?label .
                BIND("child" AS ?kind)
            }}
        }}
        """
        response = httpx.post(
            self._query_url,
            data={"query": query},
            headers={"Accept": "application/sparql-results+json"},
            timeout=15,
        )
        response.raise_for_status()
        parents: list[str] = []
        children: list[str] = []
        for binding in response.json()["results"]["bindings"]:
            label = binding["label"]["value"]
            (parents if binding["kind"]["value"] == "parent" else children).append(label)
        return parents, children

    def all_classes(self) -> list[tuple[str, str, str]]:
        """Every FIBO class as (uri, label, definition), unfiltered — the
        corpus an embedding index is built from, fetched once and cached by
        the caller rather than on every request."""
        query = """
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
        SELECT ?class ?label ?definition WHERE {
            ?class a owl:Class ; rdfs:label ?label .
            OPTIONAL { ?class skos:definition ?skosDef }
            OPTIONAL { ?class rdfs:comment ?comment }
            BIND(COALESCE(?skosDef, ?comment, "") AS ?definition)
        }
        """
        response = httpx.post(
            self._query_url,
            data={"query": query},
            headers={"Accept": "application/sparql-results+json"},
            timeout=30,
        )
        response.raise_for_status()
        return [
            (
                binding["class"]["value"],
                binding["label"]["value"],
                binding.get("definition", {}).get("value", ""),
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
            base_score, reason = _score_and_reason(term, label)
            sub_count = int(binding.get("subCount", {}).get("value", "0"))
            # Boost main classes (has subclasses) and penalize leaf nodes
            if sub_count > 0:
                boosted = min(base_score + 0.15, 1.0)
                reason += f"; boosted +0.15 for {sub_count} subclass{'' if sub_count == 1 else 'es'}"
            else:
                boosted = max(base_score - 0.1, 0.0)
                reason += "; penalized -0.10, leaf class"
            candidates.append(
                OntologyCandidate(
                    uri=binding["class"]["value"],
                    label=label,
                    definition=binding.get("definition", {}).get("value", ""),
                    score=round(boosted, 2),
                    rationale=reason,
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


def _candidate_listing_entry(candidate: OntologyCandidate, store: Optional[OntologyStore]) -> str:
    """One candidate's prompt text: label/definition plus real FIBO parent/children
    context when a store is available — never invented, omitted when absent."""
    text = f"- {candidate.uri}\n  label: {candidate.label}"
    if candidate.definition:
        text += f"\n  definition: {candidate.definition}"
    if store is not None:
        parents, children = store.class_hierarchy(candidate.uri)
        if parents:
            text += f"\n  parent: {', '.join(parents)}"
        if children:
            text += f"\n  children: {', '.join(children)}"
    return text


def _rank_with_llm(
    entry, candidates: list[OntologyCandidate], llm, store: Optional[OntologyStore] = None
) -> Optional[OntologyCandidate]:
    """Ask the LLM to choose among retrieved candidates — never to invent one."""
    listing = "\n".join(_candidate_listing_entry(c, store) for c in candidates)
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


def _merge_candidates(
    lexical: list[OntologyCandidate],
    embedded: list[OntologyCandidate],
    hcb_confirmed_uris: set[str],
) -> list[OntologyCandidate]:
    """Combine lexical + embedding candidates, deduped by URI (higher score
    wins). An HCB-confirmed candidate's score floors at the auto-alignment
    threshold — bidirectional confirmation is itself a high-confidence signal,
    independent of the raw cosine score."""
    by_uri: dict[str, OntologyCandidate] = {}
    for candidate in lexical + embedded:
        existing = by_uri.get(candidate.uri)
        if existing is None or candidate.score > existing.score:
            by_uri[candidate.uri] = candidate
    for uri in hcb_confirmed_uris:
        candidate = by_uri.get(uri)
        if candidate is not None and candidate.score < _MIN_ALIGNMENT_SCORE:
            by_uri[uri] = candidate.model_copy(update={"score": _MIN_ALIGNMENT_SCORE})
    return sorted(by_uri.values(), key=lambda c: c.score, reverse=True)


def _candidates_for(
    entry,
    store: OntologyStore,
    embedding_index: Optional[EmbeddingIndex],
    glossary_terms: list[str],
) -> list[OntologyCandidate]:
    """All real candidates for a term — lexical always, embedding-based (with
    HCB confirmation) when an index is supplied. One shared fetch so every
    caller combines lexical and semantic retrieval the same way."""
    lexical = store.search_classes(entry.term)
    if embedding_index is None:
        return lexical
    embedded = embedding_index.search(entry.term)
    confirmed_uris = {
        c.uri
        for c in embedded
        if embedding_index.is_bidirectionally_confirmed(entry.term, glossary_terms, c.label)
    }
    return _merge_candidates(lexical, embedded, confirmed_uris)


def align_glossary(
    context: SemanticContext,
    store: OntologyStore,
    llm=None,
    embedding_index: Optional[EmbeddingIndex] = None,
) -> SemanticContext:
    """Attach ontology classes to glossary terms.

    Exact/inflection matches (score >= 0.9) attach directly. When an LLM is
    supplied, ambiguous retrievals (0.5–0.9) are ranked by it — constrained
    to the retrieved list, with the option to decline.
    """
    aligned = context.model_copy(deep=True)
    glossary_terms = [e.term for e in aligned.glossary]
    for entry in aligned.glossary:
        entry.ontology_class = None
        entry.ontology_uri = None
        candidates = _candidates_for(entry, store, embedding_index, glossary_terms)
        best = max(candidates, key=lambda c: c.score, default=None)
        if best is not None and best.score >= _MIN_ALIGNMENT_SCORE:
            entry.ontology_class = best.label
            entry.ontology_uri = best.uri
            continue
        if llm is not None:
            plausible = [c for c in candidates if c.score >= _MIN_REVIEW_SCORE]
            chosen = _rank_with_llm(entry, plausible, llm, store=store) if plausible else None
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
    entry,
    candidates: list[OntologyCandidate],
    llm=None,
    store: Optional[OntologyStore] = None,
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
    chosen = _rank_with_llm(entry, plausible, llm, store=store)
    return chosen if chosen is not None else best


def alignment_queue(
    context: SemanticContext,
    store: OntologyStore,
    llm=None,
    embedding_index: Optional[EmbeddingIndex] = None,
) -> AlignmentQueue:
    """Every glossary term, bucketed by alignment state.

    A term already aligned (persisted ``ontology_uri`` — auto ≥0.90 or a human
    accept) is reported as 'auto'; the rest are classified by their best live
    candidate's score. Honoring persisted state makes this a real review queue:
    a term you align stays aligned rather than reappearing every load.

    When `llm` is given, a term in the 'review' band displays the LLM's ranked
    pick among real candidates instead of the raw top lexical score — the 'auto'/
    'unmapped'/'rejected' bands are never affected. When `embedding_index` is
    given, semantic candidates lexical search missed are merged in too (see
    `_candidates_for`).
    """
    items = []
    glossary_terms = [e.term for e in context.glossary]
    for entry in context.glossary:
        candidates = _candidates_for(entry, store, embedding_index, glossary_terms)
        top_candidates = sorted(candidates, key=lambda c: c.score, reverse=True)[
            :_MAX_REVIEW_CANDIDATES
        ]
        if entry.ontology_uri is not None:
            score = next((c.score for c in candidates if c.uri == entry.ontology_uri), 0.0)
            items.append(
                AlignmentReviewItem(
                    term=entry.term,
                    band="auto",
                    candidate_label=entry.ontology_class,
                    candidate_uri=entry.ontology_uri,
                    score=score,
                    candidates=top_candidates,
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
            displayed = _resolve_best_candidate(entry, candidates, llm, store=store) or best
        items.append(
            AlignmentReviewItem(
                term=entry.term,
                band=band,
                candidate_label=displayed.label if displayed is not None else None,
                candidate_uri=displayed.uri if displayed is not None else None,
                score=displayed.score if displayed is not None else 0.0,
                candidates=top_candidates,
            )
        )
    return AlignmentQueue(items=items)


def _choose_candidate(
    entry,
    candidates: list[OntologyCandidate],
    llm=None,
    store: Optional[OntologyStore] = None,
    candidate_uri: Optional[str] = None,
) -> Optional[OntologyCandidate]:
    """Which candidate a write operation (accept/reject) should act on: an
    explicit user choice when given — constrained to what was actually
    retrieved, same "never expand the list" rule as LLM ranking — else the
    same resolution the review queue used to decide what to display."""
    if candidate_uri is not None:
        return next((c for c in candidates if c.uri == candidate_uri), None)
    return _resolve_best_candidate(entry, candidates, llm, store=store)


def accept_alignment(
    context: SemanticContext,
    term: str,
    store: OntologyStore,
    llm=None,
    embedding_index: Optional[EmbeddingIndex] = None,
    candidate_uri: Optional[str] = None,
) -> SemanticContext:
    """Attach a term's best retrieved candidate — a human accepting the alignment.

    Re-runs retrieval server-side and resolves the same candidate the review queue
    displayed (see `_resolve_best_candidate`), so an accept can only ever pick from
    what the deterministic search returned, never an arbitrary URI, and never drifts
    from what the user actually reviewed — unless `candidate_uri` names a specific
    alternative from the review queue's top-N list. Raises ``LookupError`` for an
    unknown term or one with no matching candidate.
    """
    entry = next((e for e in context.glossary if e.term == term), None)
    if entry is None:
        raise LookupError(f"No glossary term named {term!r}")
    glossary_terms = [e.term for e in context.glossary]
    candidates = _candidates_for(entry, store, embedding_index, glossary_terms)
    best = _choose_candidate(entry, candidates, llm, store=store, candidate_uri=candidate_uri)
    if best is None:
        raise LookupError(f"No ontology candidate to accept for {term!r}")
    entry.ontology_class = best.label
    entry.ontology_uri = best.uri
    return context


def reject_alignment(
    context: SemanticContext,
    term: str,
    store: OntologyStore,
    llm=None,
    embedding_index: Optional[EmbeddingIndex] = None,
    candidate_uri: Optional[str] = None,
) -> SemanticContext:
    """Reject a term's best retrieved candidate — precision over recall.

    Records the candidate URI so the term surfaces in the 'rejected' band and is
    not re-suggested, and clears any persisted alignment that pointed at it. Resolves
    the same candidate the review queue displayed, symmetric with `accept_alignment`
    (including the optional `candidate_uri` override). Raises ``LookupError`` for an
    unknown term or one with no matching candidate.
    """
    entry = next((e for e in context.glossary if e.term == term), None)
    if entry is None:
        raise LookupError(f"No glossary term named {term!r}")
    glossary_terms = [e.term for e in context.glossary]
    candidates = _candidates_for(entry, store, embedding_index, glossary_terms)
    best = _choose_candidate(entry, candidates, llm, store=store, candidate_uri=candidate_uri)
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
