#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-${GOOGLE_CLOUD_PROJECT:-}}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-novacraft-x402-api}"
X402_PAY_TO="${X402_PAY_TO:-0x445F7447532d3e9300194E289C7C023A5f3CFc9E}"
X402_NETWORK="${X402_NETWORK:-eip155:8453}"
X402_FACILITATOR_URL="${X402_FACILITATOR_URL:-https://facilitator.payai.network}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-flash}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: set PROJECT_ID (your Google Cloud project linked to billing 010DBE-51F426-FA29BD)." >&2
  exit 1
fi

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "Warning: GEMINI_API_KEY is empty. Deploying in deterministic-only mode (still charges Base USDC via x402)." >&2
fi

ENV_VARS="X402_PAY_TO=${X402_PAY_TO},X402_NETWORK=${X402_NETWORK},X402_FACILITATOR_URL=${X402_FACILITATOR_URL},GEMINI_MODEL=${GEMINI_MODEL}"
if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  ENV_VARS="${ENV_VARS},GEMINI_API_KEY=${GEMINI_API_KEY}"
fi

export CLOUDSDK_CORE_DISABLE_PROMPTS=1

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com --quiet

gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi \
  --quiet \
  --set-env-vars "$ENV_VARS"
