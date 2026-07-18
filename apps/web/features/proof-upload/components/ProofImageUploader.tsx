"use client";

import React, { useReducer, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, Trash2, Upload } from "lucide-react";
import {
  type ProofUploadContext,
  shouldRevealPrntScFallback,
  validateProofFile,
} from "../helpers/proof-upload-core";
import { getPrntScProxyUrl } from "@/lib/prntsc";
import { useRole } from "@/components/providers/RoleProvider";

type ProofDeleteRequest = (
  input: string,
  init: RequestInit,
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export async function deleteUploadedProof(
  url: string,
  request: ProofDeleteRequest = fetch,
) {
  if (getPrntScProxyUrl(url)) return;
  const response = await request("/api/proof-uploads", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message || "Gagal menghapus foto bukti.");
  }
}

type ProofUploadState = {
  uploading: boolean;
  error: string | null;
  fallbackVisible: boolean;
};

type ProofUploadAction =
  | { type: "started" }
  | { type: "succeeded" }
  | { type: "failed"; status: number | null; message: string; code?: string };

export const INITIAL_PROOF_UPLOAD_STATE: ProofUploadState = {
  uploading: false,
  error: null,
  fallbackVisible: false,
};

export function proofUploadReducer(
  state: ProofUploadState,
  action: ProofUploadAction,
): ProofUploadState {
  if (action.type === "started") {
    return { ...state, uploading: true, error: null };
  }
  if (action.type === "succeeded") {
    return { uploading: false, error: null, fallbackVisible: false };
  }
  return {
    uploading: false,
    error: action.message,
    fallbackVisible: shouldRevealPrntScFallback(action.status, action.code),
  };
}

export function ProofImageUploader({
  context,
  label,
  value,
  onChange,
  required = false,
  disabled = false,
  onDelete,
}: {
  context: ProofUploadContext;
  label: string;
  value: string;
  onChange: (url: string) => void;
  required?: boolean;
  disabled?: boolean;
  onDelete?: (url: string) => Promise<void>;
}) {
  const { canPerform } = useRole();
  const [state, dispatch] = useReducer(
    proofUploadReducer,
    INITIAL_PROOF_UPLOAD_STATE,
  );
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const uploadFile = async (file: File) => {
    const validation = validateProofFile(file);
    if (!validation.ok) {
      dispatch({
        type: "failed",
        status: validation.status,
        message: validation.message,
      });
      return;
    }

    setLastFile(file);
    dispatch({ type: "started" });
    const formData = new FormData();
    formData.set("context", context);
    formData.set("file", file);

    try {
      const response = await fetch("/api/proof-uploads", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json().catch(() => null)) as {
        data?: { url?: string };
        message?: string;
        code?: string;
      } | null;

      if (!response.ok || !body?.data?.url) {
        dispatch({
          type: "failed",
          status: response.status,
          code: body?.code,
          message: body?.message || "Gagal mengunggah bukti.",
        });
        return;
      }

      onChange(body.data.url);
      dispatch({ type: "succeeded" });
    } catch {
      dispatch({
        type: "failed",
        status: null,
        message: "Tidak dapat terhubung ke penyimpanan R2. Silakan coba lagi.",
      });
    }
  };

  const previewUrl = getPrntScProxyUrl(value) ?? value;
  const canDelete = Boolean(value) && canPerform("proof_upload", "delete");

  const handleDelete = async () => {
    if (!value || !window.confirm("Hapus foto bukti ini? Tindakan ini tidak dapat dibatalkan.")) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await (onDelete ? onDelete(value) : deleteUploadedProof(value));
      onChange("");
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Gagal menghapus foto bukti.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-bold text-surface-600">
        {label} {required && <span className="text-danger-500">*</span>}
      </label>
      <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-surface-300 bg-surface-50 px-4 py-2.5 text-sm font-semibold text-surface-700 transition-colors hover:border-brand-400 hover:bg-brand-50">
        {state.uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {state.uploading ? "Mengunggah..." : "Pilih gambar bukti"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          className="sr-only"
          disabled={disabled || state.uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadFile(file);
            event.target.value = "";
          }}
        />
      </label>
      <p className="text-[11px] text-surface-500">
        Format JPEG, PNG, WebP, GIF, atau AVIF. Maksimum 5 MB.
      </p>

      {state.error && (
        <div className="flex items-start gap-2 rounded-lg border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p>{state.error}</p>
            {lastFile && state.fallbackVisible && (
              <button
                type="button"
                className="mt-1 font-bold underline"
                disabled={disabled || state.uploading}
                onClick={() => void uploadFile(lastFile)}
              >
                Coba Lagi
              </button>
            )}
          </div>
        </div>
      )}

      {state.fallbackVisible && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <label className="mb-1 block text-xs font-bold text-amber-900">
            Gunakan prnt.sc sebagai fallback
          </label>
          <input
            type="url"
            required={required}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder="https://prnt.sc/..."
            disabled={disabled || state.uploading}
            className="h-10 w-full rounded-lg border border-amber-300 bg-white px-3 text-sm outline-none focus:border-amber-500"
          />
          <p className="mt-1 text-[11px] text-amber-800">
            R2 sedang bermasalah. Unggah gambar ke prnt.sc lalu tempel tautannya di sini.
          </p>
        </div>
      )}

      {value && (
        <div className="relative overflow-hidden rounded-xl border border-surface-200 bg-surface-50">
          <img
            src={previewUrl}
            alt={`Pratinjau ${label.toLowerCase()}`}
            className="max-h-72 w-full object-contain"
          />
          <div className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 text-[11px] font-bold text-emerald-700 shadow-sm">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Siap digunakan
          </div>
          {canDelete && (
            <button
              type="button"
              disabled={disabled || deleting}
              onClick={() => void handleDelete()}
              className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-danger-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-sm disabled:opacity-60"
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              {deleting ? "Menghapus..." : "Hapus foto"}
            </button>
          )}
        </div>
      )}
      {deleteError && <p className="text-xs text-danger-700">{deleteError}</p>}
    </div>
  );
}
