import type { Action } from "@/lib/rbac/permissions";

export const MAX_PROOF_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

const PROOF_UPLOAD_POLICIES = {
  expense: {
    resource: "expense",
    action: "create" as Action,
    prefix: "proofs/expenses",
    requiresStore: false,
  },
  transaction: {
    resource: "transaction",
    action: "update" as Action,
    prefix: "proofs/transactions",
    requiresStore: false,
  },
  "damaged-product": {
    resource: "inventory",
    action: "update" as Action,
    prefix: "proofs/damaged-products",
    requiresStore: true,
  },
  "weekly-cleaning": {
    resource: "inventory",
    action: "update" as Action,
    prefix: "proofs/weekly-cleaning",
    requiresStore: true,
  },
} as const;

export type ProofUploadContext = keyof typeof PROOF_UPLOAD_POLICIES;

export function getProofUploadPolicy(context: string) {
  return PROOF_UPLOAD_POLICIES[context as ProofUploadContext] ?? null;
}

export function validateProofFile(file: { type: string; size: number }):
  | { ok: true; extension: string }
  | { ok: false; status: 413 | 415; message: string } {
  const extension = EXTENSION_BY_MIME_TYPE[file.type];
  if (!extension) {
    return {
      ok: false,
      status: 415,
      message: "Format file tidak didukung. Gunakan JPEG, PNG, WebP, GIF, atau AVIF.",
    };
  }

  if (file.size > MAX_PROOF_FILE_SIZE_BYTES) {
    return {
      ok: false,
      status: 413,
      message: "Ukuran file terlalu besar. Maksimum 5 MB.",
    };
  }

  return { ok: true, extension };
}

export function shouldRevealPrntScFallback(
  status: number | null,
  code?: string,
) {
  return (
    status === null ||
    status >= 500 ||
    code === "PROOF_PREPROCESSING_FAILED"
  );
}

export function isConfiguredR2PublicUrl(rawUrl: string, publicBaseUrl: string) {
  try {
    const candidate = new URL(rawUrl);
    const base = new URL(publicBaseUrl);
    return candidate.protocol === "https:" && candidate.origin === base.origin;
  } catch {
    return false;
  }
}
