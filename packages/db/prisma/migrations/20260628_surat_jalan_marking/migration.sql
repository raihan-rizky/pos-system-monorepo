CREATE TYPE "SuratJalanMarkingStatus" AS ENUM (
  'UNMARKED',
  'COMPLETED',
  'NOT_DELIVERED',
  'NEEDS_SIGNATURE',
  'NEEDS_FOLLOW_UP',
  'POSTPONED',
  'NOT_RELEVANT'
);

ALTER TABLE "pos_surat_jalan"
  ADD COLUMN "markingStatus" "SuratJalanMarkingStatus" NOT NULL DEFAULT 'UNMARKED',
  ADD COLUMN "markedById" TEXT,
  ADD COLUMN "markedByName" TEXT,
  ADD COLUMN "markedAt" TIMESTAMP(3),
  ADD COLUMN "markingNote" TEXT;

CREATE INDEX "pos_surat_jalan_storeId_markingStatus_idx"
  ON "pos_surat_jalan"("storeId", "markingStatus");
