# Skills

**Live plugin surface.** Every subdirectory containing a `skill.yaml` is
discovered at startup and registered into the Capability Registry
(`graphos.kernel.skills.load_skills`); skills marked `agent_tool: true`
become tools the grounded agent can call directly.

```
platform/skills/<domain>/<skill-name>/
├── skill.yaml      # name, capability, description, handler, agent_tool, metadata
└── handler.py      # exports the handler function
```

Shipped example: [`finance/fx-conversion/`](finance/fx-conversion/) —
registers `ConvertCurrency` and gives the agent a currency-conversion tool.

Override the directory with `GRAPHOS_SKILLS_DIR`. Skills execute local code —
treat this directory with the same trust as installed packages.

The other subdirectories (ontology, reasoning, retrieval, …) are documented
placeholders for skill domains; drop a manifest in any of them to make it real.
