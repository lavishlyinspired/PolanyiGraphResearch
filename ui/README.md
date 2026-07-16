# GraphOS Studio UI

A React + TypeScript + Tailwind CSS front-end for exploring an enterprise semantic
layer: data source discovery, FIBO ontology browsing, a Neo4j-style knowledge view,
column-to-ontology alignment review, an interactive knowledge graph canvas, and an
agent reasoning-trace workspace.

## Views

| Tab | Description |
| --- | --- |
| **Data Sources** | Connected systems, discovery stats, and the Unity Catalog tree |
| **Semantic** | FIBO ontology browser (definitions, properties, SHACL constraints) |
| **Knowledge** | Enterprise semantic graph with overview, relationships, mappings, lineage, validation, AI insights, and query tabs |
| **Mapping** | Alignment workbench for accepting/rejecting column → FIBO mappings |
| **Knowledge Graph** | Interactive draggable/pannable graph canvas with node inspection |
| **Agent Workspace** | Natural-language queries with step-by-step reasoning traces |

All data is currently mocked in `src/data/mockData.ts`.

## Development

```bash
npm install
npm run dev      # start dev server
npm run build    # type-check and build for production
npm run preview  # preview the production build
```

Requires Node 18+.
