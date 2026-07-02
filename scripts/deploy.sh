#!/usr/bin/env bash
# SSH-deploy driver for Dallio Tasks → k3s on "JoleDev". Renders the prod Kustomize overlay
# locally with the image tag pinned, then drives the rollout over `ssh JoleDev "kubectl ..."`
# because the k3s API (6443) is firewalled and no kubeconfig is shipped off-host.
#
# Migrations run as a gated Job that must complete before the app rolls out, and a failed
# rollout triggers `rollout undo`. Safe to re-run with the same or a new SHA.
#
# Usage: scripts/deploy.sh <image-tag>     # <image-tag> is normally $GITHUB_SHA
set -euo pipefail

IMAGE_TAG="${1:?usage: deploy.sh <image-tag/sha>}"
IMAGE_REPO="ghcr.io/joledev/dallio-tasks"
NAMESPACE="dallio-tasks"
REMOTE="${DEPLOY_SSH_HOST:-JoleDev}"
ROLLOUT_TIMEOUT="${ROLLOUT_TIMEOUT:-180s}"
MIGRATE_TIMEOUT="${MIGRATE_TIMEOUT:-180s}"
POSTGRES_TIMEOUT="${POSTGRES_TIMEOUT:-180s}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# DNS-safe, ≤ that k8s name limits, derived from the tag → job suffix.
SHA_SHORT="$(printf '%s' "$IMAGE_TAG" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | cut -c1-12)"
JOB_NAME="migrate-${SHA_SHORT}"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

# Run kubectl on the remote host. Manifests are piped via stdin where needed.
kc() { ssh "$REMOTE" kubectl "$@"; }
# Apply a local manifest file on the remote.
kc_apply_file() { ssh "$REMOTE" "kubectl apply -n $NAMESPACE -f -" < "$1"; }

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
cp -r "$REPO_ROOT/k8s" "$WORKDIR/k8s"

log "Pinning image ${IMAGE_REPO}:${IMAGE_TAG}"
if command -v kustomize >/dev/null 2>&1; then
  ( cd "$WORKDIR/k8s/overlays/prod" && kustomize edit set image "${IMAGE_REPO}=${IMAGE_REPO}:${IMAGE_TAG}" )
else
  # `kubectl kustomize` has no edit subcommand — rewrite the overlay's newTag.
  sed -i.bak "s#\(newTag:\).*#\1 \"${IMAGE_TAG}\"#" "$WORKDIR/k8s/overlays/prod/kustomization.yaml"
  rm -f "$WORKDIR/k8s/overlays/prod/kustomization.yaml.bak"
fi

RENDERED="$WORKDIR/rendered.yaml"
kubectl kustomize "$WORKDIR/k8s/overlays/prod" > "$RENDERED"

# Migrate Job: substitute the per-SHA name + pin the image (base template uses :latest).
MIGRATE_MANIFEST="$WORKDIR/migrate.yaml"
sed -e "s#__IMAGE_TAG__#${SHA_SHORT}#g" \
    -e "s#image: ${IMAGE_REPO}:latest#image: ${IMAGE_REPO}:${IMAGE_TAG}#g" \
    "$REPO_ROOT/k8s/base/migrate-job.yaml" > "$MIGRATE_MANIFEST"

log "Ensuring namespace ${NAMESPACE}"
kc_apply_file "$REPO_ROOT/k8s/base/namespace.yaml"

log "Verifying required Secrets exist (created out-of-band)"
for secret in dallio-tasks-app dallio-postgres ghcr-pull; do
  if ! kc -n "$NAMESPACE" get secret "$secret" >/dev/null 2>&1; then
    echo "ERROR: Secret '$secret' missing in namespace '$NAMESPACE'." >&2
    echo "       Create it out-of-band — see k8s/base/secret.example.yaml." >&2
    exit 1
  fi
done

# Postgres must be ready before the migration Job can connect.
log "Applying Postgres (StatefulSet + Service) and waiting for readiness"
kc_apply_file "$REPO_ROOT/k8s/base/postgres-statefulset.yaml"
kc -n "$NAMESPACE" rollout status statefulset/dallio-postgres --timeout="$POSTGRES_TIMEOUT"

# Gated migration: the app only rolls out if this Job completes.
log "Running migration Job ${JOB_NAME}"
# Jobs are immutable — drop any prior instance of this SHA's job first (idempotent).
kc -n "$NAMESPACE" delete job "$JOB_NAME" --ignore-not-found
kc_apply_file "$MIGRATE_MANIFEST"

if ! kc -n "$NAMESPACE" wait --for=condition=complete "job/$JOB_NAME" --timeout="$MIGRATE_TIMEOUT"; then
  echo "ERROR: migration Job '$JOB_NAME' did not complete." >&2
  log "Migration logs:"
  kc -n "$NAMESPACE" logs "job/$JOB_NAME" --all-containers=true --tail=200 || true
  kc -n "$NAMESPACE" describe "job/$JOB_NAME" || true
  exit 1
fi
log "Migration complete."

log "Applying app manifests (Deployment / Service / Ingress)"
ssh "$REMOTE" "kubectl apply -f -" < "$RENDERED"

# A failed rollout rolls back to the previous ReplicaSet rather than leaving it wedged.
log "Waiting for rollout of deploy/dallio-tasks"
if ! kc -n "$NAMESPACE" rollout status deploy/dallio-tasks --timeout="$ROLLOUT_TIMEOUT"; then
  echo "ERROR: rollout failed — rolling back." >&2
  kc -n "$NAMESPACE" rollout undo deploy/dallio-tasks || true
  kc -n "$NAMESPACE" rollout status deploy/dallio-tasks --timeout="$ROLLOUT_TIMEOUT" || true
  exit 1
fi

log "Deploy of ${IMAGE_REPO}:${IMAGE_TAG} succeeded → https://dallio-tasks.joledev.com"
