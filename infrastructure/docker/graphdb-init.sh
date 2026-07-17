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
echo "GraphDB init complete"
