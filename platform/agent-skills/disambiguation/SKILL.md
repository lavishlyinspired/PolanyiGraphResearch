---
name: disambiguation
description: When to consult the ontology specialist, the graph specialist, or both for a question that could span domains.
---

Some questions need both the ontology specialist and the graph specialist
in the same turn — for example, "which FIBO class does the term with the
highest PageRank score belong to?" needs the graph specialist to find the
top-ranked term first, then the ontology specialist to classify it.

Call ask_graph_specialist first for anything about structure, similarity,
or centrality in the knowledge graph (e.g. "what term is most similar to
X", "which term is most central", "what communities exist"). Call
ask_ontology_specialist for anything about FIBO class hierarchy or
definitions of a *specific, already-known* term.

If a question asks for a similar/related/most-central term **and** that
term's FIBO classification, treat it as two sequential steps: first ask
the graph specialist which term it is, then ask the ontology specialist
about that exact term by name. Do not send the whole compound question to
one specialist and expect it to resolve both parts — a specialist only
has the tools for its own domain and will (correctly) report no match
rather than guess at the other domain's answer.
