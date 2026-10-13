#!/usr/bin/env bash
# Start command for the Render web service (deployment-spec §3). Run from backend/:
#   bash render-start.sh
#
# 1. Bring the database schema up to date. Render's free plan has no shell or
#    one-off jobs, so migrations run here, on every start; when nothing is new
#    this is a quick no-op. If a migration fails, the server does not start.
# 2. Start the API on the port Render gives us.
#
# --no-proxy-headers: the app reads the visitor's address itself, using
# TRUSTED_PROXY_HOPS (app/ratelimit.py), so uvicorn must not rewrite it.
set -euo pipefail
cd "$(dirname "$0")"

echo "Applying database migrations..."
.venv/bin/alembic upgrade head

echo "Starting the API on port ${PORT:-8000}..."
exec .venv/bin/uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --no-proxy-headers \
  --no-server-header
