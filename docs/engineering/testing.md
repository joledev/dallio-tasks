# Testing — how to run

Vitest, two tiers (guideline §6). Unit tests use in-memory repositories (no DB); integration tests
hit a real Postgres.

## Unit tests (fast, no DB)

```bash
pnpm test          # runs src/**/*.test.ts, excludes *.integration.test.ts
pnpm test:watch    # watch mode
```

Config: `vitest.config.ts`. In-memory ports live in `src/test/in-memory/`. `pnpm test` never needs a
database and stays green offline.

## Integration tests (real Postgres)

```bash
docker compose up -d postgres      # start Postgres (docker-compose.yml)
pnpm db:generate                   # prisma client (once)
pnpm db:deploy                     # apply migrations to the DB
pnpm test:integration              # runs src/**/*.integration.test.ts
```

- Config: `vitest.integration.config.ts` (serial, longer timeouts).
- Connection: `DATABASE_URL` from `.env` (defaults to the compose Postgres
  `postgresql://user:pass@localhost:5432/dallio_tasks`).
- **Self-guarding:** each integration file pings the DB at load; if Postgres is unreachable the whole
  suite **skips cleanly** (no failures). So `pnpm test:integration` is safe to run without a DB.
- Each suite creates its own owners/rows with random UUID emails and tears them down in `afterAll`
  (owner delete cascades their tasks) — no shared fixtures, no cross-run pollution.

What the integration tier proves (guideline §6 must-haves): filtering, `ORDER BY`, and `LIMIT/OFFSET`
happen in SQL; filtered `COUNT(*)` matches the page filters; and IDOR owner-scoping holds at the DB
(`findFirst`/`updateMany`/`deleteMany` count semantics — user A cannot read/update/delete user B's task).
