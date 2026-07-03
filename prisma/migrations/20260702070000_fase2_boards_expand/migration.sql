-- Fase 2 — Boards EXPAND (additive, per-owner backfill, write-window bridge). PR-L1a.
--
-- ZERO-LOSS board scoping: create ONE Board per existing owner, then move THAT owner's Statuses AND
-- Tasks to THAT owner's board, so `@@unique([boardId, slug])` and the per-board single-isDefault rule
-- see each slug exactly once (§0.2 census: 3 owners × todo/in_progress/done). Collapsing every owner
-- onto one board would abort on the unique index — that is exactly what this migration avoids.
--
-- migrate-deploy-SAFE for the running (ownerId-only) image: this migration ONLY adds (tables, nullable
-- columns, indexes) and DROPs NOT NULL — no column/table drops. The still-running old image keeps
-- inserting Task/Status with only `ownerId`; a BEFORE INSERT trigger bridges `boardId` for those rows
-- so no `boardId`-NULL row is ever left behind. Contract (SET NOT NULL + DROP COLUMN + drop trigger)
-- is deferred to `fase2_boards_contract` (L1c), which runs only after the boardId-only image is live.
--
-- The seed owner (00000000-0000-4000-8000-000000000001) keeps a fixed board id/token for e2e stability;
-- the other owners get generated ids/tokens.

-- gen_random_bytes (unguessable share tokens) needs pgcrypto; gen_random_uuid is a PG13+ builtin.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. New collaborative tables --------------------------------------------------------------------
CREATE TABLE "Board" (
    "id"         UUID           NOT NULL,
    "ownerId"    UUID           NOT NULL,
    "name"       TEXT           NOT NULL,
    "shareToken" TEXT           NOT NULL,
    "createdAt"  TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Board_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Board_shareToken_key" ON "Board"("shareToken");
CREATE INDEX        "Board_ownerId_idx"    ON "Board"("ownerId");
ALTER TABLE "Board" ADD CONSTRAINT "Board_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Participant" (
    "id"               UUID           NOT NULL,
    "boardId"          UUID           NOT NULL,
    "displayName"      TEXT           NOT NULL,
    "color"            TEXT,
    "sessionTokenHash" TEXT,          -- sha256 of the opaque guest-session token (Q5 design B)
    "joinedAt"         TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt"       TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Participant_boardId_idx" ON "Participant"("boardId");
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Activity" (
    "id"            UUID           NOT NULL,
    "boardId"       UUID           NOT NULL,
    "participantId" UUID,
    "action"        TEXT           NOT NULL,
    "taskId"        UUID,           -- soft ref, intentionally NO FK (survives task deletion)
    "meta"          JSONB,
    "createdAt"     TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Activity_boardId_createdAt_idx" ON "Activity"("boardId", "createdAt");
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_participantId_fkey"
    FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Additive columns on Task (all nullable or DEFAULTed so the old image's INSERTs still succeed) --
ALTER TABLE "Task" ADD COLUMN "boardId"                UUID;
ALTER TABLE "Task" ADD COLUMN "createdByParticipantId" UUID;
ALTER TABLE "Task" ADD COLUMN "assigneeParticipantId"  UUID;
ALTER TABLE "Task" ADD COLUMN "position"               INTEGER NOT NULL DEFAULT 0;
-- Leave the legacy assigneeId(→User) column intact (dropped in L1c).
ALTER TABLE "Task" ADD CONSTRAINT "Task_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdByParticipantId_fkey"
    FOREIGN KEY ("createdByParticipantId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeParticipantId_fkey"
    FOREIGN KEY ("assigneeParticipantId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Additive column on Status (the piece the fase2 spec omits; custom-statuses.md §1.3) ----------
ALTER TABLE "Status" ADD COLUMN "boardId" UUID;
ALTER TABLE "Status" ADD CONSTRAINT "Status_boardId_fkey"
    FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. DROP NOT NULL on the legacy owner anchors so the L1b image (which stops writing them) can INSERT.
--    Harmless to the still-running old image, which continues to PROVIDE ownerId.
ALTER TABLE "Task"   ALTER COLUMN "ownerId" DROP NOT NULL;
ALTER TABLE "Status" ALTER COLUMN "ownerId" DROP NOT NULL;

-- 5. Per-owner backfill (§0.2 fix — NOT a single demo board) --------------------------------------
--    One Board per existing owner; the SEED owner keeps the fixed demo id/token for e2e stability.
INSERT INTO "Board" ("id", "ownerId", "name", "shareToken", "updatedAt")
SELECT CASE WHEN u."id" = '00000000-0000-4000-8000-000000000001'::uuid
            THEN '00000000-0000-4000-8000-0000000000b0'::uuid
            ELSE gen_random_uuid() END,
       u."id",
       'My Board',
       CASE WHEN u."id" = '00000000-0000-4000-8000-000000000001'::uuid
            THEN 'demo-board-share-token'
            ELSE encode(gen_random_bytes(16), 'hex') END,  -- 128-bit, hex is URL-safe + unguessable
       now()
FROM "User" u
WHERE EXISTS (SELECT 1 FROM "Status" s WHERE s."ownerId" = u."id")   -- census: every owner has statuses
   OR EXISTS (SELECT 1 FROM "Task"   t WHERE t."ownerId" = u."id");

-- Scope each owner's Statuses AND Tasks to THAT owner's board.
UPDATE "Status" s SET "boardId" = b."id" FROM "Board" b WHERE b."ownerId" = s."ownerId";
UPDATE "Task"   t SET "boardId" = b."id" FROM "Board" b WHERE b."ownerId" = t."ownerId";

-- 6. assigneeParticipantId backfill = leave NULL: attribution starts fresh (old assignees were Users;
--    there are no Participants for them). The seed sets demo attribution for a non-empty demo board.

-- 7. Write-window bridge trigger (v3 — R2b) -------------------------------------------------------
--    During the L1a→L1b rollout the old still-running image keeps inserting Task/Status rows with only
--    `ownerId`, which would land `boardId` NULL and abort L1c's SET NOT NULL. Auto-fill `boardId` from
--    the owner's board whenever it is omitted. No-op once L1b (which always sets boardId) is live;
--    dropped in L1c.
CREATE FUNCTION dallio_fill_board_id() RETURNS trigger AS $$
BEGIN
  IF NEW."boardId" IS NULL THEN
    NEW."boardId" := (SELECT "id" FROM "Board" WHERE "ownerId" = NEW."ownerId" LIMIT 1);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER task_fill_board_id   BEFORE INSERT ON "Task"   FOR EACH ROW EXECUTE FUNCTION dallio_fill_board_id();
CREATE TRIGGER status_fill_board_id BEFORE INSERT ON "Status" FOR EACH ROW EXECUTE FUNCTION dallio_fill_board_id();

-- 8. Board-scoped uniqueness lands HERE (v3), right after the collision-free per-owner backfill, so it
--    protects L1b's board-scoped writes. Legacy [ownerId, …] unique + partial isDefault index are KEPT
--    (both scopes coexist harmlessly until L1c drops the ownerId column and its indexes).
CREATE UNIQUE INDEX "Status_boardId_slug_key"    ON "Status"("boardId", "slug");
CREATE UNIQUE INDEX "Status_boardId_default_key" ON "Status"("boardId") WHERE "isDefault";

-- 9. No SET NOT NULL on boardId, no column drops. Expand only.
