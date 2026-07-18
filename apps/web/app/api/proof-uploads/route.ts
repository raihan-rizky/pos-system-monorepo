import { NextResponse } from "next/server";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import {
  getProofUploadPolicy,
  parseProofRotation,
  validateProofFile,
} from "@/features/proof-upload/helpers/proof-upload-core";
import {
  deleteProofFromR2,
  isInvalidProofObjectError,
  isProofStorageUnavailableError,
  uploadProofToR2,
} from "@/features/proof-upload/server/r2-proof-storage";
import {
  isProofPreprocessingError,
  preprocessProofImage,
} from "@/features/proof-upload/server/preprocess-proof-image";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:proof-uploads");
export const dynamic = "force-dynamic";

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

function isFileLike(value: unknown): value is File {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as File).type === "string" &&
      typeof (value as File).size === "number" &&
      typeof (value as File).arrayBuffer === "function",
  );
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const context = formData.get("context");
    const file = formData.get("file");
    const rotation = parseProofRotation(formData.get("rotation"));

    if (typeof context !== "string") {
      return jsonError("Konteks bukti wajib diisi.", 422);
    }

    const policy = getProofUploadPolicy(context);
    if (!policy) {
      return jsonError("Konteks bukti tidak valid.", 422);
    }

    if (!isFileLike(file)) {
      return jsonError("File bukti wajib dipilih.", 422);
    }

    if (rotation === null) {
      return jsonError("Rotasi gambar tidak valid.", 422);
    }

    const validation = validateProofFile(file);
    if (!validation.ok) {
      return jsonError(validation.message, validation.status);
    }

    const user = await requirePermission(policy.resource, policy.action);
    if (policy.requiresStore && !user.storeId) {
      return jsonError("Bukti ini memerlukan pengguna yang terhubung ke toko.", 403);
    }

    const processed = await preprocessProofImage(
      Buffer.from(await file.arrayBuffer()),
      file.type,
      rotation,
    );
    const result = await uploadProofToR2({
      body: processed.buffer,
      mimeType: processed.mimeType,
      prefix: policy.prefix,
      scopeId: user.storeId ?? `user-${user.id}`,
      extension: processed.extension,
    });

    return NextResponse.json(
      {
        data: {
          ...result,
          width: processed.width,
          height: processed.height,
          inputBytes: processed.inputBytes,
          outputBytes: processed.outputBytes,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    if (isProofPreprocessingError(error)) {
      return NextResponse.json(
        {
          message: error.message,
          code: "PROOF_PREPROCESSING_FAILED",
        },
        { status: 422 },
      );
    }

    if (isProofStorageUnavailableError(error)) {
      log.error("R2 proof upload unavailable", error);
      return jsonError(
        "Penyimpanan R2 sedang tidak tersedia. Silakan coba lagi.",
        503,
      );
    }

    log.error("Failed to upload proof", error);
    return jsonError("Gagal mengunggah bukti.", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requirePermission("proof_upload", "delete");
    const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
    if (typeof body?.url !== "string" || !body.url.trim()) {
      return jsonError("Tautan bukti wajib diisi.", 422);
    }

    const result = await deleteProofFromR2(body.url);
    log.info("R2 proof deleted", {
      userId: user.id,
      storeId: user.storeId,
      objectKey: result.objectKey,
    });
    return NextResponse.json({ data: result });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    if (isInvalidProofObjectError(error)) {
      return jsonError("Tautan bukan bukti R2 yang dapat dihapus.", 422);
    }
    if (isProofStorageUnavailableError(error)) {
      log.error("R2 proof deletion unavailable", error);
      return jsonError("Foto belum dapat dihapus dari R2. Silakan coba lagi.", 503);
    }

    log.error("Failed to delete R2 proof", error);
    return jsonError("Gagal menghapus foto bukti.", 500);
  }
}
