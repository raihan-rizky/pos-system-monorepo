-- Enable Row Level Security
ALTER TABLE "pos_users" ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read pos_users
CREATE POLICY "Allow authenticated users to read pos_users"
  ON "pos_users"
  FOR SELECT
  TO authenticated
  USING (true);

-- Grant select permission to authenticated users
GRANT SELECT ON TABLE "pos_users" TO authenticated;
