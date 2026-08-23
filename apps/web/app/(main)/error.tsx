"use client";

import React, { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";

import { getLogger } from "@/lib/logger";
import {
  isClientRuntimeMismatch,
  reloadLatestAppVersion,
} from "./error-recovery";

const log = getLogger("ui:MainError");

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MainError({ error, reset }: ErrorProps) {
  const [isRecovering, setIsRecovering] = useState(false);
  const runtimeMismatch = isClientRuntimeMismatch(error);

  useEffect(() => {
    log.error("Main route failed", error);
  }, [error]);

  const reload = () => {
    if (isRecovering) return;
    setIsRecovering(true);
    void reloadLatestAppVersion();
  };

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-5 p-8"
      role="alert"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-danger-50">
        <AlertTriangle className="h-7 w-7 text-danger-600" aria-hidden="true" />
      </div>

      <div className="text-center">
        <h2 className="text-lg font-bold text-surface-900">Terjadi Kesalahan</h2>
        <p className="mt-1 max-w-sm text-sm text-surface-500">
          {runtimeMismatch
            ? "Versi aplikasi telah diperbarui. Muat ulang halaman untuk melanjutkan."
            : "Halaman tidak dapat dimuat. Silakan coba lagi."}
        </p>
        {error.digest && (
          <p className="mt-1 font-mono text-xs text-surface-400">
            ID: {error.digest}
          </p>
        )}
      </div>

      <div className="flex w-full max-w-sm flex-col justify-center gap-2 sm:flex-row">
        {!runtimeMismatch && (
          <button
            type="button"
            onClick={reset}
            disabled={isRecovering}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Coba Lagi
          </button>
        )}
        <button
          type="button"
          onClick={reload}
          disabled={isRecovering}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-surface-300 bg-white px-5 py-2.5 text-sm font-semibold text-surface-800 transition-colors hover:bg-surface-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRecovering ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {runtimeMismatch ? "Muat Ulang Versi Terbaru" : "Muat Ulang Halaman"}
        </button>
      </div>
    </div>
  );
}
