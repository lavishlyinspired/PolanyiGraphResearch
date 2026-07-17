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
from pydantic import BaseModel, Field

from graphos.models import SemanticContext

# Prefix/substring hits (0.5–0.7) are useful for search ranking but too
# imprecise to attach automatically ("Revenue" is not a "revenue bond").
_MIN_ALIGNMENT_SCORE = 0.9


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

    def search_classes(self, term: str, limit: int = 5) -> list[OntologyCandidate]:
        token = _normalize(term).split(" ")[0] if term else ""
        if not token:
            return []
        query = f"""
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
        SELECT DISTINCT ?class ?label ?definition WHERE {{
            ?class a owl:Class ; rdfs:label ?label .
            OPTIONAL {{ ?class skos:definition ?definition }}
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
            candidates.append(
                OntologyCandidate(
                    uri=binding["class"]["value"],
                    label=label,
                    definition=binding.get("definition", {}).get("value", ""),
                    score=score_label(term, label),
                )
            )
        candidates.sort(key=lambda c: c.score, reverse=True)
        return candidates[:limit]


def align_glossary(context: SemanticContext, store: OntologyStore) -> SemanticContext:
    """Attach the best-scoring ontology class to each glossary term."""
    aligned = context.model_copy(deep=True)
    for entry in aligned.glossary:
        entry.ontology_class = None
        entry.ontology_uri = None
        candidates = store.search_classes(entry.term)
        best = max(candidates, key=lambda c: c.score, default=None)
        if best is not None and best.score >= _MIN_ALIGNMENT_SCORE:
            entry.ontology_class = best.label
            entry.ontology_uri = best.uri
    return aligned


def graphdb_configured() -> bool:
    return bool(os.environ.get("GRAPHDB_ENDPOINT"))
