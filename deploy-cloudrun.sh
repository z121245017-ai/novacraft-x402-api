#!/usr/bin/env bash
set -euo pipefail

export CLOUDSDK_CORE_DISABLE_PROMPTS=1

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

echo "Configuring project $PROJECT_ID in $REGION (native Vertex AI mode)..."
gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  compute.googleapis.com \
  iam.googleapis.com \
  --quiet

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
BUILD_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
echo "Ensuring IAM roles on default compute/build service account: $BUILD_SA"

for ROLE in \
  roles/serviceusage.serviceUsageConsumer \
  roles/cloudbuild.builds.builder \
  roles/artifactregistry.writer \
  roles/logging.logWriter \
  roles/storage.objectAdmin \
  roles/aiplatform.user; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${BUILD_SA}" \
    --role="$ROLE" \
    --condition=None \
    --quiet >/dev/null || echo "Warning: binding $ROLE skipped/partial"
done

ENV_VARS="X402_PAY_TO=${X402_PAY_TO},X402_NETWORK=${X402_NETWORK},X402_FACILITATOR_URL=${X402_FACILITATOR_URL},GEMINI_MODEL=${GEMINI_MODEL},GOOGLE_GENAI_USE_VERTEXAI=true,VERTEX_PROJECT_ID=${PROJECT_ID},VERTEX_LOCATION=${REGION}"
if [[ -n "${GEMINI_API_KEY:-}" ]]; then
  ENV_VARS="${ENV_VARS},GEMINI_API_KEY=${GEMINI_API_KEY}"
fi

echo "Waiting 12s for IAM propagation..."
sleep 12

deploy_once() {
  gcloud run deploy "$SERVICE_NAME" \
    --source . \
    --region "$REGION" \
    --allow-unauthenticated \
    --min-instances 0 \
    --max-instances 3 \
    --memory 512Mi \
    --quiet \
    --set-env-vars "$ENV_VARS"
}

if ! deploy_once; then
  echo "First deploy attempt failed (often IAM propagation lag); waiting 20s and retrying once..."
  sleep 20
  deploy_once
fi
