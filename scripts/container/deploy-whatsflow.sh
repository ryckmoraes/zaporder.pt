#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-staging}"
TAG="${2:-$(date -u +%Y%m%dT%H%M%SZ)}"
IMAGE_REPO="${IMAGE_REPO:-zaporderx}"
BASE_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
STATE_DIR="$BASE_DIR/.deploy"
COMPOSE_FILE="$BASE_DIR/docker-compose.whatsflow.yml"
DOCKER_BIN="${DOCKER_BIN:-sudo -E docker}"

case "$ENVIRONMENT" in
  staging)
    ENV_FILE="${ENV_FILE:-.env.staging}"
    PROJECT_NAME="${PROJECT_NAME:-zaporderx-staging}"
    APP_PORT="${APP_PORT:-3000}"
    ;;
  production)
    ENV_FILE="${ENV_FILE:-.env.production}"
    PROJECT_NAME="${PROJECT_NAME:-zaporderx-production}"
    APP_PORT="${APP_PORT:-3000}"
    ;;
  *)
    echo "usage: $0 <staging|production> [tag]"
    exit 1
    ;;
esac

mkdir -p "$STATE_DIR"
CURRENT_TAG_FILE="$STATE_DIR/${ENVIRONMENT}.current"
PREVIOUS_TAG_FILE="$STATE_DIR/${ENVIRONMENT}.previous"

if [[ -f "$CURRENT_TAG_FILE" ]]; then
  cp "$CURRENT_TAG_FILE" "$PREVIOUS_TAG_FILE"
fi

echo "[deploy] environment=$ENVIRONMENT"
echo "[deploy] image=$IMAGE_REPO:$TAG"
echo "[deploy] env_file=$ENV_FILE"
echo "[deploy] project=$PROJECT_NAME"

$DOCKER_BIN build -f "$BASE_DIR/Dockerfile" -t "$IMAGE_REPO:$TAG" "$BASE_DIR"

if [[ "${STOP_PM2:-true}" == "true" ]]; then
  pm2 stop zaporderx zaporderx-worker >/dev/null 2>&1 || true
fi

IMAGE_REPO="$IMAGE_REPO" \
IMAGE_TAG="$TAG" \
ENV_FILE="$ENV_FILE" \
APP_PORT="$APP_PORT" \
  $DOCKER_BIN compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d --remove-orphans --pull never

echo "$TAG" > "$CURRENT_TAG_FILE"
echo "[deploy] done. current tag: $TAG"


