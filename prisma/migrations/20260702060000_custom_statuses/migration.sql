-- Custom statuses: enum -> table, zero data loss.
-- A table and a type cannot share the name "Status" in one schema, so the legacy enum is
-- renamed out of the way first, used for the backfill cast, then dropped.

-- 0. Free the name "Status" for the new table; the column keeps working under the renamed type.
ALTER TYPE "Status" RENAME TO "StatusEnum_legacy";

-- 1. New Status table
CREATE TABLE "Status" (
    "id"        UUID           NOT NULL,
    "ownerId"   UUID           NOT NULL,
    "name"      TEXT           NOT NULL,
    "slug"      TEXT           NOT NULL,
    "position"  INTEGER        NOT NULL,
    "color"     TEXT,
    "isDefault" BOOLEAN        NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Status_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Status_ownerId_slug_key"     ON "Status"("ownerId", "slug");
CREATE INDEX        "Status_ownerId_position_idx" ON "Status"("ownerId", "position");
CREATE UNIQUE INDEX "Status_ownerId_default_key"  ON "Status"("ownerId") WHERE "isDefault";
ALTER TABLE "Status" ADD CONSTRAINT "Status_ownerId_fkey"
    FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Seed the 3 canonical statuses for EVERY existing user (so every owner keeps a full column set).
--    gen_random_uuid() is built in on PG13+ (this repo targets postgres:16-alpine).
INSERT INTO "Status" ("id", "ownerId", "name", "slug", "position", "color", "isDefault", "updatedAt")
SELECT gen_random_uuid(), u."id", v.name, v.slug, v.position, v.color, v.is_default, now()
FROM "User" u
CROSS JOIN (VALUES
    ('To do',       'todo',        0, NULL::text, true),
    ('In progress', 'in_progress', 1, 'blue',     false),
    ('Done',        'done',        2, 'green',    false)
) AS v(name, slug, position, color, is_default);

-- 3. Add the FK column nullable, backfill by (ownerId, enum->slug), then lock it down.
ALTER TABLE "Task" ADD COLUMN "statusId" UUID;

UPDATE "Task" t SET "statusId" = s."id"
FROM "Status" s
WHERE s."ownerId" = t."ownerId"
  AND s."slug" = CASE t."status"::text
    WHEN 'TODO'        THEN 'todo'
    WHEN 'IN_PROGRESS' THEN 'in_progress'
    WHEN 'DONE'        THEN 'done'
  END;

-- Safety net: any Task whose ownerId had no seeded status (shouldn't happen — step 2 covers all
-- users) would remain NULL and the SET NOT NULL below would fail loudly. That is the zero-loss guard.
ALTER TABLE "Task" ALTER COLUMN "statusId" SET NOT NULL;
ALTER TABLE "Task" ADD CONSTRAINT "Task_statusId_fkey"
    FOREIGN KEY ("statusId") REFERENCES "Status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Task_ownerId_statusId_idx" ON "Task"("ownerId", "statusId");

-- 4. Drop the old status column, its index, and the legacy enum type.
DROP INDEX "Task_ownerId_status_idx";
ALTER TABLE "Task" DROP COLUMN "status";
DROP TYPE "StatusEnum_legacy";
