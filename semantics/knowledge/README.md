# Knowledge

The GraphOS artifact store — generated at runtime, gitignored (READMEs stay).

| Location | Artifact | Produced by |
|---|---|---|
| `financial_demo.db` | demo database | `graphos init-demo` |
| `semantic-models/semantic_context.json` | the semantic context | `graphos generate` |
| `rdf/semantic_context.ttl` | its RDF/SKOS form | `graphos rdf` |
| `documents/*.ttl` | ingested document RDF | `graphos ingest-document` |
| `graphs/` | materialized property graphs | Neo4j (`graphos materialize`) |
| `owl/` | scoped OWL exports | `graphos reason` |
