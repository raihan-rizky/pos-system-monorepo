import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";
import { createClient } from "@/utils/supabase/server";

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
    await requireRole("OWNER", "ADMIN");
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ message: "No file received." }, { status: 400 });
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
      .from("pos-media")
      .upload(`products/${filename}`, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      console.error("Supabase Storage Error:", error);
      return NextResponse.json(
        { message: "Failed to upload image to storage." },
        { status: 500 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from("pos-media")
      .getPublicUrl(`products/${filename}`);

    return NextResponse.json({ url: publicUrlData.publicUrl }, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Failed to upload image:", error);
    return NextResponse.json(
      { message: "Failed to upload image" },
      { status: 500 }
    );
  }
}
