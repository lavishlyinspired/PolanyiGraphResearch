# Python semantic/ontology stack for the Polanyi Works pipeline

*(Conversation excerpt shared 2026-07-17; distilled into the "Python semantic
stack" section of `docs/architecture.md` and implemented in `polanyi/rdf.py`.)*

Consider the Python semantic/ontology stack for the Polanyi Works pipeline, especially
how each library fits into an ontology-driven ingestion and reasoning workflow:

| Tool | Purpose |
|---|---|
| RDFLib | Build, parse, query, and serialize RDF (Turtle, RDF/XML, JSON-LD, N-Triples). Create RDF triples programmatically. |
| pySHACL | Validate RDF graphs against SHACL shapes (data quality and constraints). |
| Owlready2 | Load/edit OWL ontologies and perform local OWL reasoning using HermiT/Pellet. |
| pyoxigraph | High-performance embedded RDF store with SPARQL support. Good for local semantic querying before loading into GraphDB. |
| GraphDB (Ontotext) | Enterprise RDF triple store with reasoning, SPARQL endpoint, and persistent storage. |
| Neo4j + neosemantics (n10s) | Property graph analytics and Graph RAG. Import/export RDF between Neo4j and semantic stores. |
| SPARQLWrapper | Python client for querying remote SPARQL endpoints. |
| Apache Jena | Java semantic web framework (Fuseki, TDB2, ARQ). Useful if you need Java tooling. |
| rdflib-jsonld | JSON-LD support for RDFLib. |
| SKOS (via RDFLib) | Model taxonomies, vocabularies, and business glossaries. |

The AI extraction layer that feeds this semantic stack:

- **Docling** — Parse PDFs, DOCX, HTML, tables.
- **spaCy** — NLP and entity extraction.
- **GLiNER** — Zero-shot Named Entity Recognition.
- **OntoGPT** — Ontology-aware information extraction.
- **FastEmbed / Sentence Transformers** — Embeddings for semantic search.

The architecture outlined:

```
Documents
    │
    ▼
Docling
    │
    ▼
spaCy / GLiNER / OntoGPT
    │
    ▼
RDFLib
    │
    ▼
pySHACL
    │
    ▼
Owlready2 (optional reasoning)
    │
    ▼
pyoxigraph (optional local RDF store)
    │
    ▼
GraphDB (persistent semantic layer)
    │
    ├── SPARQL
    └── Neo4j (Graph RAG & analytics)
```

Conclusion — the core Polanyi Works stack:

✅ RDFLib · ✅ pySHACL · ✅ Owlready2 · ✅ pyoxigraph · ✅ GraphDB · ✅ Neo4j (with n10s)

This gives RDF creation, semantic validation, ontology reasoning, SPARQL
querying, enterprise semantic storage, and graph analytics in one pipeline.
