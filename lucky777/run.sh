#!/usr/bin/env bash
# One command to play. Builds the frontend if needed, then serves everything
# from http://localhost:8000
set -e
cd "$(dirname "$0")"

if [ ! -d frontend/dist ]; then
  echo "==> building frontend"
  (cd frontend && npm install && npm run build)
fi

echo "==> installing python deps"
pip install -q -r backend/requirements.txt

echo "==> http://localhost:8000"
echo "    first run? cd backend && python -m app.cli create-admin <name> && python -m app.cli load-feed"
cd backend && exec uvicorn app.main:app --port 8000 --reload
