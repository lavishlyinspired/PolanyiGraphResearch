#!/bin/sh
# Create the FIBO repository in GraphDB and (optionally) import FIBO itself.
# Runs as a one-shot init container; safe to re-run (idempotent).
set -e

GRAPHDB="http://graphdb:7200"

echo "Waiting for GraphDB..."
until curl -sf "$GRAPHDB/rest/repositories" > /dev/null 2>&1; do
    sleep 2
done

if curl -sf "$GRAPHDB/rest/repositories" | grep -q '"id":"fibo"'; then
    echo "Repository 'fibo' already exists"
else
    echo "Creating repository 'fibo'..."
    curl -sf -X POST "$GRAPHDB/rest/repositories" \
        -F "config=@/config/graphdb-repo-config.ttl"
    echo "Repository created"
fi

if [ "${IMPORT_FIBO:-true}" = "true" ]; then
    COUNT=$(curl -sf "$GRAPHDB/repositories/fibo/size" || echo 0)
    if [ "$COUNT" -gt 1000 ] 2>/dev/null; then
        echo "FIBO already loaded ($COUNT statements)"
    else
        FIBO_URL="${FIBO_URL:-https://spec.edmcouncil.org/fibo/ontology/master/latest/prod.fibo-quickstart.ttl}"
        echo "Importing FIBO from $FIBO_URL (this can take a few minutes)..."
        if curl -sfL "$FIBO_URL" -o /tmp/fibo.ttl; then
            curl -sf -X POST "$GRAPHDB/repositories/fibo/statements" \
                -H "Content-Type: text/turtle" \
                --data-binary @/tmp/fibo.ttl \
                && echo "FIBO imported" \
                || echo "WARNING: FIBO import failed — repository is empty but usable"
        else
            echo "WARNING: could not download FIBO — repository is empty but usable"
        fi
    fi
fi

# search_classes() (polanyi.semantic.ontology) queries this Lucene GraphDB
# Connector for full-text label search instead of a FILTER(CONTAINS(...))
# scan. GraphDB 11's connector API requires explicit one-time creation (no
# "IF NOT EXISTS" — unlike Neo4j's index DDL), so this step is idempotent
# by checking luc:listConnectors first. The legacy owlim/lucene#fts
# predicate some older docs mention does not work on GraphDB 11.
EXISTING_CONNECTORS=$(curl -sf -X POST "$GRAPHDB/repositories/fibo" \
    --data-urlencode 'query=PREFIX luc: <http://www.ontotext.com/connectors/lucene#> SELECT ?cntUri { ?cntUri luc:listConnectors ?cntStr . }' \
    -H "Accept: application/sparql-results+json" || echo "")
if echo "$EXISTING_CONNECTORS" | grep -q 'instance#class_labels'; then
    echo "Lucene connector 'class_labels' already exists"
else
    echo "Creating Lucene connector 'class_labels' (full-text search over class labels)..."
    cat > /tmp/create-lucene-connector.rq <<'RQEOF'
PREFIX luc: <http://www.ontotext.com/connectors/lucene#>
PREFIX luc-index: <http://www.ontotext.com/connectors/lucene/instance#>
INSERT DATA {
    luc-index:class_labels luc:createConnector '''
{
  "types": ["http://www.w3.org/2002/07/owl#Class"],
  "fields": [
    {"fieldName": "label", "propertyChain": ["http://www.w3.org/2000/01/rdf-schema#label"]}
  ]
}
''' .
}
RQEOF
    curl -sf -X POST "$GRAPHDB/repositories/fibo/statements" \
        --data-urlencode "update@/tmp/create-lucene-connector.rq" \
        && echo "Lucene connector created" \
        || echo "WARNING: Lucene connector creation failed — search_classes() relies on it exclusively (no CONTAINS fallback), so ontology search will return no candidates until this is resolved"
fi
echo "GraphDB init complete"
