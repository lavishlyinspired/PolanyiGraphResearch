


Tuesday 11:37 PM
Agents skilsss are use with coding plaforms like vscode, claude code etc only?https://agentskills.io/skill-creation/quickstart. But are they not recommended to use with laggraph lagchain python applications ?

No. In fact, I would recommend using Agent Skills in LangGraph/LangChain applications as well, especially for a project like your GraphOS.

The examples on agentskills.io focus on VS Code, Claude Code, Codex, and GitHub Copilot because those are the first products that support the Agent Skills specification out of the box. However, the specification itself is just a directory containing a SKILL.md plus optional scripts and resources. It is not tied to any IDE. 

For a Python application using LangGraph, you can implement the exact same lifecycle:

User Query
      │
      ▼
Planner (LLM)
      │
Discovers available skills
      │
Chooses relevant skill
      ▼
Load SKILL.md
      │
Execute workflow
      │
Call tools/APIs
      ▼
Return result
This is actually very similar to how LangChain's own Deep Agents work. They support Agent Skills natively, where the agent:

reads only the skill metadata initially,

loads the full SKILL.md only when needed (progressive disclosure),

executes the instructions and any associated scripts. 

For GraphOS, I'd go one step further. Instead of generic coding skills, create domain skills, for example:

Ontology Alignment

SPARQL Query Generation

Cypher Query Generation

SHACL Validation

RDF Materialization

Entity Resolution

Semantic Search

Knowledge Graph Analytics

FIBO Financial Analysis

SNOMED Clinical Reasoning

Each skill would contain:

SKILL.md (when to use it and the workflow)

Python scripts

Prompt templates

Example inputs/outputs

SPARQL/Cypher templates

Ontology documentation

Your LangGraph planner simply decides which skill(s) to activate.

So the architecture becomes:

LangGraph
├── Planner
├── Skill Registry
├── Skill Loader
├── Tool Executor
├── Memory
└── Graph Runtime
This is cleaner than putting huge prompts directly into every LangGraph node.

Given everything we've discussed about GraphOS, I think Agent Skills should become one of your core abstractions. They provide a portable way to package semantic expertise, while LangGraph remains responsible for orchestration, state management, retries, branching, and execution. The two complement each other rather than compete.


