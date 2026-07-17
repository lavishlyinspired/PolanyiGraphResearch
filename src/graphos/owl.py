"""OWL reasoning via Owlready2 — reasoner-optional, like everything else.

Structural hierarchy traversal (ancestors/descendants over asserted
subClassOf) works everywhere. Full OWL inference (HermiT) activates when a
Java runtime is present; without one, `run_reasoner` says so instead of
failing. Ontologies load from local OWL files or from a scoped GraphDB
export (the subclass neighborhood of chosen classes, as RDF/XML).
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

import httpx


@lru_cache(maxsize=1)
def java_available() -> bool:
    """A usable Java runtime — macOS ships a /usr/bin/java stub that only errors."""
    if shutil.which("java") is None:
        return False
    try:
        probe = subprocess.run(
            ["java", "-version"], capture_output=True, timeout=10
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return probe.returncode == 0


@dataclass(frozen=True)
class OwlClassInfo:
    iri: str
    label: str


@dataclass(frozen=True)
class ReasonerResult:
    ran: bool
    consistent: Optional[bool] = None
    detail: str = ""


def _label_of(cls) -> str:
    labels = list(getattr(cls, "label", []) or [])
    return str(labels[0]) if labels else cls.iri.split("#")[-1].split("/")[-1]


class OwlReasoner:
    def __init__(self) -> None:
        import owlready2

        self._world = owlready2.World()
        self._ontology = None

    def load_file(self, path: str):
        self._ontology = self._world.get_ontology(f"file://{Path(path).resolve()}").load()
        return self._ontology

    def load_from_graphdb(
        self,
        class_uris: list[str],
        endpoint: Optional[str] = None,
        repository: Optional[str] = None,
    ):
        """Export the subclass neighborhood of `class_uris` from GraphDB and load it."""
        import os

        ep = (endpoint or os.environ.get("GRAPHDB_ENDPOINT", "")).rstrip("/")
        repo = repository or os.environ.get("GRAPHDB_REPOSITORY", "fibo")
        if not ep:
            raise ValueError("GRAPHDB_ENDPOINT is required")

        values = " ".join(f"<{uri}>" for uri in class_uris)
        query = f"""
        PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        CONSTRUCT {{
            ?c a owl:Class ; rdfs:subClassOf ?p ; rdfs:label ?label .
        }} WHERE {{
            VALUES ?seed {{ {values} }}
            {{ ?seed rdfs:subClassOf* ?c }} UNION {{ ?c rdfs:subClassOf* ?seed }}
            ?c rdfs:subClassOf ?p .
            FILTER(isIRI(?p))
            OPTIONAL {{ ?c rdfs:label ?label }}
        }}
        """
        response = httpx.post(
            f"{ep}/repositories/{repo}",
            data={"query": query},
            headers={"Accept": "application/rdf+xml"},
            timeout=60,
        )
        response.raise_for_status()
        with tempfile.NamedTemporaryFile(
            suffix=".owl", delete=False, mode="w", encoding="utf-8"
        ) as f:
            f.write(response.text)
            path = f.name
        return self.load_file(path)

    def _class(self, iri: str):
        return self._world[iri]

    def ancestors(self, iri: str) -> list[OwlClassInfo]:
        """Superclass chain (nearest first), excluding the class itself and owl:Thing."""
        import owlready2

        cls = self._class(iri)
        if cls is None:
            return []
        seen: list[OwlClassInfo] = []
        current = cls
        while True:
            parents = [
                p
                for p in current.is_a
                if isinstance(p, owlready2.ThingClass) and p is not owlready2.Thing
            ]
            if not parents:
                break
            current = parents[0]
            seen.append(OwlClassInfo(iri=current.iri, label=_label_of(current)))
        return seen

    def descendants(self, iri: str) -> list[OwlClassInfo]:
        """All transitive subclasses, excluding the class itself."""
        cls = self._class(iri)
        if cls is None:
            return []
        found = {
            sub.iri: OwlClassInfo(iri=sub.iri, label=_label_of(sub))
            for sub in cls.descendants()
            if sub.iri != iri
        }
        return sorted(found.values(), key=lambda c: c.label)

    def reason_about(self, iri: str) -> dict:
        """Structural hierarchy plus reasoner status for one class."""
        reasoner_result = self.run_reasoner()
        return {
            "class": iri,
            "ancestors": [a.__dict__ for a in self.ancestors(iri)],
            "descendants": [d.__dict__ for d in self.descendants(iri)],
            "reasoner": reasoner_result.__dict__,
        }

    def run_reasoner(self) -> ReasonerResult:
        """Run HermiT if a Java runtime exists; report honestly otherwise."""
        if not java_available():
            return ReasonerResult(
                ran=False,
                detail="No Java runtime found — HermiT/Pellet need Java. "
                "Structural hierarchy traversal remains available.",
            )
        import owlready2

        try:
            with self._ontology:
                owlready2.sync_reasoner(self._world, debug=0)
        except owlready2.base.OwlReadyInconsistentOntologyError:
            return ReasonerResult(ran=True, consistent=False, detail="Ontology is inconsistent")
        except Exception as exc:  # noqa: BLE001 — reasoner failures reported, not raised
            return ReasonerResult(ran=False, detail=f"Reasoner failed: {exc}")
        return ReasonerResult(ran=True, consistent=True, detail="HermiT completed")


def reason_about_class(class_uri: str) -> dict:
    """Capability handler: scoped GraphDB export → Owlready2 → hierarchy + reasoning."""
    reasoner = OwlReasoner()
    reasoner.load_from_graphdb([class_uri])
    return reasoner.reason_about(class_uri)
