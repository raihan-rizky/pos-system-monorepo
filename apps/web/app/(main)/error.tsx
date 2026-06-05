"use client";

import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MainError({ error, reset }: ErrorProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-5">
      {/* Icon */}
      <div className="w-16 h-16 rounded-full bg-danger-50 flex items-center justify-center">
        <AlertTriangle className="h-7 w-7 text-danger-600" aria-hidden="true" />
      </div>

      <div className="text-center">
        <h2 className="text-lg font-bold text-surface-900">Terjadi Kesalahan</h2>
        <p className="text-sm text-surface-500 mt-1 max-w-sm">
          {error.message || "Halaman tidak dapat dimuat. Silakan coba lagi."}
        </p>
        {error.digest && (
          <p className="text-xs text-surface-400 mt-1 font-mono">
            ID: {error.digest}
          </p>
        )}
      </div>

      <button
        onClick={reset}
        className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Coba Lagi
      </button>
    </div>
  );
}
