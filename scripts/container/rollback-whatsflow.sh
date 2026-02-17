#!/usr/bin/env bash
set -euo pipefail

ENVIRONMENT="${1:-staging}"
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
    echo "usage: $0 <staging|production>"
    exit 1
    ;;
esac

PREVIOUS_TAG_FILE="$STATE_DIR/${ENVIRONMENT}.previous"
CURRENT_TAG_FILE="$STATE_DIR/${ENVIRONMENT}.current"

if [[ ! -f "$PREVIOUS_TAG_FILE" ]]; then
  echo "[rollback] no previous tag found for $ENVIRONMENT"
  exit 1
fi

PREV_TAG="$(cat "$PREVIOUS_TAG_FILE")"
CUR_TAG=""
if [[ -f "$CURRENT_TAG_FILE" ]]; then
  CUR_TAG="$(cat "$CURRENT_TAG_FILE")"
fi

echo "[rollback] environment=$ENVIRONMENT"
echo "[rollback] rolling back to $IMAGE_REPO:$PREV_TAG"

IMAGE_REPO="$IMAGE_REPO" \
IMAGE_TAG="$PREV_TAG" \
ENV_FILE="$ENV_FILE" \
APP_PORT="$APP_PORT" \
  $DOCKER_BIN compose -p "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d --remove-orphans --pull never

if [[ -n "$CUR_TAG" ]]; then
  echo "$CUR_TAG" > "$PREVIOUS_TAG_FILE"
fi

echo "$PREV_TAG" > "$CURRENT_TAG_FILE"
echo "[rollback] done. current tag: $PREV_TAG"


