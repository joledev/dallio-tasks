-- Fase 2 — Boards CONTRACT (destructive drop). PR-L1c-b.
--
-- The final layer of the ownerId → boardId expand/migrate/contract. L1a (expand), L1b (boardId-only
-- image) and L1c-a (the model stopped SELECTing Task.assigneeId) are all LIVE in prod. NO running image
-- reads Task.ownerId / Status.ownerId / Task.assigneeId anymore, so this migration drops those columns,
-- makes boardId NOT NULL, removes the write-window bridge, and resolves the schema↔DB drift.
--
-- SINGLE TRANSACTION: Prisma wraps a lone migration.sql in one transaction — do NOT add BEGIN/COMMIT.
-- The real safety is step 2's hard assertion: if any boardId is NULL it RAISEs, the whole transaction
-- rolls back, the migrate-Job fails, deploy.sh never rolls out the image, and prod is left untouched.
-- Only after that guard passes do we reach the irreversible SET NOT NULL / DROP COLUMN steps.
--
-- Deploy is DESTRUCTIVE → run manually with `DESTRUCTIVE_MIGRATION=1 scripts/deploy.sh <sha>` after a
-- fresh pg_dump backup. Rollback story is `git revert` + a forward compensating migration, NOT an image
-- rollback that assumes the old schema.

-- 1. Drop the write-window bridge. L1b-guest is live and always sets boardId, so the BEFORE INSERT
--    bridge is now a no-op. Dropping it first is safe inside the transaction: Postgres holds the DDL
--    locks to commit, so any concurrent INSERT blocks rather than slipping past the step-2 assertion.
DROP TRIGGER IF EXISTS task_fill_board_id ON "Task";
DROP TRIGGER IF EXISTS status_fill_board_id ON "Status";
DROP FUNCTION IF EXISTS dallio_fill_board_id();

-- 2. Hard assertion — the real guard for the irreversible steps below. There is deliberately NO
--    re-backfill here (removed by design: a single owner can now own multiple boards via POST
--    /api/boards, so an ownerId→boardId UPDATE could mis-map). Prod census = 0 NULLs; if that is ever
--    false, RAISE aborts the whole transaction → migrate-Job fails → no rollout → prod untouched.
DO $$ BEGIN
  IF (SELECT count(*) FROM "Task"   WHERE "boardId" IS NULL) > 0
  OR (SELECT count(*) FROM "Status" WHERE "boardId" IS NULL) > 0
  THEN RAISE EXCEPTION 'L1c-b abort: boardId NULL rows remain';
  END IF;
END $$;

-- 3. Make boardId non-null (safe — the assertion above just proved zero NULLs).
ALTER TABLE "Task"   ALTER COLUMN "boardId" SET NOT NULL;
ALTER TABLE "Status" ALTER COLUMN "boardId" SET NOT NULL;

-- 4. Drop the 5 legacy ownerId indexes (superseded by the board-scoped indexes; their column goes next).
DROP INDEX IF EXISTS "Status_ownerId_slug_key";
DROP INDEX IF EXISTS "Status_ownerId_default_key";
DROP INDEX IF EXISTS "Status_ownerId_position_idx";
DROP INDEX IF EXISTS "Task_ownerId_createdAt_idx";
DROP INDEX IF EXISTS "Task_ownerId_statusId_idx";

-- 5. Drop the legacy owner/assignee columns. Dropping Task.assigneeId drops its FK to User
--    automatically. Board.ownerId is INTENTIONALLY untouched (still the board dashboard authz anchor).
ALTER TABLE "Task"   DROP COLUMN "ownerId";
ALTER TABLE "Status" DROP COLUMN "ownerId";
ALTER TABLE "Task"   DROP COLUMN "assigneeId";

-- 6. Add the board-scoped read indexes that replace the dropped ownerId list-path indexes.
CREATE INDEX "Task_boardId_statusId_idx"  ON "Task"("boardId", "statusId");
CREATE INDEX "Task_boardId_createdAt_idx" ON "Task"("boardId", "createdAt");
