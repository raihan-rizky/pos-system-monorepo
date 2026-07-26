import crypto from "crypto";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import {
  deleteMediaFromR2,
  isMediaStorageUnavailableError,
  uploadMediaToR2,
} from "@/features/upload/server/r2-media-storage";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { NextResponse } from "next/server";

const log = getLogger("api:finance:expenses:attachments");
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

const ATTACHMENT_PATH_PATTERN = /^expenses\/[a-f0-9]{16}\.(jpg|png|webp|pdf)$/;

export async function POST(request: Request) {
  try {
    await requirePermission("expense", "create");
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return apiError("No file provided", 422, { code: "ValidationError" });
    }

    const ext = ALLOWED_MIME_TYPES[file.type];
    if (!ext) {
      return apiError(
        "Unsupported file type. Use JPG, PNG, WebP, or PDF.",
        415,
        { code: "UnsupportedMediaType" },
      );
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return apiError("File too large. Max 5 MB.", 413, {
        code: "PayloadTooLarge",
      });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = `${crypto.randomBytes(8).toString("hex")}${ext}`;
    const path = `expenses/${filename}`;

    const uploaded = await uploadMediaToR2({
      body: buffer,
      mimeType: file.type,
      objectKey: path,
    });

    return NextResponse.json(
      { data: { url: uploaded.url, path: uploaded.objectKey } },
      { status: 201 },
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to upload expense attachment", error);
    if (isMediaStorageUnavailableError(error)) {
      return apiError("Penyimpanan R2 sedang tidak tersedia", 503, {
        code: "ServiceUnavailable",
      });
    }
    return apiError("Failed to upload attachment", 500, {
      code: "InternalError",
    });
  }
}

export async function DELETE(request: Request) {
  try {
    await requirePermission("expense", "delete");
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path || !ATTACHMENT_PATH_PATTERN.test(path)) {
      return apiError("Invalid attachment path", 422, {
        code: "ValidationError",
      });
    }

    await deleteMediaFromR2(path);

    return NextResponse.json({ data: { path } });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to delete expense attachment", error);
    if (isMediaStorageUnavailableError(error)) {
      return apiError("Penyimpanan R2 sedang tidak tersedia", 503, {
        code: "ServiceUnavailable",
      });
    }
    return apiError("Failed to delete attachment", 500, {
      code: "InternalError",
    });
  }
}
