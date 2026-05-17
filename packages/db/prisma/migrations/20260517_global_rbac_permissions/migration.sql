-- Global RBAC permission settings for built-in editable roles.
CREATE TABLE IF NOT EXISTS "pos_role_permissions" (
  "id" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "scope" TEXT NOT NULL,
  "target" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "allowed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pos_role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_role_permissions_role_scope_target_action_key"
  ON "pos_role_permissions"("role", "scope", "target", "action");

CREATE INDEX IF NOT EXISTS "pos_role_permissions_role_idx"
  ON "pos_role_permissions"("role");
