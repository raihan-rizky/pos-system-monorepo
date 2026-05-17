-- Allow authenticated middleware and client-side session checks to read
-- global RBAC settings. Writes still go through owner-only API routes.
ALTER TABLE "pos_role_permissions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read role permissions"
  ON "pos_role_permissions";

CREATE POLICY "Allow authenticated users to read role permissions"
  ON "pos_role_permissions"
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON TABLE "pos_role_permissions" TO authenticated;
