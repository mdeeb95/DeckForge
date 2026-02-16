#!/usr/bin/env bash
# ─── DeckForge Backend Deploy Script ──────────────────────────────────────────
# Deploys the FastAPI backend to Railway and verifies the health endpoint.
# Usage: ./scripts/deploy-backend.sh
set -euo pipefail

RAILWAY_URL="https://deckforge-api-production.up.railway.app"
HEALTH_ENDPOINT="${RAILWAY_URL}/health"

# ─── Preflight checks ────────────────────────────────────────────────────────

if ! command -v railway &> /dev/null; then
  echo "Error: Railway CLI not found."
  echo "Install it: npm i -g @railway/cli"
  exit 1
fi

if ! railway whoami &> /dev/null; then
  echo "Error: Not logged in to Railway."
  echo "Run: railway login"
  exit 1
fi

# ─── Deploy ───────────────────────────────────────────────────────────────────

echo "Deploying DeckForge backend to Railway..."
cd "$(dirname "$0")/../backend"

railway up --detach

echo "Deploy triggered. Waiting 15s for service to start..."
sleep 15

# ─── Health check ─────────────────────────────────────────────────────────────

echo "Checking health endpoint: ${HEALTH_ENDPOINT}"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_ENDPOINT}" || true)

if [ "$HTTP_STATUS" = "200" ]; then
  echo "Health check passed (HTTP 200)"
  RESPONSE=$(curl -s "${HEALTH_ENDPOINT}")
  echo "Response: ${RESPONSE}"
else
  echo "Warning: Health check returned HTTP ${HTTP_STATUS}"
  echo "The deploy may still be in progress. Check Railway dashboard."
fi

# ─── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "Service URL: ${RAILWAY_URL}"
echo "Dashboard:   https://railway.com/project/6865c1d2-fffc-4961-89a1-e00f986f2a59"
