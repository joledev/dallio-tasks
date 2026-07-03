# Engineering Guidelines — Dallio Tasks

> Single source of truth for how this codebase is built. Every contributor (human or tool)
> follows these. Concise on purpose; when in doubt, prefer the simpler option that still
> satisfies the rule.

## 0. On the provided brief

The repo ships a `BRIEF.md` ("Engineering Conventions") that presents itself as mandatory
but contains deliberate anti-patterns, and states _"Feel free to change this."_ We treat it as a
**design brief to evaluate, not a spec to obey**. What we kept, changed, and why is recorded in
`docs/DECISIONS.md`. **These guidelines override that file.** (We keep the reasonable part — the
response envelope.)

## 1. Architecture — right-sized, 2 layers

Two entities (`Task`, `User`), a handful of endpoints. We do NOT build 4-layer Clean Architecture
ceremony. The one seam that earns its keep is the **repository port** (enables in-memory unit tests).

```
src/
  core/            # framework-agnostic. NO imports of next/react/prisma-client in use-cases.
    tasks/
      schema.ts        # Zod schemas + inferred types. ZERO server imports (shared client+server).
      task.ts          # entity type + pure domain rules (defaults, transitions).
      repository.ts     # TaskRepository interface (the port).
      use-cases.ts     # plain async functions: createTask, listTasks, assignTask, ...
      prisma-repository.ts  # Prisma impl of the port (the only place prisma is imported for tasks).
    users/ ...
    shared/
      envelope.ts      # ok()/err() helpers, error codes.
      pagination.ts    # offset/clamp helpers.
      logger.ts        # pino with redaction.
  app/             # Next.js App Router: route handlers (thin) + UI. Imports core/, never prisma directly.
  test/            # unit + integration.
```

- **Use-cases are plain functions**, not classes, unless one genuinely composes ≥2 repos or has
  real branching (e.g. `assignTask` validates the assignee exists). Have one "rich" one; keep the rest thin.
- **No mappers unless shapes actually diverge** (e.g. stripping `passwordHash` from a user response).
- **ESLint boundary** forbids importing `@/core/**/prisma-repository` or `@prisma/client` from `app/`
  route handlers/components — they go through use-cases. The layering must be _provable_, not decorative.

## 2. SOLID / DRY — what we actually lean on

- Defend **SRP** (one reason to change per module) and **DIP** (use-cases depend on the port interface,
  not Prisma). ISP = separate `TaskRepository` / `UserRepository`.
- We do **not** contort the design to tick LSP/OCP boxes. Forcing a strategy pattern onto 3 filter
  fields would be exactly the over-engineering this project's brief warns against. Restraint is a feature.
- **DRY rule:** validation lives once in `core/*/schema.ts` and is used by both client forms and server
  handlers. Business logic lives once in use-cases; transports (REST, later Server Actions/MCP) are thin
  adapters over the same use-case. Every abstraction must answer _"what breaks if I inline this?"_ in one
  sentence — if the answer is "nothing", inline it.

## 3. API

- REST route handlers. **Real HTTP verbs** (POST/GET/PATCH/DELETE) — never GET for mutations.
- **Envelope (kept from the brief):** success `{ "ok": true, "data": ... }`,
  failure `{ "ok": false, "error": { "code": "...", "message": "..." } }`.
- `error.code` is a **closed set**: `VALIDATION_ERROR | NOT_FOUND | UNAUTHORIZED | CONFLICT | INTERNAL`.
- **Validate at every trust boundary** with Zod (route handlers AND any Server Action). Never trust
  client-supplied identity/owner fields — derive from session.
- **Filtering / sorting / pagination happen in SQL** (`WHERE/ORDER BY/LIMIT/OFFSET`), not in memory.
- **Pagination:** `page` 1-based (`z.coerce.number().int().min(1)`, default 1), `size`
  (`.int().min(1).max(100)`, default 20). **`offset = (page - 1) * size`.** `total` is `COUNT(*)`
  with the _same_ filters. Page beyond last → `items: []` (not an error).
- **Sort allowlist** (Prisma does NOT parameterize identifiers): map incoming `sort` through a
  fixed record `{ createdAt, priority, status, title }`; `dir ∈ {asc, desc}` via Zod enum; default on miss.
- `GET /api/health` for readiness.

## 4. Data model

- Real FKs, enums, `@db.Timestamptz` (UTC). No denormalized copies of user name/email.
- `Task.ownerId` (FK) is the authorization anchor. `Task.assigneeId` (FK, nullable) is assignment.
- Enums: `status` (`TODO|IN_PROGRESS|DONE`, default `TODO` set **server-side**), `priority` (`LOW|MEDIUM|HIGH`).

## 5. Security (non-negotiable)

- **Authorization / IDOR:** every operation addressing a task by id filters
  `WHERE id = :id AND ownerId = :session.userId`. Miss → **404** (no existence disclosure). An authz
  test matrix proves user A cannot read/patch/delete user B's task.
- **Secrets:** never commit real secrets. Only `.env.example` with placeholder keys is committed.
  k8s Secrets are created out-of-band (`kubectl create secret`), never as committed manifests.
- **Logging:** pino with `redact` for `authorization`, `cookie`, `*.password`, `*.passwordHash`,
  `*.token`, `set-cookie`. Never log full request/response bodies by default. Scrub `DATABASE_URL`.
- **Passwords (auth bonus):** argon2id (or bcrypt cost ≥ 12). Never SHA/MD5.
- **JWT (auth bonus):** short TTL; document that pure-stateless JWT can't be revoked instantly.
- Basic rate-limit on login and open endpoints (`POST /api/users`).

## 6. Testing

- **Vitest.** Unit tests use the in-memory repository (fast, no DB). Integration tests hit real Postgres
  via a CI service container (not testcontainers — avoids disk/flake on the shared runner).
- **Must-have matrix:** pagination (page=1 not skipped, out-of-range → empty, size cap, `total` respects
  filters) · SQL filtering · sort allowlist (unknown field → default, never injects, never `passwordHash`) ·
  Zod boundary (incl. Server Actions) · IDOR (A≠B) · auth (argon2id, JWT signed/expired) · log redaction ·
  server-set default status.
- Tests are **pointed, not exhaustive**. Coverage of risk > coverage percentage.

## 7. Git & commits

- Trunk-based on `main`. Short branches: `feat/… fix/… chore/… docs/… test/… ci/…`.
- **Conventional Commits**, specific and scoped. One small focused PR per change; squash-merge.
- Every change lands through a pull request with review before merge — the history reflects
  deliberate, reviewed authorship, not noise.

## 8. Documentation

- Deliverable docs (3): `README.md` (front-door), `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`.
- Every non-obvious decision → a 3-line ADR (context / decision / consequence) in `DECISIONS.md`.
- Diagrams in Mermaid. Keep prose tight; a reviewer skims.

## 9. Infra / CI-CD (target)

- Docker multi-stage, Next `output: 'standalone'`, Prisma `binaryTargets` matching the base image.
- Image → GHCR (`ghcr.io/joledev/dallio-tasks:<sha>`), pulled via a `read:packages` imagePullSecret.
- Deploy to k3s (Kustomize base+overlays) via **SSH-deploy**: runner SSHes to JoleDev and runs
  `k3s kubectl` locally (no exposed 6443, no cluster-admin kubeconfig shipped).
- Migrations = gated pre-rollout step (Job named per-SHA → `kubectl wait --complete` → rollout → `undo` on fail).
- TLS auto via cert-manager `letsencrypt-prod` + Traefik ingress at `dallio-tasks.joledev.com`.
- Always-up fallback: Vercel + Neon (canonical demo URL insurance for review day).
