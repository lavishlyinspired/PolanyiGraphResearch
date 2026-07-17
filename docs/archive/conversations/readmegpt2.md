



Today 2:33 AM
1000029604.jpg
1000029603.jpg
1000029602.jpg
1000029601.jpg
1000029600.jpg
What is the difference 

Whats wrong

Generated image: Polanyi Works Studio enterprise dashboard overview


Edit


This is already a strong UI, but if your goal is to build a Polanyi Works Studio that enterprise architects, data engineers, ontology engineers, and AI agents will use daily, I'd add features that expose the why behind the graph—not just the graph itself.

1. Semantic Provenance ⭐⭐⭐⭐⭐
Every concept should answer:

Why does this node exist?

Trade
────────────────────────────
Ontology      : fibo:Trade
Source tables : 5
Mapped columns: 21
Created by    : AI Alignment v2
Approved by   : John Smith
Confidence    : 97%
Last updated  : Today 10:42
2. Lineage Tab ⭐⭐⭐⭐⭐
Show how the concept was derived.

Databricks
finance.orders
      │
      ▼
Mapping Engine
      │
      ▼
fibo:Trade
      │
      ▼
Neo4j Node
This is invaluable for debugging.

3. SHACL Validation
✓ hasTradeIdentifier

✓ hasCounterparty

✗ SettlementDate missing

Warnings: 2
Users instantly know data quality issues.

4. Relationship Explorer
Instead of a static graph:

Trade
 ├── HAS_COUNTERPARTY (642k)
 ├── TRADED_IN (12M)
 ├── EXECUTED_ON (8M)
 └── SETTLED_BY (7M)
Clicking expands neighbors dynamically.

5. AI Explanation ⭐⭐⭐⭐⭐
An AI-generated explanation:

"Trade is connected to Instrument because 98% of finance.trades rows contain instrument_id. This mapping was inferred from FIBO and approved by the ontology engineer."

This is especially useful for new users.

6. Sample Instances
Show actual enterprise instances:

Trade

TRD-001
TRD-002
TRD-003
...
Click one:

Trade TRD-001

Counterparty
Goldman Sachs

Instrument
AAPL Equity

Amount
$2,500,000
7. Data Quality Score
Not just coverage:

Completeness 98%

Consistency 96%

SHACL 100%

Freshness 94%

Trust Score 96%
8. AI Query Examples
Based on the selected concept:

Ask Polanyi Works

"What are all Apple trades?"

"Show unsettled trades"

"Find trades without counterparties"

"Explain settlement failures"
9. Neighbor Concepts
Instead of only a graph:

Frequently Connected

Instrument

Legal Entity

Settlement

Market

Position

Account
This makes navigation faster.

10. Ontology Hierarchy
Thing

Entity

Transaction

FinancialTransaction

Trade
Breadcrumbs help users understand inheritance.

11. Mapping Health Dashboard
Mappings

✓ Approved 322

⚠ Needs Review 8

✗ Broken 2

AI Suggested 41
12. AI Reasoning Trace ⭐⭐⭐⭐⭐
One of the most valuable additions for Polanyi Works:

AI Reasoning

Detected table:
finance.trades

↓

Detected columns

↓

Matched FIBO

↓

Computed similarity

↓

Generated SHACL

↓

Created Neo4j nodes

↓

Confidence 97%
This makes AI decisions transparent.

My favorite enhancement
Since you're building an Agentic Polanyi Works, I'd dedicate the right panel to a Semantic Intelligence Panel with tabs like:

Overview (description, ontology, mappings)

Relationships (connected concepts and edge types)

Lineage (data flow from source to graph)

Validation (SHACL and data quality)

AI Insights (why the mappings exist, confidence, suggested improvements)

Query (sample Cypher, SPARQL, SQL, and natural-language prompts)

History (who changed mappings, when, and why)

That transforms the screen from a static graph browser into an interactive semantic engineering workspace, which aligns well with the broader vision you've described for Polanyi Works.


Mapping table in the inage you provided is misleading as trade is mapped to finance.trades, trading.orders. trading.executions. what to do as they are just staying and not used i guess

I agree. That's actually the weakest part of the UI I generated.

The problem is that Trade → finance.trades, trading.orders, trading.executions implies those tables are part of the Knowledge Layer, but they are not. They belong to the Data Source and Mapping layers.

A user may ask:

"Why are these tables here? Are they nodes in Neo4j?"

The answer is no.

Option 1 (My favorite): Remove "Mapped Tables" completely
The Knowledge Layer should focus on semantic information only.

Trade
------------------------
Ontology: fibo:Trade

Relationships
✓ TRADED_IN → Instrument
✓ HAS_COUNTERPARTY → LegalEntity
✓ SETTLED_BY → Settlement
✓ CREATES → Position

Instances
26.4M

Properties
8

Coverage
96%
If the user wants to know where the data came from, they click View Mappings.

Option 2: Replace it with "Data Sources"
Instead of listing tables, show the source systems.

Data Sources

Databricks
  5 mapped datasets

Snowflake
  2 mapped datasets

SAP
  1 mapped object
Then clicking Databricks opens the Mapping Workbench.

Option 3: Provenance (Best for enterprises)
Instead of tables, show how the concept was created.

Origin

Ontology
fibo:Trade

Created From
AI Semantic Alignment

Confidence
97%

Approved By
Ontology Team

Last Synced
2 hours ago
This tells the story of the semantic concept rather than exposing storage details.

Option 4: Add a "Mappings" tab
Your right panel becomes:

Overview

Relationships

Properties

Mappings

Lineage

Validation

History
Only when the user clicks Mappings do they see:

Databricks

finance.trades
✓ Active

finance.executions
✓ Active

trading.orders
⚠ Partial mapping
This keeps the default screen clean.

What I would build for Polanyi Works
I would keep the Knowledge Layer completely semantic.

Trade

Description

Relationships

Properties

Ontology

Business Rules

Instances

Quality

Lineage
No SQL tables.

Then the Mapping Workbench owns everything about physical assets:

Trade
      ▲
      │
finance.trades

trade.executions

orders

trade_events
This separation follows your architecture:

Data Sources → Databricks, Snowflake, APIs

Semantic Layer → FIBO ontology (GraphDB)

Mapping → Links physical data to ontology concepts

Knowledge Layer → Enterprise semantic graph (Neo4j)

Graph Explorer → Visualization of the enterprise graph

That way, every screen has a single responsibility, and users immediately know whether they're looking at physical data, semantic concepts, or mappings between them.


But how would they show in knowldge graph. Databricks

finance.trades
✓ Active

finance.executions
✓ Active

trading.orders
⚠ Partial mapping

This is exactly the right question, and it points to an important modeling decision.

The answer depends on what your Neo4j Knowledge Layer stores.

Option 1: Neo4j stores only business concepts (recommended)
Your graph contains only semantic concepts and relationships:

(Trade)-[:TRADED_IN]->(Instrument)
(Trade)-[:HAS_COUNTERPARTY]->(LegalEntity)
(Trade)-[:SETTLED_BY]->(Settlement)
In this case, Databricks tables should never appear as nodes in the Knowledge Graph.

Instead, clicking Trade could show a side panel:

Trade
──────────────
Ontology
fibo:Trade

Relationships
• TRADED_IN
• HAS_COUNTERPARTY
• SETTLED_BY

Data Sources
Databricks (3 mappings)

[Show mappings]
Only when the user clicks Show mappings do they see:

Databricks

finance.trades
✓ Complete mapping
21 columns

trading.executions
✓ Partial mapping
7 columns

trading.orders
⚠ Candidate mapping
3 columns
These are details, not graph nodes.

Option 2: Everything is a node
Some organizations model everything as a graph:

(Trade)
   |
MAPPED_TO
   |
(finance.trades)
and

(finance.trades)
      |
HAS_COLUMN
      |
(trade_id)
This works technically, but the graph becomes cluttered:

Trade
 ├── Instrument
 ├── Settlement
 ├── finance.trades
 ├── trading.orders
 ├── trade_id
 ├── execution_time
 ├── quantity
 ├── ...
For Polanyi Works, this is probably too much for the default user experience.

What I'd recommend for Polanyi Works
I think you should actually maintain two graphs in Neo4j.

1. Enterprise Knowledge Graph
This is what business users and agents query:

Trade
 ↔ Instrument
 ↔ Counterparty
 ↔ Position
No tables.

2. Metadata Graph
This stores the implementation details:

Trade
   |
MAPPED_TO
   |
finance.trades
   |
HAS_COLUMN
   |
trade_id

Trade
   |
MAPPED_TO
   |
trading.executions
Your Mapping Workbench reads from this metadata graph.

Then the Knowledge Graph UI can switch views
Graph View

● Business View      ← default

● Metadata View

● Combined View
Business View: only semantic concepts (Trade, Instrument, LegalEntity)

Metadata View: tables, columns, files, APIs

Combined View: shows MAPPED_TO edges between concepts and physical assets

This approach fits well with the architecture you've been describing. Business users stay in the semantic world, while data engineers and ontology engineers can switch to a richer view when they need to inspect how concepts are implemented in Databricks or other source systems.


