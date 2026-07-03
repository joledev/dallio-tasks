-- Fase 2 — Guest INDEXES (L1b-guest). ADDITIVE, CREATE INDEX ONLY. PR-L1b.
--
-- H3: this layer ships exactly ONE additive index migration. NO column/table drops, NO SET NOT NULL,
-- NO data mutation — nothing destructive. Rolling back to the L1b-core image is safe (the extra
-- indexes are harmless to it), so auto-rollback stays enabled. The destructive drop of the legacy
-- ownerId/assigneeId columns remains the NEXT layer (L1c), only after this is live.

-- 1. Partial UNIQUE on Participant.sessionTokenHash --------------------------------------------------
--    Dedupes the opaque guest-session hash and gives resolveActor() a single indexed lookup. PARTIAL
--    (WHERE NOT NULL) so the many seed/demo participants whose sessionTokenHash is NULL are exempt —
--    only real, minted sessions are constrained to be unique. Prisma cannot express a filtered UNIQUE
--    in schema.prisma (same as the existing Status partial uniques), so it lives here in raw SQL.
CREATE UNIQUE INDEX "Participant_sessionTokenHash_key"
    ON "Participant" ("sessionTokenHash")
    WHERE "sessionTokenHash" IS NOT NULL;

-- 2. Index on Task.assigneeParticipantId ------------------------------------------------------------
--    Backs the H1 assignment lookups/filters (Postgres does not auto-index FK columns). Mirrored in
--    schema.prisma as `@@index([assigneeParticipantId])`.
CREATE INDEX "Task_assigneeParticipantId_idx" ON "Task" ("assigneeParticipantId");
