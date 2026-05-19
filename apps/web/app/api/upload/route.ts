import { NextResponse } from "next/server";
import crypto from "crypto";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { createClient } from "@/utils/supabase/server";
import {
  isMissingStorageBucketError,
  POS_MEDIA_BUCKET,
} from "@/features/upload/helpers/upload-core";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:upload");
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);
const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

export async function POST(request: Request) {
  try {
    await requirePermission("product", "update");
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ message: "No file received." }, { status: 422 });
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json(
        { message: "File type not allowed. Only JPEG, PNG, WebP, GIF, and AVIF are accepted." },
        { status: 415 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { message: "File too large. Maximum size is 5 MB." },
        { status: 413 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = EXTENSION_BY_MIME_TYPE[file.type];
    const filename = `${crypto.randomBytes(8).toString("hex")}${ext}`;

    const supabase = await createClient();
    const { error } = await supabase.storage
      .from(POS_MEDIA_BUCKET)
      .upload(`products/${filename}`, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      log.error("Supabase Storage Error:", error);
      if (isMissingStorageBucketError(error)) {
        return NextResponse.json(
          {
            message:
              "Supabase Storage bucket is missing. Apply the pos-media storage migration before uploading images.",
          },
          { status: 503 },
        );
      }

      return NextResponse.json(
        { message: "Failed to upload image to storage." },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from(POS_MEDIA_BUCKET)
      .getPublicUrl(`products/${filename}`);

    return NextResponse.json({ url: publicUrlData.publicUrl }, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to upload image:", error);
    return NextResponse.json(
      { message: "Failed to upload image" },
      { status: 500 }
    );
  }
}
