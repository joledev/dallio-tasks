# Dallio Tasks

A task tracker that grew into a real-time, multi-board collaboration app. It started
as a small CRUD service — create tasks, assign them, set priority, filter/sort/paginate
over a JSON API with a React UI on top — and then extended into shareable boards that
several people can edit live at the same time. One deployable (a Next.js App Router
server that serves both the UI and the API) talking to Postgres and Redis.

**Live demo:** https://dallio-tasks.joledev.com
**Shared demo board:** https://dallio-tasks.joledev.com/b/demo-board-share-token

---

## What it does

- Full task CRUD with title, description, priority, and a status.
- Assignment, filtering, sorting, and offset pagination.
- Customizable status columns per board (not a fixed enum).
- A responsive web UI with both a Kanban board and a table view.
- Persistent Postgres backend behind a typed, framework-agnostic domain layer.
- Multiple shareable boards with live collaborative editing, presence, an activity
  feed, an in-app QR scanner, a projector view, and optional proposal-based voting.

---

## How it covers the assignment scope

The brief was a task tracker. Every part of that is covered:

| Requirement | Where it lives |
| --- | --- |
| Create / read / update / delete tasks | `POST/GET/PATCH/DELETE /api/tasks[/:id]` |
| Assign a task to a user | `POST /api/tasks/:id/assign` |
| Priority | `Priority` enum (`LOW`/`MEDIUM`/`HIGH`) on `Task` |
| Filtering, sorting, pagination | Query params, executed in SQL (`WHERE`/`ORDER BY`/`LIMIT`/`OFFSET`) |
| Web UI | Next.js App Router pages — board + table views |
| Persistent backend | Postgres via Prisma, behind a repository port |

### A note on the template's conventions

The starter template shipped an `AGENTS.md` of "engineering conventions" that were,
read plainly, a set of anti-patterns — GET for mutations, every column stored as
`TEXT`, no input validation, no foreign keys, in-memory pagination, credential
logging — alongside an explicit invitation to *"feel free to change this."* I read
that as a design brief to evaluate, not a spec to obey, and built the app on sound
conventions instead:

- **Real HTTP verbs** — reads are `GET`, mutations are `POST`/`PATCH`/`DELETE`.
- **Typed columns** — `uuid` keys, `timestamptz` in UTC, native enums.
- **Foreign keys** — real relations with `Cascade`/`SetNull`, no denormalized copies.
- **In-DB filtering/sorting/paging** — memory and latency stay flat as data grows.
- **Validated input** — one Zod schema per shape at every trust boundary.
- **Redacted logging** — a `pino` allowlist; no bodies, headers, or credentials.

Each of these calls is recorded as a short ADR (context → decision → consequence) in
[`docs/DECISIONS.md`](docs/DECISIONS.md). The one idea from the brief worth keeping —
the response envelope — was kept verbatim.

---

## Beyond the scope — real-time collaboration

The larger extension turns single-owner task lists into shared boards:

- **Multiple boards.** Each board is its own guest tenant with an unguessable
  `shareToken`. Anyone with the link (or the board's QR code) can join at
  `/b/<token>` — no account required.
- **Opaque guest sessions.** Joining mints a random session token; only its SHA-256
  hash is stored (`Participant.sessionTokenHash`) and set in an HTTP-only cookie.
  There is no secret to leak and no PII in the identifier.
- **Live editing over SSE.** Browsers subscribe to a per-board `EventSource` stream;
  changes fan out through Redis pub/sub. Because Redis owns the cross-pod broker and
  the replay log, any pod can serve any stream — **no sticky sessions** — and a
  reconnect replays missed events by `Last-Event-ID`.
- **Presence and activity.** A presence strip shows who is currently on the board; an
  append-only activity feed records what changed.
- **In-app QR scanner.** Scan a board's QR from another device to join it directly.
- **Projector / present view.** A read-only, large-format `/b/<token>/present` screen
  for showing a board on a shared display.
- **Optional voting.** Boards can run in a proposal-based `VOTE` mode where changes are
  proposed and approved/rejected before they apply.

---

## Architecture

A short tour; the full version with mermaid diagrams is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

**Two layers, one seam.** `src/core/` is framework-agnostic — domain entities, Zod
schemas, use-cases (pure functions), and repository *ports* (interfaces). `src/app/`
is a thin Next.js adapter: route handlers resolve identity, validate, and delegate.
Dependencies point inward (`app → core ← infra`), and the boundary is *provable*: an
ESLint rule forbids `src/app/**` from importing `@prisma/client`, `ioredis`, or any
`*-prisma-repository` / redis adapter directly — everything goes through a per-aggregate
`container.ts`. Use-cases run against an in-memory repository in tests; Prisma is wired
only at the composition root.

**Response envelope.** Every response is `{ ok: true, data }` or
`{ ok: false, error: { code, message } }`, where `code` is a closed set
(`VALIDATION_ERROR | NOT_FOUND | UNAUTHORIZED | CONFLICT | INTERNAL | RATE_LIMITED`).
Clients branch on one boolean; error handling is type-safe end to end.

**Security.**

- **IDOR scoping** is enforced *in the query* — every task addressed by id filters on
  its scope anchor (`WHERE id = :id AND boardId = :board`), so a wrong scope and a
  missing row are indistinguishable (both `404`, no existence oracle).
- **Injection-safe sort** — the one identifier SQL can't parameterize is mapped through
  a fixed allowlist after Zod has already restricted it; everything else is
  parameterized through Prisma.
- **Opaque guest cookies** — HTTP-only, hashed at rest, no PII.
- **Redacted logs** — `pino` with a redaction allowlist; unhandled errors log a
  scrubbed `{ name, code }` only, never a stack or DB detail.

**Migrations.** The schema evolves with an **expand → migrate → contract** discipline.
The riskiest change here — renaming the scope anchor from `ownerId` to `boardId` on
`Task` and `Status` — was split across three deploys (additive expand with a bridge
trigger, a code cutover, then the destructive column drop) so that no single deploy
both runs a destructive migration and serves an image that still reads the dropped
column. The reasoning is in `docs/DECISIONS.md`.

---

## Tech stack

- **Framework:** Next.js 15 (App Router, `output: standalone`), React 19.
- **Language:** TypeScript (strict).
- **Data:** Prisma 6 + Postgres 16; Redis (pub/sub + replay log) for real-time.
- **UI:** Tailwind CSS 4, shadcn/ui (Radix), lucide-react, TanStack Query,
  React Hook Form, `@dnd-kit` for drag-and-drop.
- **Validation:** Zod (schemas shared by client and server).
- **Testing:** Vitest (unit + Postgres integration), Playwright (E2E).
- **Ops:** Docker, GitHub Actions, k3s (Kustomize, Traefik, cert-manager).

---

## Getting started

**Prerequisites:** Node 22, pnpm (via `corepack enable`), Docker.

```bash
# 1. Environment
cp .env.example .env

# 2. Start Postgres + Redis
docker compose up -d

# 3. Install deps and set up the database
pnpm install
pnpm exec prisma migrate deploy
pnpm db:seed            # optional: seeds an owner + the demo board

# 4. Run the dev server (http://localhost:3000)
pnpm dev
```

Health check: `GET http://localhost:3000/api/health` →
`{ "ok": true, "data": { "status": "ready" } }`.

Full local, environment, and deploy notes are in [`docs/RUNNING.md`](docs/RUNNING.md).

### Running the tests

```bash
pnpm test               # unit tests (in-memory repo, no DB)
pnpm test:integration   # integration tests (needs Postgres + DATABASE_URL)
pnpm test:e2e           # Playwright end-to-end
```

---

## Testing & CI/CD

- **Unit tests** run use-cases against an in-memory repository — no DB, no browser.
- **Integration tests** run the Prisma repositories against a real `postgres:16` to
  verify the queries, indexes, and scoping actually behave.
- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs on every PR:
  install → lint → typecheck → unit + integration tests against a Postgres service
  container.
- **CD** ([`.github/workflows/cd.yml`](.github/workflows/cd.yml)) runs on push to
  `main` from a self-hosted runner: it builds a multi-stage image, pushes it to GHCR
  tagged by commit SHA, then deploys to a self-hosted **k3s** cluster over SSH
  (the API server isn't exposed). Deploys render the prod Kustomize overlay and run a
  **gated per-SHA migration Job** — `prisma migrate deploy` must complete before the
  app rolls out, and a failed rollout is undone automatically. Traefik + cert-manager
  handle TLS.

The result is continuously deployed and live at https://dallio-tasks.joledev.com.

---

## Project layout

```
src/
  core/          Framework-agnostic domain: schemas, use-cases, ports, Prisma repos
    tasks/  statuses/  users/  boards/  participants/
    activity/  proposals/  realtime/  shared/
  app/           Next.js App Router — thin adapters
    api/         Route handlers (REST + SSE), incl. /api/b/[token]/* board routes
    b/[token]/   Public board UI + /present projector view
    _components/ _hooks/ _lib/   UI, data hooks, client helpers
  components/ui/ shadcn/ui primitives
prisma/          schema.prisma, migrations/, seed
k8s/             Kustomize base + prod overlay + redis manifests
scripts/         deploy.sh (SSH-driven k3s deploy)
e2e/             Playwright specs
docs/            ARCHITECTURE.md, DECISIONS.md, RUNNING.md, engineering/
.github/workflows/  ci.yml, cd.yml
```

For the deeper "why" behind any decision here, start with
[`docs/DECISIONS.md`](docs/DECISIONS.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
