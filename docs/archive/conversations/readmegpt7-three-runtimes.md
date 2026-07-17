# Polanyi Works runtime split — three runtimes, capability registry, LangGraph as substrate

*(Conversation excerpt shared 2026-07-17; distilled into `docs/architecture.md`.)*

I'd define three core components:
Planner — decides what needs to be done.
Skill Registry — knows which skills can perform each capability.
Execution Engine (Orchestrator) — actually invokes the skills, handles sequencing, parallelism, retries, and result passing. For Polanyi Works, I would separate the runtime into three runtimes, not one. This keeps responsibilities clear and makes the platform extensible.

```
                 Polanyi Works Runtime
                       │
        ┌──────────────┼──────────────┐
        │              │              │
 Semantic Runtime   Agent Runtime   Execution Runtime
```

## 1. Semantic Runtime (Brain)

Responsible for understanding meaning.

```
Semantic Runtime
│
├── Context Builder
├── Ontology Manager
├── Ontology Alignment Engine
├── Semantic Discovery
├── Business Glossary
├── Entity Resolution
├── Relationship Discovery
├── Semantic Memory
├── Context Expansion
├── Semantic Validation
├── SHACL Validator
├── SPARQL Engine
├── Ontology Versioning
└── Context Cache
```

This runtime answers: What is a Trade? Is Customer the same as Client? Which FIBO concept matches this table? How are these concepts related?

## 2. Agent Runtime (Thinking)

Responsible for agent orchestration.

```
Agent Runtime
│
├── Intent Analyzer
├── Planner
├── Plan Optimizer
├── Task Decomposer
├── Agent Registry
├── Skill Registry
├── Tool Resolver
├── Capability Matcher
├── Execution Orchestrator
├── Memory Manager
├── Reflection Engine
├── Retry Manager
├── State Manager
├── Conversation Manager
└── Multi-Agent Coordinator
```

This runtime answers: Which agents should participate? Which skills should be invoked? What order should tasks execute? Should tasks run in parallel?

## 3. Execution Runtime (Doing)

Responsible for actually interacting with systems.

```
Execution Runtime
│
├── Databricks Executor
├── Neo4j Executor
├── GraphDB Executor
├── SQL Executor
├── Cypher Executor
├── SPARQL Executor
├── Python Executor
├── MCP Executor
├── REST API Executor
├── Notebook Runner
├── Workflow Runner
├── Streaming Engine
└── Result Aggregator
```

This runtime answers: Execute this SQL. Run this Cypher query. Execute this Databricks notebook. Call this API.

## Supporting services

Shared across all runtimes: Event Bus, Cache, Security, Secrets, Audit, Observability, Metrics, Tracing, Configuration, Plugin Manager.

## End-to-end flow

```
User Question → Intent Analyzer → Planner → Semantic Runtime
→ Capability Resolution → Skill Registry → Execution Runtime
→ Databricks / Neo4j / GraphDB → Result Integration → Reflection
→ Explanation → Final Response
```

## What makes Polanyi Works unique

Many agent frameworks (LangGraph, OpenAI Agents SDK, CrewAI, AutoGen) already provide an Agent Runtime. Databricks provides data execution capabilities. GraphDB provides semantic reasoning.

The distinctive part of Polanyi Works is the **Semantic Runtime**. It discovers enterprise metadata, aligns it to ontologies (FIBO, ACTUS, SNOMED, etc.), builds an organization-specific semantic context, supplies rich business context to planners and agents, and maintains semantic memory and validates reasoning. It transforms generic agents into enterprise-aware agents.

If you're building Polanyi Works on LangGraph, avoid inventing a completely new runtime. Instead, make Polanyi Works a **semantic orchestration layer that extends LangGraph's execution model**.

Extended runtime decomposition: Session Runtime (session/state/memory/checkpoints), Planning Runtime (intent, planner, decomposer, optimizer, replanner, reflection), Semantic Runtime (discovery, context builder, ontology resolver/alignment, entity resolution, context expansion, semantic validator, glossary, SHACL, KG manager), Orchestration Runtime (LangGraph executor, scheduler, router, parallel executor, HITL, interrupts, retry, event bus), Capability Runtime (capability/skill/MCP/tool/prompt/model/policy registries), Execution Runtime (skill/MCP/tool/workflow/Python/SQL/Cypher/SPARQL/API executors), Reasoning Runtime (symbolic reasoner, LLM reasoner, neuro-symbolic fusion, rule engine, evidence collector, confidence engine, explanation builder), Observability Runtime (LangSmith, traces, metrics, cost, logs, graph viz, timeline), Extension Runtime (plugins, connectors, skills, templates, custom agents/nodes).

## How this maps to LangGraph

Instead of every node directly calling tools, use capabilities:

```
Planner → Capability → Capability Registry → (Skill | MCP Tool | Native Tool | API | Workflow) → Executor
```

The planner doesn't know whether the implementation is a Databricks Skill, an MCP server, a LangChain Tool, a Python function, or a REST API. It requests a capability such as DiscoverMetadata, GenerateSQL, ExecuteSQL, SearchOntology, RunCypher, ValidateSHACL. The Capability Runtime resolves that to the best implementation.

Skills become first-class citizens; each skill advertises capabilities, inputs, outputs, authentication, cost, latency, supported models. MCP becomes another execution target — to Polanyi Works, Skills and MCP tools are simply different providers of capabilities.

Orchestration patterns to support: Sequential, Parallel, Router, Reflection (Planner → Executor → Critic → Retry?), Supervisor, Human-in-the-loop.

## Where Polanyi Works adds value beyond LangGraph

LangGraph already gives orchestration, state, routing, interrupts, checkpoints, execution patterns. Polanyi Works should contribute what LangGraph intentionally leaves domain-neutral:

1. **Semantic Runtime** (ontology alignment, context construction, enterprise semantics)
2. **Capability Runtime** (resolve abstract capabilities to Skills, MCP servers, tools, or APIs)
3. **Reasoning Runtime** (combine symbolic reasoning, ontologies, and LLM reasoning with explainability)

This keeps Polanyi Works aligned with LangGraph's orchestration philosophy while making it a reusable semantic operating system rather than just another agent framework.
