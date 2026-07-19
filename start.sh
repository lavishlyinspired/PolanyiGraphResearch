#!/bin/bash
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "Starting backend on http://localhost:8000 ..."
cd "$ROOT"
.venv/bin/python -m uvicorn apps.server.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo "Starting frontend on http://localhost:5173 ..."
cd "$ROOT/apps/studio-v1"
npm run dev &
FRONTEND_PID=$!

echo ""
echo "Backend  PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo ""
echo "Press Ctrl+C to stop both."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
