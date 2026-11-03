CREATE TABLE "pos_role_permission_audits" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "actorStoreId" TEXT,
  "versionBefore" TEXT NOT NULL,
  "versionAfter" TEXT NOT NULL,
  "changes" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_role_permission_audits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_role_permission_audits_createdAt_idx" ON "pos_role_permission_audits"("createdAt");

-- Owner-only access is mediated by the authenticated server route.
-- No browser role receives a direct table policy or write privilege.
ALTER TABLE "pos_role_permission_audits" ENABLE ROW LEVEL SECURITY;
