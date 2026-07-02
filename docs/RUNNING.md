# Running Dallio Tasks

Local dev, environment, and how a commit reaches production.

## 1. Local development

Prereqs: Node 22, pnpm (`corepack enable` picks up the pinned version), Docker.

```bash
# 1. Env — copy the example and adjust if needed.
cp .env.example .env

# 2. Start Postgres (docker compose).
docker compose up -d postgres

# 3. Install deps + set up the DB.
pnpm install
pnpm exec prisma migrate deploy   # apply migrations
pnpm db:seed                       # optional: single-owner + demo data

# 4. Run the app (dev server on :3000).
pnpm dev
```

Health check: `GET http://localhost:3000/api/health` → `{ "ok": true, "data": { "status": "ready" } }`.

### Useful scripts

| Command                 | What                                              |
| ----------------------- | ------------------------------------------------- |
| `pnpm dev`              | Next dev server                                   |
| `pnpm lint` / `typecheck` | eslint / `tsc --noEmit`                         |
| `pnpm test`             | unit tests (in-memory repo, no DB)                |
| `pnpm test:integration` | integration tests (needs Postgres + `DATABASE_URL`) |
| `pnpm db:migrate`       | create/apply a dev migration                      |

## 2. Environment variables

Canonical list lives in [`.env.example`](../.env.example). The real `.env*` files are gitignored.

| Var             | Purpose                                                         |
| --------------- | -------------------------------------------------------------- |
| `DATABASE_URL`  | Postgres connection string (Prisma).                           |
| `SEED_OWNER_ID` | UUID of the single seeded owner (acting user until auth bonus). |
| `LOG_LEVEL`     | pino level (`info`, `debug`, …).                                |
| `NODE_ENV`      | `development` / `production`.                                  |

**Secrets are never committed.** In the cluster they are created out-of-band via
`kubectl create secret` — see [`k8s/base/secret.example.yaml`](../k8s/base/secret.example.yaml).

## 3. Running the production image locally

```bash
docker build -t dallio-tasks:local .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/dallio_tasks?schema=public" \
  dallio-tasks:local
```

The image is a Next.js **standalone** server (`node server.js`). It also carries a
self-contained Prisma CLI under `/migrate` used only by the migration Job.

## 4. How deploy works

```mermaid
flowchart LR
  A[push to main] --> B[CD: docker buildx build]
  B --> C[push ghcr.io/joledev/dallio-tasks:SHA + latest]
  C --> D[scripts/deploy.sh SHA]
  D -->|ssh JoleDev kubectl| E[k3s: migrate Job SHA]
  E -->|wait --complete| F[apply app + rollout]
  F -->|Traefik + cert-manager| G[https://dallio-tasks.joledev.com]
```

- **CI** (`.github/workflows/ci.yml`, on PR): install → lint → typecheck → unit +
  integration tests against a `postgres:16-alpine` service container.
- **CD** (`.github/workflows/cd.yml`, on push to `main`): buildx builds and pushes
  the image to GHCR tagged with the commit SHA (+ `latest`), then runs
  `scripts/deploy.sh <sha>`.
- **SSH-deploy** (`scripts/deploy.sh`): the k3s API (6443) is firewalled, so the
  runner never talks to it directly. It renders the prod Kustomize overlay locally
  with the image tag pinned, then drives everything over `ssh JoleDev "kubectl …"`:
  1. ensure namespace + required Secrets exist,
  2. bring up Postgres and wait for readiness,
  3. run the **gated** migration Job `migrate-<sha>` and `kubectl wait --complete`
     (logs are dumped and the deploy aborts on failure),
  4. apply the app manifests and `rollout status` — **`rollout undo` on failure**.
- **TLS is automatic:** Traefik ingress + cert-manager `ClusterIssuer letsencrypt-prod`
  issue/renew the cert into the `dallio-tasks-tls` Secret for
  `dallio-tasks.joledev.com`.

### Required repo secrets / cluster prerequisites

| Where            | Name                | Purpose                                       |
| ---------------- | ------------------- | --------------------------------------------- |
| GitHub secret    | `GHCR_PAT`          | GHCR login (read/write:packages).             |
| Runner (host)    | `ssh JoleDev`       | Authorized key + alias for SSH-deploy.        |
| k8s (out-of-band)| `dallio-tasks-app`  | App env incl. `DATABASE_URL`.                 |
| k8s (out-of-band)| `dallio-postgres`   | Postgres credentials.                         |
| k8s (out-of-band)| `ghcr-pull`         | `docker-registry` pull secret for GHCR.       |

Create the k8s Secrets with the commands documented in
[`k8s/base/secret.example.yaml`](../k8s/base/secret.example.yaml).
