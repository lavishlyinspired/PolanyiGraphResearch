# Knowledge

The Polanyi Works artifact store — generated at runtime, gitignored (READMEs stay).

| Location | Artifact | Produced by |
|---|---|---|
| `financial_demo.db` | demo database | `polanyi init-demo` |
| `semantic-models/semantic_context.json` | the semantic context | `polanyi generate` |
| `rdf/semantic_context.ttl` | its RDF/SKOS form | `polanyi rdf` |
| `documents/*.ttl` | ingested document RDF | `polanyi ingest-document` |
| `graphs/` | materialized property graphs | Neo4j (`polanyi materialize`) |
| `owl/` | scoped OWL exports | `polanyi reason` |
