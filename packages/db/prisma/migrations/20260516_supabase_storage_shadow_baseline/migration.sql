-- Minimal Supabase Storage baseline for Prisma shadow database replay.
-- Supabase manages these objects in real hosted databases, but Prisma's shadow
-- database may not include them when replaying application migrations.

CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "owner" UUID,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "public" BOOLEAN DEFAULT false,
  "avif_autodetection" BOOLEAN DEFAULT false,
  "file_size_limit" BIGINT,
  "allowed_mime_types" TEXT[],

  CONSTRAINT "buckets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS storage.objects (
  "id" UUID NOT NULL,
  "bucket_id" TEXT,
  "name" TEXT,
  "owner" UUID,
  "created_at" TIMESTAMPTZ DEFAULT now(),
  "updated_at" TIMESTAMPTZ DEFAULT now(),
  "last_accessed_at" TIMESTAMPTZ DEFAULT now(),
  "metadata" JSONB,

  CONSTRAINT "objects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "objects_bucketId_fkey"
    FOREIGN KEY ("bucket_id") REFERENCES storage.buckets("id")
    ON DELETE CASCADE
);
