#!/bin/sh
# Polanyi Works container boot: seed the demo, build deterministic context, serve.
# LLM enrichment and ontology alignment can be triggered later through the
# API — boot never depends on an API key or a reachable graph store.
set -e

polanyi init-demo
if [ ! -f data/semantic_context.json ]; then
    polanyi generate --no-llm
fi
exec polanyi serve --host 0.0.0.0 --port 8000
