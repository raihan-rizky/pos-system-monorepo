"use client";

import React from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MainError({ error, reset }: ErrorProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-5">
      {/* Icon */}
      <div className="w-16 h-16 rounded-full bg-danger-50 flex items-center justify-center">
        <svg
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#dc2626"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
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
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
        </svg>
        Coba Lagi
      </button>
    </div>
  );
}
