#!/bin/sh
# GraphOS container boot: seed the demo, build deterministic context, serve.
# LLM enrichment and ontology alignment can be triggered later through the
# API — boot never depends on an API key or a reachable graph store.
set -e

graphos init-demo
if [ ! -f data/semantic_context.json ]; then
    graphos generate --no-llm
fi
exec graphos serve --host 0.0.0.0 --port 8000
