-- Repair production schema drift where the original migration is recorded as
-- applied but the authenticated SELECT policy no longer exists.
ALTER TABLE "pos_role_permissions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read role permissions"
  ON "pos_role_permissions";

CREATE POLICY "Allow authenticated users to read role permissions"
  ON "pos_role_permissions"
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON TABLE "pos_role_permissions" TO authenticated;
