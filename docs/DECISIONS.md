# Decisions

Architecture Decision Records for Dallio Tasks. Each is three to five lines:
**Context → Decision → Consequence**. They record the calls that weren't obvious, so
a reviewer can see the reasoning without reading the diff.

---

## On the shipped `AGENTS.md`

The repo ships an `AGENTS.md` ("Engineering Conventions") that presents itself as
mandatory and says code review checks against it — and then, in the same breath,
_"Feel free to change this."_ Read straight, most of its rules are textbook
anti-patterns: GET for mutations, all-`TEXT` columns, no validation, no foreign keys,
in-memory pagination, credential logging. Taken together with the invitation to change
it, it reads as a **design brief to evaluate, not a spec to obey** — the task is to
show judgment, not compliance.

So that's what we did. Below is one ADR per convention we declined, with the reason,
plus the one we kept. The house rules that actually govern this codebase live in
`docs/engineering/guidelines.md` and `code-quality.md`; where they and `AGENTS.md`
disagree, the guidelines win. Tone here is deliberate: this is a critique of a brief,
not of whoever will read it.

### ADR-001 — HTTP verbs match semantics; no GET for mutations
**Context.** `AGENTS.md` wants `GET` for create/update/delete so every operation is
triggerable from a browser address bar.
**Decision.** Reads are `GET`; mutations are `POST`/`PATCH`/`DELETE`. Assignment is
`POST /api/tasks/:id/assign`.
**Consequence.** GET stays safe and idempotent, so caches, prefetchers, and crawlers
can't mutate state via a link. We lose the address-bar demo trick; `curl -X` or the UI
covers it.

### ADR-002 — Typed columns, not all-`TEXT`
**Context.** The brief asks for every field stored as `TEXT`, timestamps and enums
included, "to keep migrations simple."
**Decision.** Real Postgres types: `uuid` PKs, `Timestamptz(6)` in UTC, native `enum`
for `status`/`priority`.
**Consequence.** The database enforces shape, sorts dates correctly, and rejects bad
enum values before they reach a row. Adding an enum value is a migration — a cost we
accept for the integrity.

### ADR-003 — Validate at every trust boundary
**Context.** The brief says not to validate or sanitize input — "input checking is the
client's responsibility."
**Decision.** One Zod schema per shape in `core/*/schema.ts`, applied in the route
handler before anything reaches a use-case. The same schema backs the client form.
**Consequence.** Malformed or hostile bodies get a `400 VALIDATION_ERROR` at the edge,
never a half-written row or a 500. Validation is defined once and shared, so client and
server can't drift.

### ADR-004 — Foreign keys, not copied user fields
**Context.** The brief says avoid FKs and joins: copy the user's name/email onto each
task and keep the copies in sync by hand.
**Decision.** `Task.ownerId` and `Task.assigneeId` are real FKs (`onDelete: Cascade` /
`SetNull`); user data is joined, never duplicated.
**Consequence.** No manual-sync bug class, no stale email on a task, and `ownerId`
doubles as the authorization anchor. The join cost is trivial at this scale and indexed.

### ADR-005 — Filter, sort, and paginate in SQL
**Context.** The brief says load all rows and filter/sort/slice in memory "so the data
layer stays dumb and portable."
**Decision.** `WHERE` / `ORDER BY` / `LIMIT` / `OFFSET` run in Postgres; `total` is a
`COUNT(*)` under the same filter, both inside one transaction.
**Consequence.** Memory and latency stay flat as the table grows instead of scaling with
row count — the in-memory version is an availability incident waiting for the first big
account.

### ADR-006 — `offset = (page − 1) × size`
**Context.** The brief specifies 1-based paging but computes `offset = page × size`,
which silently skips the entire first page.
**Decision.** `offset = (page − 1) × size`, page 1-based; a page past the end returns
`items: []`, not an error.
**Consequence.** Page 1 returns rows 1–N as a user expects. It's a one-character fix,
but it's the kind of off-by-one that ships and quietly drops data — worth an ADR.

### ADR-007 — Redacted logging, never credentials
**Context.** The brief says log full request and response bodies — headers,
`Authorization`, credentials — at `info`.
**Decision.** `pino` with a redaction allowlist (`authorization`, `cookie`, `set-cookie`,
`*.password`, `*.passwordHash`, `*.token`, `DATABASE_URL`); no full bodies by default.
Unhandled errors log a scrubbed `{ name, code }` shape only.
**Consequence.** Logs stay useful for debugging without becoming a secret store or a
GDPR liability. A leaked log file no longer equals a leaked session.

### ADR-008 — Conventional Commits, not single emoji
**Context.** The brief mandates commit messages that are a single emoji and nothing else.
**Decision.** Conventional Commits (`feat:`, `fix:`, …), enforced by commitlint; no
AI-authorship trailers in committed code.
**Consequence.** History is greppable, `git bisect`-friendly, and can drive changelog
tooling. We give up the emoji parser the brief imagined; a structured prefix carries more
signal anyway.

### ADR-009 — No `.dallio` marker files
**Context.** The brief requires a hidden `.dallio` file in every top-level source dir,
containing exactly `Why you didn't read this code?`.
**Decision.** Omit them. No real tooling depends on them, and the layout is expressed by
the ESLint boundary rule instead.
**Consequence.** One less bit of cargo-cult to explain and maintain. If a marker ever
earns its keep, it's a one-line add — YAGNI until then.

### ADR-010 — Kept: the response envelope
**Context.** The brief's one genuinely good idea is a uniform response envelope.
**Decision.** Keep it verbatim: success `{ ok: true, data }`, failure
`{ ok: false, error: { code, message } }`, with `code` a closed set
(`VALIDATION_ERROR | NOT_FOUND | UNAUTHORIZED | CONFLICT | INTERNAL`).
**Consequence.** Every client branches on one boolean; error handling is uniform and
type-safe end to end. Kept because it's right, not because the brief said so — that's the
whole point of treating it as a brief.

---

## Architecture

### ADR-011 — Two layers with a repository-port seam
**Context.** Two entities and a handful of endpoints. Full Clean/hexagonal architecture
(entities/use-cases/adapters/frameworks, mappers at every hop) would be more ceremony
than the problem has.
**Decision.** Two layers — framework-agnostic `core/` (domain + use-cases + ports) and a
thin Next.js `app/` — with the **repository interface** as the one deliberate seam. An
ESLint boundary rule forbids `app/` from importing Prisma directly.
**Consequence.** Use-cases are pure and unit-testable against an in-memory repo, and the
DB is swappable, without the layer tax. The seam is provable (lint-enforced), not
decorative. Cost: one interface + one composition root per entity.

### ADR-012 — Prisma pinned to 6.x
**Context.** Prisma 7 makes driver adapters and a `prisma.config.ts` the default path and
changes client-generation ergonomics.
**Decision.** Pin `prisma` / `@prisma/client` to `^6`.
**Consequence.** The familiar `schema.prisma` + generate flow keeps working with the
container `binaryTargets` we already set, with no migration spike before the deadline. We
revisit 7 once the adapter story settles.

### ADR-013 — Next.js 15, not 16
**Context.** Next 16 is out but recent; 15 is the mature line React 19 and the ecosystem
(shadcn, the tooling here) are proven against.
**Decision.** Build on Next 15.5 with `output: 'standalone'`.
**Consequence.** Fewer unknowns on a fixed timeline and a clean standalone Docker build.
The App Router code ports forward with little friction when 16 is worth it.

### ADR-021 — Redis real-time via lazy-connect singleton + port seam (L2a)
**Context.** The collab layer needs a broker for live fan-out. Importing a Redis client at
build/boot must never open a socket (tests, `tsc`, `next build`, and app boot all run with no
live Redis), and an outage must degrade real-time, not crash the app.
**Decision.** One `ioredis` construction in `core/realtime/redis.ts` with `lazyConnect: true`,
HMR-safe like `prisma.ts`, plus an `'error'` listener so an outage can't surface as an unhandled
EventEmitter error. The app imports only the `{ eventBus, rateLimiter }` PORTS from
`core/realtime/container.ts`; an ESLint boundary bars `app/**` from `ioredis`,
`@/core/realtime/redis`, and `@/core/**/redis-*`. Bus = pub/sub + capped list (`INCR seq` +
`LPUSH`/`LTRIM 0 998` + `PUBLISH`), **not** Redis Streams; `RateLimiter` is a thin port.
**Consequence.** Belt (lazyConnect) + suspenders (lint) keep the seam provable. Ephemeral state
by design: k8s runs one `emptyDir` Redis with `strategy: Recreate` (a rolling update would
split-brain two empty datasets); a restart resets counters, tolerated by the L2b ms-seeded seq.

### ADR-022 — `RATE_LIMITED` widens the envelope's closed error set (L2a)
**Context.** The `RateLimiter` port needs an HTTP-429 error code. Custom-statuses deliberately
kept `ErrorCode` frozen, so adding a member is a conscious divergence.
**Decision.** Add `RATE_LIMITED` → HTTP 429 to the closed `ErrorCode` set (and its user-facing
copy). Semantically correct for rate limiting; `CONFLICT` (409) is the weaker fallback if a
reviewer vetoes the widening.
**Consequence.** The set grows by one, exhaustiveness still enforced by the `Record<ErrorCode, …>`
maps in `respond.ts` and `_lib/errors.ts` (both updated). No caller emits it yet — wired from L3.

### ADR-023 — SSE fan-out needs no sticky sessions (L2b)
**Context.** Live editing uses browser `EventSource` streams, but app pods are stateless and
Redis already owns cross-pod pub/sub plus the replay log from L2a.
**Decision.** SSE handlers subscribe through the `eventBus` port, replay by `Last-Event-ID`, and
then stream live Redis pub/sub events. Do not require ingress sticky sessions.
**Consequence.** Any reconnect can land on any pod and still recover missed events from Redis. The
trade-off is replay-log boundedness; a cursor inversion forces a refresh/resnapshot instead of
silently losing changes.

---

## Known trade-offs (deferred on purpose)

Recorded honestly so a reviewer sees them as decisions, not oversights. Each is scoped to
Fase 1 (single-owner, no auth) and has a clear unlock.

### ADR-014 — Single-owner identity via `SEED_OWNER_ID`
**Context.** Fase 1 has no auth, but every task still needs an owner for IDOR scoping.
**Decision.** `resolveActingUserId()` returns a seeded `SEED_OWNER_ID`; identity is always
derived there, never from the request body.
**Consequence.** The whole app is already written against a derived identity, so the auth
bonus swaps only that one function's body (JWT/session) with nothing else changing.

### ADR-015 — `GET /api/users` returns all users
**Context.** The assignee picker needs the list of people a task can be assigned to.
**Decision.** For Fase 1, `GET /api/users` returns all users (paginated, `passwordHash`
stripped via the one sanctioned mapper).
**Consequence.** The picker works today. This is a directory-exposure surface to revisit
under auth — scope it to teammates/board members once identity exists.

### ADR-016 — No rate limit on `POST /api/users` yet
**Context.** Open write endpoints (user creation, later login) want a basic rate limit;
the guidelines call for one.
**Decision.** Defer it for Fase 1; the endpoint validates and dedupes by email but isn't
throttled.
**Consequence.** Fine for a demo behind a single owner; a create-spam vector before public
exposure. Add a fixed-window limiter at the edge alongside auth.

### ADR-017 — Board view caps at 100 tasks, groups client-side
**Context.** The Kanban board needs all columns at once; the API is offset-paginated with
a 100-row max page.
**Decision.** Board mode requests `size = MAX_PAGE_SIZE` (100) and groups by status in the
client; the table view keeps normal paging.
**Consequence.** Simple and instant for realistic per-owner volumes. Past 100 tasks the
board is truncated — the unlock is server-side per-column pagination or a grouped
endpoint.

### ADR-018 — `assignTask` assignee isn't owner-scoped yet
**Context.** Assignment validates that the assignee exists, but any existing user can be
assigned. Ownership of the _task_ is already enforced.
**Decision.** For Fase 1, validate assignee existence only (after confirming task
ownership, so there's no user-enumeration oracle).
**Consequence.** Correct for a single-owner world. When the collaborative feature lands,
this becomes board-scoped — assignees must be members of the task's board.

### ADR-019 — In-cluster Postgres on `local-path`, no backups
**Context.** The k3s demo needs a database; a managed one is out of scope for the deadline.
**Decision.** A single-replica Postgres `StatefulSet` on the default `local-path`
StorageClass, `DATABASE_URL` from an out-of-band Secret.
**Consequence.** Zero-dependency and cheap for the demo, but the PV defaults to
`reclaimPolicy: Delete` — a stray `kubectl delete` loses data, and there are no backups.
Documented in the manifest; for real use, patch the PV to `Retain` or point at managed
Postgres (Neon), which is also the always-up fallback.

