-- Supabase Storage bucket for product images and store media.
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'pos-media',
  'pos-media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Allow authenticated users to upload POS media"
  ON storage.objects;

CREATE POLICY "Allow authenticated users to upload POS media"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'pos-media');

DROP POLICY IF EXISTS "Allow authenticated users to update POS media"
  ON storage.objects;

CREATE POLICY "Allow authenticated users to update POS media"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'pos-media')
  WITH CHECK (bucket_id = 'pos-media');

DROP POLICY IF EXISTS "Allow public read access to POS media"
  ON storage.objects;

CREATE POLICY "Allow public read access to POS media"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'pos-media');
