-- CreateEnum
CREATE TYPE "BoardRequestKind" AS ENUM ('RENAME', 'DELETE');

-- CreateEnum
CREATE TYPE "BoardRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Board" ADD COLUMN     "protected" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BoardRequest" (
    "id" UUID NOT NULL,
    "boardId" UUID NOT NULL,
    "participantId" UUID,
    "kind" "BoardRequestKind" NOT NULL,
    "proposedName" TEXT,
    "status" "BoardRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "BoardRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardRequest_boardId_status_idx" ON "BoardRequest"("boardId", "status");

-- AddForeignKey
ALTER TABLE "BoardRequest" ADD CONSTRAINT "BoardRequest_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardRequest" ADD CONSTRAINT "BoardRequest_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Protect the seed/demo board: it can never be deleted (owner-direct or via an approved request).
UPDATE "Board" SET "protected" = true WHERE "id" = '00000000-0000-4000-8000-0000000000b0';
