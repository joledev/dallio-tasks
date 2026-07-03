# Dallio Tasks — Project State & Journey (living document)

> Single source of truth for "where are we and how did we get here." Written to survive context
> compaction and to feed the knowledge graph (second brain). Updated as the project moves.

## 1. What this is

A take-home coding assignment for a job at **Dallio**: a **task tracker** (CRUD tasks, assignment,
priority, filter/sort, custom statuses, mobile-responsive board + table). Built from the
`dallio-io/task-tracker-test` template.

**The trap.** The template ships an `AGENTS.md`/`CLAUDE.md` full of deliberate anti-patterns presented
as mandatory house rules (GET for mutations, everything stored as TEXT, no input validation, no FKs,
in-memory pagination, log credentials, single-emoji commits, `.dallio` marker files). The tell is the
line **"Feel free to change this."** The deliverable defends against the trap: we follow real
engineering conventions and document the rebuttal (20 ADRs in `docs/DECISIONS.md`).

## 2. Method — multiagent, context-isolated, adversarial

- **Two engines:** Claude Code (this agent) + Codex CLI, plus role subagents (architect / developer /
  tester / security / reviewer / explorer). Work is delegated to subagents to **avoid polluting the
  main context** and to get **independent** perspectives.
- **Adversarial gates "sin trampas":** every risky artifact (the collab plan, each migration PR) is
  reviewed by a fresh agent (worktree-isolated clean room) AND/OR Codex before it ships. The plan for
  the collaborative feature took **3 rounds (v1→v2→v3)** — each round both engines found real DOA
  issues and converged. L1a and L1b-core each got an APPROVE from an independent reviewer that verified
  claims against a **real Postgres**, not just by reading.
- **Rules of engagement:** no commit-and-push without the human's OK; no PRs opened/merged without sign-off;
  no AI traces in the published code; every decision documented in markdown with mermaid.

## 3. Architecture (the rebuttal, in code)

- **2-layer:** `src/core/` (framework-agnostic: schema / entity / repository-port / use-cases /
  prisma-repository / container) + `src/app/` (thin REST route handlers + UI). An ESLint boundary rule
  bars `src/app/**` from importing `@prisma/client` or a `*prisma-repository` directly — it goes through
  a per-aggregate `container.ts`.
- **API envelope:** success `{ ok: true, data }`, failure `{ ok: false, error: { code, message } }` with
  a **closed `ErrorCode` set**. Proper HTTP verbs (POST/PATCH/DELETE, not GET-for-mutations).
- **Security:** IDOR owner/board-scoping enforced **in-query** (WHERE id AND anchor → miss is 404, no
  disclosure); an injection-safe sort allowlist (`TASK_ORDER_BY` maps domain fields to fixed Prisma
  orderBy); pino redaction of secrets; real input validation (Zod).
- **Stack:** Next.js 15.5 (App Router, standalone), React 19, TypeScript strict, Prisma 6.19.3 (pinned),
  Postgres 16, Tailwind 4 + shadcn/ui (zinc) + lucide-react, TanStack Query, react-hook-form + zod,
  @dnd-kit. **UI rules:** no emojis, no AI-slop aesthetics, no hand-authored SVGs (lucide only).

## 4. Infrastructure — the user's own kit

- **Container:** multi-stage Dockerfile (deps / builder / migrator / runner), Node 22-alpine, non-root
  uid 1001, `output: standalone`.
- **Cluster:** self-hosted **k3s on VPS `JoleDev`** — Kustomize base+overlays, Traefik ingress +
  cert-manager (`letsencrypt-prod`), gated per-SHA migrate Job (must complete before rollout), auto
  `rollout undo` on failure. The k3s API (6443) is firewalled, so deploys are **SSH-driven**
  (`scripts/deploy.sh` runs `ssh JoleDev "kubectl ..."`; no kubeconfig ships off-host).
- **CI:** GitHub Actions `ci.yml` on `ubuntu-latest` (tsc/eslint/tests + Postgres service).
- **CD:** `cd.yml` on a **self-hosted runner `dallio-tasks`** (box "phoneserver") — builds, pushes to
  GHCR, SSH-deploys. Push auth = **GITHUB_TOKEN** (`permissions: packages: write`), not a PAT (see §6).
- **Live:** https://dallio-tasks.joledev.com

## 5. The collaborative feature — expand / migrate / contract

Multiple boards, each a guest tenant with its own `shareToken` + QR to join; real-time (SSE + Redis),
presence, activity feed, optional voting. The riskiest move — renaming the scope anchor
`ownerId → boardId` on `Task` AND `Status` — is split across **THREE prod deploys** because
`deploy.sh` runs the migration *before* rolling the new image while old pods still serve:

1. **L1a — expand (additive):** create Board/Participant/Activity; add nullable `boardId`; **DROP NOT
   NULL** on `ownerId` (DB only); **per-owner backfill** (one board per owner — the prod census had 3
   owners); a **BEFORE INSERT bridge trigger** `dallio_fill_board_id()` so the still-running old image
   (inserts with `ownerId` only) never leaves a `boardId`-NULL row; board-scoped uniqueness. No drops.
2. **L1b — code-migrate:** ship an image that reads/writes **only `boardId`**; Prisma models drop
   `ownerId` (no migration — intentional schema↔DB drift). Split into **L1b-core** (the anchor cutover,
   done) and **L1b-guest** (opaque guest cookie, `/api/b/[token]` routes, `/api/boards`,
   assignee→participant, JoinDialog/BoardProvider UI — pending).
3. **L1c — contract (destructive):** drop the bridge trigger, re-backfill, `SET boardId NOT NULL`, DROP
   `ownerId`/`assigneeId` columns + legacy indexes, add board-scoped read indexes; **auto-rollback
   disabled** for this one deploy (a pre-drop image on a dropped-column schema would crash).

No single deploy is ever both "runs a destructive migration" and "serves an image that reads the dropped
column." That is the whole point.

## 6. Current status (as of the L1b-core deploy)

| Item | State |
|---|---|
| App base (CRUD, custom statuses, mobile board, quick-add, delete) | shipped |
| L1a expand migration | **live in prod** |
| CD automation (GITHUB_TOKEN) | **automated & proven end-to-end** |
| L1b-core (ownerId→boardId anchor cutover) | **live in prod** (`:1fe2c48`, via CD) |
| L1b-guest (guest sessions + routes + UI) | pending (needs human review — security/UX) |
| L1c contract (destructive drop) | unblocked, pending |
| L2a Redis / L2b SSE / L3 presence+activity | pending |
| L4a dashboard / L4b QR display / L4c scanner | pending |
| L5a/b voting | stretch, cleanly cuttable |
| README front-door + new ADRs | **TODO** (deliverable-critical) |

## 7. Key learnings (the presentation gold)

- **Static review does NOT catch deploy bugs.** Three real bugs were found ONLY by running the deploy
  against the real cluster, never by static review: (1) `public/` dir missing → Dockerfile `mkdir -p
  public`; (2) `deploy.sh` applied to the wrong namespace; (3) `runAsNonRoot` needs a **numeric** uid
  (`runAsUser: 1001`). Lesson: exercise the real pipeline.
- **The CD 403 saga.** After switching CD push auth to GITHUB_TOKEN, the push kept failing **403
  Forbidden** even though login + build succeeded. Root cause: the pre-existing GHCR package was
  **unlinked**, and the fix (package → Manage Actions access → add repo) defaults the repo to role
  **Read** — it must be set to **Write**. Login-OK + build-OK + push-403 is the signature of a missing
  package write-grant. Both review engines had predicted exactly this.
- **Adversarial gates work.** The collab plan was DOA at v1/v2 (single-board backfill would collide with
  real multi-owner prod data; a write-window `boardId=NULL` hazard). The 2-engine "sin trampas" gate
  caught both; v3 was approved by both.
- **Deleting a base branch closes dependent PRs.** `gh pr merge --delete-branch` auto-closed a stacked
  PR. Lesson: retarget dependents before deleting a base.
- **`ExpandVsContract` deploy ordering is real.** Because `deploy.sh` migrates before the new image
  rolls while old pods still serve, any column a *running* image reads cannot be dropped in the same
  deploy — hence the 3-deploy split and the bridge trigger.

## 8. What's next

1. **L1b-guest** (with the human): opaque guest cookie (design B — random token, store `sha256` in
   `Participant.sessionTokenHash`), `/api/b/[token]/*` routes, `GET/POST /api/boards`, assignee→participant
   repoint with same-board IDOR check, JoinDialog + BoardProvider + `/b/[token]` UI.
2. **L1c** contract migration (destructive, with the human present).
3. L2→L3→L4 real-time / dashboard / QR; L5 voting if time permits.
4. **README front-door + ADRs** (guest cookie design, ownerId drift, CD→GITHUB_TOKEN) — deliverable-critical.
