"""Document ingestion: unstructured sources feed the same semantic layer.

Pipeline (docs/architecture.md "Document extraction layer"):

    file → parse → extract mentions → resolve against glossary → RDF
         → SHACL gate → GraphDB (urn:graphos:documents)

Design constraints carried over from the structured pipeline:
- extraction output is Semantic Concepts first, never storage rows;
- the LLM is optional — a heuristic extractor always works, an LLM extractor
  improves recall, Docling/GLiNER plug in as optional heavy dependencies;
- resolution to glossary terms is deterministic (same scorer as alignment);
- every mention keeps provenance back to its source document.
"""

from __future__ import annotations

import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Literal, Optional, Protocol

from pydantic import BaseModel, Field
from rdflib import RDF, RDFS, Graph, Literal as RDFLiteral, Namespace

from graphos.models import SemanticContext
from graphos.ontology import score_label
from graphos.rdf import GOS, TERM, _slug

DOCUMENT = Namespace("https://graphos.dev/document/")
MENTION = Namespace("https://graphos.dev/mention/")

DOCUMENTS_GRAPH_IRI = "urn:graphos:documents"

EntityType = Literal[
    "Organization",
    "FinancialInstrument",
    "Metric",
    "MonetaryAmount",
    "Date",
    "Currency",
    "Regulation",
    "Person",
    "Other",
]


class ExtractedMention(BaseModel):
    text: str = Field(description="Exact surface form as it appears in the document")
    entity_type: EntityType = "Other"
    context: str = Field(default="", description="Sentence the mention appears in")
    resolved_term: Optional[str] = Field(
        default=None, description="Glossary term this mention resolves to"
    )


class DocumentExtraction(BaseModel):
    mentions: list[ExtractedMention] = Field(default_factory=list)


class IngestedDocument(BaseModel):
    source: str
    title: str
    text: str
    extraction: DocumentExtraction = Field(default_factory=DocumentExtraction)


class Extractor(Protocol):
    def extract(self, text: str) -> DocumentExtraction: ...


# ── Parsing ──────────────────────────────────────────────────────


class _TextHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.chunks: list[str] = []

    def handle_data(self, data: str) -> None:
        if data.strip():
            self.chunks.append(data.strip())


def parse_file(path: str) -> str:
    """Extract plain text from txt/md/html natively, PDF via optional Docling."""
    suffix = Path(path).suffix.lower()
    if suffix == ".pdf":
        return _parse_pdf(path)
    raw = Path(path).read_text(encoding="utf-8")
    if suffix in (".html", ".htm"):
        parser = _TextHTMLParser()
        parser.feed(raw)
        return "\n".join(parser.chunks)
    if suffix in (".md", ".markdown"):
        raw = re.sub(r"^#+\s*", "", raw, flags=re.MULTILINE)
        raw = re.sub(r"[*_`]{1,3}", "", raw)
    return raw


def _parse_pdf(path: str) -> str:
    try:
        from docling.document_converter import DocumentConverter
    except ImportError as exc:
        raise ImportError(
            "PDF parsing needs Docling: pip install docling (large dependency)"
        ) from exc
    result = DocumentConverter().convert(path)
    return result.document.export_to_markdown()


# ── Extraction ───────────────────────────────────────────────────

_DATE_PATTERN = re.compile(r"\b\d{4}-\d{2}-\d{2}\b")
_MONEY_PATTERN = re.compile(r"[$€£]\s?[\d,]+(?:\.\d+)?(?:\s?(?:million|billion|M|B))?")
_ORG_PATTERN = re.compile(
    r"\b(?:[A-Z][A-Za-z&.]+\s)+(?:Inc|Corp|Group|Bank|AG|PLC|LLC|Ltd|SA|NV)\b\.?"
)


def _sentence_of(text: str, start: int) -> str:
    left = max(text.rfind(".", 0, start), text.rfind("\n", 0, start)) + 1
    right = text.find(".", start)
    right = len(text) if right == -1 else right + 1
    return text[left:right].strip()


class HeuristicExtractor:
    """Deterministic fallback: dates, monetary amounts, org-suffixed names."""

    def extract(self, text: str) -> DocumentExtraction:
        mentions: list[ExtractedMention] = []
        for pattern, entity_type in (
            (_ORG_PATTERN, "Organization"),
            (_MONEY_PATTERN, "MonetaryAmount"),
            (_DATE_PATTERN, "Date"),
        ):
            for match in pattern.finditer(text):
                surface = re.sub(r"\s+", " ", match.group(0)).strip().rstrip(".")
                mentions.append(
                    ExtractedMention(
                        text=surface,
                        entity_type=entity_type,
                        context=_sentence_of(text, match.start()),
                    )
                )
        return DocumentExtraction(mentions=mentions)


def scan_glossary_terms(text: str, context: SemanticContext) -> list[ExtractedMention]:
    """Deterministically capture glossary terms appearing in the text.

    The glossary is known up front — finding its terms is string matching,
    not model work. This guarantees document→term links for Graph RAG even
    when the extractor misses a metric.
    """
    mentions: list[ExtractedMention] = []
    for entry in context.glossary:
        pattern = re.compile(rf"\b{re.escape(entry.term)}s?\b", re.IGNORECASE)
        match = pattern.search(text)
        if match:
            mentions.append(
                ExtractedMention(
                    text=re.sub(r"\s+", " ", match.group(0)),
                    entity_type="Metric",
                    context=_sentence_of(text, match.start()),
                )
            )
    return mentions


_EXTRACTION_PROMPT = """Extract named entities from this financial document text.
Report each mention exactly as it appears (surface form), with its entity type
and the sentence it appears in. Extract organizations, financial instruments,
metrics (e.g. VaR, notional amount, liquidity ratio), monetary amounts, dates,
currencies, regulations, and people. Do not invent entities that are not in
the text.

Document text:
{text}"""


class LLMExtractor:
    """LLM-backed extraction with structured output; falls back to heuristics."""

    def __init__(self, llm):
        self._llm = llm
        self._fallback = HeuristicExtractor()

    def extract(self, text: str) -> DocumentExtraction:
        try:
            result = self._llm.with_structured_output(DocumentExtraction).invoke(
                _EXTRACTION_PROMPT.format(text=text[:12000])
            )
            if result is not None and result.mentions:
                return result
        except Exception:  # noqa: BLE001 — extraction must never hard-fail
            pass
        return self._fallback.extract(text)


_GLINER_LABELS: dict[str, EntityType] = {
    "organization": "Organization",
    "financial instrument": "FinancialInstrument",
    "financial metric": "Metric",
    "monetary amount": "MonetaryAmount",
    "date": "Date",
    "currency": "Currency",
    "regulation": "Regulation",
    "person": "Person",
}


class GLiNERExtractor:
    """Zero-shot NER via GLiNER — optional heavy dependency, injected model
    for tests. Install with: pip install gliner (pulls torch)."""

    def __init__(self, model=None, model_name: str = "urchade/gliner_medium-v2.1"):
        self._model = model
        self._model_name = model_name

    def _load_model(self):
        if self._model is None:
            try:
                from gliner import GLiNER
            except ImportError as exc:
                raise ImportError(
                    "GLiNER extraction needs the gliner package: pip install gliner"
                ) from exc
            self._model = GLiNER.from_pretrained(self._model_name)
        return self._model

    def extract(self, text: str) -> DocumentExtraction:
        model = self._load_model()
        entities = model.predict_entities(text, list(_GLINER_LABELS), threshold=0.5)
        mentions = [
            ExtractedMention(
                text=re.sub(r"\s+", " ", entity["text"]).strip(),
                entity_type=_GLINER_LABELS.get(entity["label"], "Other"),
                context=_sentence_of(text, int(entity.get("start", 0))),
            )
            for entity in entities
        ]
        return DocumentExtraction(mentions=mentions)


def make_extractor(llm=None) -> Extractor:
    """Pick the extractor: GRAPHOS_EXTRACTOR ∈ {llm, heuristic, gliner} wins;
    otherwise LLM when available, heuristics when not."""
    import os

    forced = os.environ.get("GRAPHOS_EXTRACTOR", "").lower()
    if forced == "heuristic":
        return HeuristicExtractor()
    if forced == "gliner":
        return GLiNERExtractor()
    if forced == "llm" or llm is not None:
        return LLMExtractor(llm)
    return HeuristicExtractor()


# ── Resolution & RDF ─────────────────────────────────────────────

_RESOLUTION_THRESHOLD = 0.9


def resolve_mentions(doc: IngestedDocument, context: SemanticContext) -> IngestedDocument:
    """Deterministically link mentions to glossary terms (same scorer as alignment)."""
    resolved = doc.model_copy(deep=True)
    for mention in resolved.extraction.mentions:
        mention.resolved_term = None
        best_term, best_score = None, 0.0
        for entry in context.glossary:
            score = score_label(mention.text, entry.term)
            if score > best_score:
                best_term, best_score = entry.term, score
        if best_term is not None and best_score >= _RESOLUTION_THRESHOLD:
            mention.resolved_term = best_term
    return resolved


def document_to_rdf(doc: IngestedDocument) -> Graph:
    graph = Graph()
    graph.bind("gos", GOS)

    doc_node = DOCUMENT[_slug(doc.title or doc.source)]
    graph.add((doc_node, RDF.type, GOS.Document))
    graph.add((doc_node, RDFS.label, RDFLiteral(doc.title or doc.source)))
    graph.add((doc_node, GOS.source, RDFLiteral(doc.source)))

    for index, mention in enumerate(doc.extraction.mentions):
        node = MENTION[f"{_slug(doc.title or doc.source)}-{index}"]
        graph.add((node, RDF.type, GOS.Mention))
        graph.add((node, GOS.mentionText, RDFLiteral(mention.text)))
        graph.add((node, GOS.entityType, RDFLiteral(mention.entity_type)))
        if mention.context:
            graph.add((node, GOS.context, RDFLiteral(mention.context)))
        graph.add((node, GOS.inDocument, doc_node))
        if mention.resolved_term:
            graph.add((node, GOS.refersTo, TERM[_slug(mention.resolved_term)]))
    return graph


def ingest_document(
    path: str, context: SemanticContext, llm=None
) -> tuple[IngestedDocument, Graph]:
    """Full local pipeline: parse → extract → resolve → RDF (not yet published)."""
    text = parse_file(path)
    extraction = make_extractor(llm).extract(text)
    extracted_texts = {m.text.lower() for m in extraction.mentions}
    extraction.mentions.extend(
        m for m in scan_glossary_terms(text, context) if m.text.lower() not in extracted_texts
    )
    doc = IngestedDocument(
        source=str(path),
        title=Path(path).stem.replace("-", " ").replace("_", " ").title(),
        text=text,
        extraction=extraction,
    )
    doc = resolve_mentions(doc, context)
    return doc, document_to_rdf(doc)
