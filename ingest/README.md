# Ingest

The original note here (`generate/ingestpipeline.md`) said: *"ingest to
databricks. prepare it."* — that is now implemented in the product:

```bash
# Push the demo financial dataset into a Databricks Unity Catalog schema
graphos ingest-databricks --catalog main --schema graphos_demo

# Then run the semantic pipeline against Databricks instead of SQLite
graphos generate --db "databricks://token:$DATABRICKS_TOKEN@<host>/sql/1.0/warehouses/<id>?catalog=main&schema=graphos_demo"
```

Implementation: `src/graphos/ingest.py` (statement generation is pure and
tested; execution uses `graphos.connectors.databricks`).
