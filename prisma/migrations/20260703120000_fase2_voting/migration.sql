-- Fase 2 — Voting core. PR-L5a.
--
-- Additive only: every existing and newly-created board remains DIRECT unless explicitly toggled, so an
-- image rollback that does not know proposals keeps operating on the same task/status tables.

CREATE TYPE "BoardMode" AS ENUM ('DIRECT', 'VOTE');
CREATE TYPE "ProposalStatus" AS ENUM ('PENDING', 'APPLIED', 'REJECTED');
CREATE TYPE "VoteValue" AS ENUM ('APPROVE', 'REJECT');

ALTER TABLE "Board" ADD COLUMN "mode" "BoardMode" NOT NULL DEFAULT 'DIRECT';

CREATE TABLE "Proposal" (
  "id" UUID NOT NULL,
  "boardId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "targetTaskId" UUID,
  "payload" JSONB NOT NULL,
  "targetVersion" TIMESTAMPTZ(6),
  "status" "ProposalStatus" NOT NULL DEFAULT 'PENDING',
  "meta" JSONB,
  "createdByParticipantId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Proposal_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Proposal_targetTaskId_fkey" FOREIGN KEY ("targetTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Proposal_createdByParticipantId_fkey" FOREIGN KEY ("createdByParticipantId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Vote" (
  "id" UUID NOT NULL,
  "proposalId" UUID NOT NULL,
  "participantId" UUID NOT NULL,
  "value" "VoteValue" NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "Vote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Vote_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Vote_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Proposal_boardId_status_createdAt_idx" ON "Proposal"("boardId", "status", "createdAt");
CREATE INDEX "Proposal_targetTaskId_idx" ON "Proposal"("targetTaskId");
CREATE UNIQUE INDEX "Vote_proposalId_participantId_key" ON "Vote"("proposalId", "participantId");
CREATE INDEX "Vote_participantId_idx" ON "Vote"("participantId");
