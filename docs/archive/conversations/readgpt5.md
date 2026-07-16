



Yes—I checked the latest Neo4j Agent Skills repository and documentation. What Neo4j calls Agent Skills is not the same as LangChain agents or LangGraph nodes. It's actually a very interesting pattern, and I think it's highly relevant for GraphOS. 

What is a Neo4j Agent Skill?
A skill is essentially a package of domain expertise.

For example:

neo4j-cypher-skill/
│
├── SKILL.md
├── references/
│   ├── cypher25.md
│   ├── indexes.md
│   ├── planner.md
│   └── ...
├── scripts/
│   ├── validate.py
│   └── ...
└── examples/
It contains:

Instructions (SKILL.md)

Reference documentation

Examples

Scripts

Best practices

Validation logic

The agent loads the skill only when needed, using a progressive disclosure model to reduce context usage. 

This is exactly what GraphOS needs
Instead of only having:

Entity Extraction Agent
you could have:

FIBO Ontology Skill

Financial Entity Linking Skill

RDF Materialization Skill

SHACL Validation Skill

SPARQL Skill

Cypher Skill

Neo4j GDS Skill

GraphRAG Skill

Temporal Reasoning Skill

Evidence Verification Skill

SEC Filing Skill

Annual Report Skill
These are skills, not agents.

Then LangGraph orchestrates them
The workflow becomes:

User Goal

↓

Planner

↓

Execution Graph

↓

Materialize RDF Skill

↓

SHACL Skill

↓

GraphDB Skill

↓

Neo4j Projection Skill

↓

GDS Skill

↓

Answer
The planner decides which skills are needed; LangGraph executes them.

I think GraphOS can go much further than Neo4j
Neo4j skills are database-specific:

neo4j-cypher-skill

neo4j-gds-skill

neo4j-driver-python-skill
GraphOS could introduce graph-agnostic semantic skills.

For example:

semantic-materialization-skill

ontology-grounding-skill

entity-resolution-skill

shacl-validation-skill

rdf-compiler-skill

owl-reasoning-skill

temporal-reasoning-skill

provenance-skill

trust-scoring-skill

evidence-corroboration-skill
Notice that none of these depend on Neo4j.

Then you could add vendor-specific skills:

neo4j-skill

graphdb-skill

stardog-skill

jena-skill

neptune-skill

memgraph-skill
Each implements the same capability for a different backend.

A capability-based design
Instead of saying:

"Use Neo4j."

the planner says:

Capability Needed:

Materialize RDF

↓

Available Skills:

✓ RDFLib Skill

✓ GraphDB Skill

✓ Jena Skill

↓

Choose one
This makes GraphOS portable across graph technologies.

My recommendation
I would absolutely adopt the Agent Skills concept, but not copy Neo4j's skills directly.

I'd create a GraphOS Skill SDK where every skill follows a common structure, for example:

semantic-materialization-skill/
│
├── skill.yaml          # metadata
├── SKILL.md            # instructions
├── input.schema.json
├── output.schema.json
├── prompts/
├── references/
├── examples/
├── tests/
├── scripts/
├── validators/
└── adapters/
Then the GraphOS planner can discover skills by capability rather than by product.

For example:

ontology-grounding

entity-linking

rdf-materialization

cypher-generation

sparql-generation

graph-projection

community-detection

graph-rag

shacl-validation

This would be significantly broader than the Neo4j approach because it turns GraphOS into a semantic skill platform rather than a Neo4j skill library, while still allowing Neo4j-specific skills to plug into the same framework. I think that's a much stronger long-term architecture for the SaaS platform you're designing.


But then planner is dependent on llm to decide which skill to choose. Isnt it

Yes. If you build the planner as:

Goal
  ↓
LLM
  ↓
Choose Skill
then the planner is probabilistic. It can choose the wrong skill, skip a required step, or call unnecessary skills.

That's why many production systems are moving away from an "LLM decides everything" architecture.

A better approach is capability resolution, not free-form planning.
Instead of asking:

"Which skill should I use?"

the system asks:

"What capability is required?"

For example:

User goal:

"Ingest this HDFC annual report into the knowledge graph."

The first stage is deterministic:

Intent:
INGEST_DOCUMENT
Now your GraphOS knows the required capabilities:

INGEST_DOCUMENT

↓

Required Capabilities

✓ Parse document
✓ Extract entities
✓ Resolve ontology
✓ Materialize RDF
✓ Validate SHACL
✓ Store RDF
✓ Project Neo4j
No LLM is needed to determine that workflow.

Only after the capabilities are known do you resolve implementations:

Capability: RDF Materialization

Available Skills:
- RDFLib Skill
- Jena Skill
- Stardog Skill

Choose configured implementation
Again, no LLM.

Where should the LLM be used?
Only where there is genuine ambiguity.

For example:

The article says:

"Apple reported..."

Do you mean:

Apple Inc.

Apple Bank

The fruit?

That's a reasoning problem.

Or:

The ontology retriever finds three candidate classes:

CommercialBank

RetailBank

DepositoryInstitution

The LLM can rank those candidates based on context.

Notice the difference:

LLM

↓

Choose between 3 retrieved ontology classes
instead of

LLM

↓

Invent any ontology class
The first is much safer.

Think of GraphOS like a compiler
A compiler doesn't ask an LLM which optimization pass to run.

It already knows the pipeline:

Lexing
↓

Parsing
↓

Type Checking
↓

Optimization
↓

Code Generation
GraphOS should work similarly.

For an ingestion workflow:

Parse
↓

Extract
↓

Ground
↓

Validate
↓

Reason
↓

Persist
That sequence is fixed.

Where LangGraph fits
LangGraph doesn't require an LLM at every node.

Your graph can look like:

START
   │
   ▼
Parse
   │
   ▼
Extract
   │
   ▼
Ground
   │
   ▼
Validate
   │
   ▼
Persist
   │
   ▼
END
Those are deterministic nodes.

Only the "Ground" node might invoke an LLM if deterministic entity linking can't resolve an ambiguity.

For GraphOS, I'd actually recommend three layers of decision making:
Workflow selection (deterministic): Based on the user's intent (INGEST_DOCUMENT, ANSWER_QUERY, RUN_ANALYTICS, etc.), select a predefined workflow.

Capability resolution (deterministic): Map each required capability to the configured skill implementation (e.g., RDFLib for RDF generation, GraphDB for semantic storage).

Semantic reasoning (LLM only when needed): Resolve ambiguities, rank ontology candidates, interpret complex natural language, or generate explanations.

That architecture keeps the LLM where it adds value—reasoning under uncertainty—while ensuring the overall execution remains predictable, auditable, and reproducible. For a platform like GraphOS, I believe this is a stronger foundation than an agent that freely decides both the workflow and the tools at every step.


Yes but skills would execute using llm only right. Meaning you give skill.md to llm and then it takes of the rest. Is that correct understanding?

Yes, that's exactly how Neo4j Agent Skills work today. Your understanding is correct.

A simplified execution looks like this:

User Goal
      │
      ▼
Agent
      │
      ▼
Load skill.md
      │
      ▼
LLM reads:
- Instructions
- Examples
- References
- Constraints
      │
      ▼
LLM decides what to do
      │
      ▼
Calls tools / executes code
The SKILL.md is primarily prompt engineering plus reference material. The LLM follows those instructions and may execute scripts or tools provided by the skill.

But I don't think GraphOS should stop there
This is where I think you can innovate.

Today, most agent skills are:

SKILL.md
     +
LLM
     =
Execution
In other words, the LLM is the execution engine.

For GraphOS, I would flip this around.

SKILL
│
├── Manifest
├── Input Schema
├── Output Schema
├── Deterministic Code
├── Validators
├── Policies
├── Tests
├── Optional Prompt
└── Optional LLM
Notice the difference.

The LLM becomes optional, not mandatory.

Example 1: RDF Materialization Skill
Today (LLM-centric):

Prompt:
Convert this article into RDF.
GraphOS:

materialize(article):

    entities = deterministic_extractor(article)

    ontology = ontology_matcher(entities)

    triples = rdflib_builder(ontology)

    validate(triples)

    return triples
No LLM required unless there is ambiguity.

Example 2: SHACL Skill
Neo4j-style:

LLM:
Please validate this RDF using SHACL.
GraphOS:

pyshacl.validate(graph, shapes)
100% deterministic.

Example 3: Cypher Skill
Instead of:

LLM:
Write Cypher.
You could have:

Intent

↓

Graph Schema

↓

Cypher Generator

↓

Syntax Validator

↓

Execution
The LLM only participates if the intent is ambiguous.

I think skills should have two execution modes
Skill
│
├── Deterministic Engine
│
└── LLM Engine
When deterministic code exists:

Use deterministic engine.
Otherwise:

Fallback to LLM.
Even better: skill composition
Imagine your financial-materialization-skill doesn't directly call the LLM.

Instead it orchestrates other skills:

Financial Materialization Skill

↓

Document Parsing Skill

↓

Entity Linking Skill

↓

Ontology Grounding Skill

↓

RDF Skill

↓

SHACL Skill

↓

GraphDB Skill
Now skills can call other skills, forming a directed acyclic graph (DAG) of capabilities rather than a single prompt.

This is where I think GraphOS can differentiate
Neo4j's Agent Skills are an excellent idea, but they are still fundamentally LLM-first.

I think GraphOS should be Capability-first.

A GraphOS skill would declare:

name: rdf-materialization

capabilities:
  - materialize_rdf

execution:
  deterministic: rdflib.py
  llm: materializer.md

validation:
  pyshacl

tests:
  tests/

confidence:
  deterministic
Then the runtime decides:

Can I execute deterministically? Yes → do that.

Is there ambiguity? Yes → invoke the LLM with the skill's prompt and constraints.

Validate the result before continuing.

That gives you the benefits of Neo4j's skill packaging while making GraphOS far more reliable and auditable, because the LLM is used as a specialized reasoning component rather than the default execution engine. I think that's a stronger architecture for the kind of semantic operating system you're building.


