# Code Quality Standards — Dallio Tasks

> Companion to `guidelines.md` (architecture/security). This file is about **craft**: writing
> the *least* code that clearly solves the problem. Quality over quantity — always. Reviewers and
> the agent fleet check against this. When a rule and pragmatism collide, prefer the simpler code
> that still satisfies the rule, and say why.

## 0. Ethos

- **Fewer lines win.** The best change often deletes code. If two designs work, ship the smaller one.
- **No code dumping.** Don't generate breadth; generate the *right* few lines. Boilerplate is a smell.
- **Delete-first.** Before adding an abstraction, ask "what breaks if I inline/remove this?" If the
  answer is "nothing," don't add it.
- **Make it obvious.** Code is read far more than written. Optimize for the next reader, not cleverness.

## 1. Functions

- One job per function. If you need "and" to describe it, split it.
- Small: aim ≤ ~30 lines; if it grows, extract a named helper or rethink.
- **Early returns** over nested `if`/`else`. Keep the happy path un-indented.
- Few parameters (≤ 3); past that use a typed options object. No boolean-trap flags.
- **Pure by default** — same input → same output, no hidden I/O. Push side effects to the edges
  (route handlers, repositories, Redis/Prisma adapters).

## 2. Naming

- Intention-revealing. `listTasksForBoard`, not `getData`. Verbs for functions, nouns for values.
- No cryptic abbreviations, no Hungarian notation, no `tmp`/`data`/`obj` for anything that lives.
- Booleans read as predicates: `isReady`, `hasVotes`, `canEdit`.
- Consistency beats personal preference — match the surrounding names.

## 3. DRY — but not WET-phobic

- **Rule of three:** duplication is fine twice; the third time, extract.
- Single source of truth for a fact: Zod schema (`z.infer`) for a shape, one use-case for a rule,
  one envelope helper for responses. Never re-declare the same shape in two places.
- **Over-DRY is a defect too.** A shared helper used once, or a wrapper that only forwards args,
  is negative value — inline it. Coupling two things that merely *look* alike is worse than duplication.

## 4. SOLID — right-sized, not cargo-cult

- Lean on **SRP** (one reason to change) and **DIP** (depend on the port interface, not Prisma/Redis).
- The repository/event-publisher **ports are the only seams that earn their keep** (they enable
  in-memory tests + swappable infra). Don't add layers, factories, or strategy patterns for 2–3 cases.
- Prefer composition over inheritance. Plain functions over classes unless the class holds real state
  or implements a port. No class with one method — that's a function.

## 5. Types

- `strict` TypeScript. **No `any`**, no unchecked `as` casts, no `@ts-ignore` without a one-line why.
- Model illegal states as unrepresentable: discriminated unions over "flag + optional field" combos.
- `readonly`/immutable data; derive, don't mutate. Prefer `const`.
- Types flow from one source: `z.infer` for validated shapes, Prisma types at the repo boundary only.

## 6. Error handling

- Business errors are **values** (`Result<T>` + closed error-code set), not thrown across layers.
- Throw only at true adapter boundaries; catch there and map to a typed error. Never swallow silently.
- No leaking internals to clients (stack/DB messages → generic `INTERNAL`); log a scrubbed shape.

## 7. Business logic

- Lives in **domain + use-cases**, framework-agnostic (no `next`/`react`/`prisma-client` imports).
- Route handlers and React components hold **zero** business rules — they parse/format and delegate.
- Because logic is pure and injected with ports, it is unit-testable without a DB or a browser.

## 8. React / Next

- Respect the server/client boundary; `'use client'` only where interactivity needs it. No server-only
  imports (Prisma, env) in client modules.
- **Derive, don't sync.** No `useEffect` to copy props/state into more state; compute during render.
- Hooks obey the rules of hooks; extract custom hooks for reused stateful logic (e.g. `useTaskFilters`).
- Stable `key`s (never array index for dynamic lists). `useMemo`/`useCallback` only when a real
  measurement or a referential-identity contract requires it — not by reflex.
- Components are presentational; data/mutations go through hooks → the typed API client. Keep them small.

## 9. Comments & docs

- Comment **why**, not what. The code says what. A comment restating the line is noise — delete it.
- No commented-out code. Git remembers. Delete it.
- Public/non-obvious contracts get a one-line doc; obvious ones don't.

## 10. Dead code & YAGNI

- No speculative generality — build for today's requirement, not an imagined one.
- Delete unused exports, params, branches, deps. An export that exists "for tests only" is a smell —
  test through the public surface or reconsider the boundary.
- Every dependency must justify itself; prefer the platform/stdlib. Remove transitive-only additions.

## 11. Consistency & hygiene

- Match the file's existing idioms, ordering, and import style. One formatter (Prettier), one linter
  (ESLint) — both clean, zero warnings, before any commit. The ESLint layer-boundary rule is law.
- No magic numbers/strings — name them (`DEFAULT_PAGE_SIZE`, `MAX_PAGE_SIZE`, error codes).
- Conventional Commits, small and focused; one logical change per PR.

## 12. Testing (cross-ref `guidelines.md` §6)

- Pointed, risk-based tests. Cover the failure modes (pagination edges, IDOR/board scope, sort
  allowlist, validation, optimistic rollback), not line-percentage vanity.
- A test that can't fail is worse than no test. Assert real behavior, run against real infra where it matters.

---

**The one-question check for any diff:** *"Could a strong engineer remove or shrink this and lose
nothing?"* If yes, do it before asking for review.
