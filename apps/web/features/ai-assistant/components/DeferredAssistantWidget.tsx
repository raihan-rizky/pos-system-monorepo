"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

const AssistantWidget = dynamic(
  () => import("./AssistantWidget").then((module) => module.AssistantWidget),
  {
    ssr: false,
    loading: () => <AssistantLauncher loading />,
  },
);

function AssistantLauncher({
  loading = false,
  onClick,
}: {
  loading?: boolean;
  onClick?: () => void;
}) {
  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end md:bottom-6 md:right-6">
      <button
        type="button"
        className="floating-ai-button relative flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/20 bg-gradient-to-br from-brand-500/80 to-brand-800/80 text-white shadow-[0_0_20px_rgba(12,152,233,0.7),0_0_40px_rgba(0,121,199,0.5)] transition-transform duration-200 hover:scale-105 md:h-16 md:w-16"
        aria-label={loading ? "Memuat asisten AI" : "Buka asisten AI"}
        aria-busy={loading || undefined}
        disabled={loading}
        onClick={onClick}
      >
        <span className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent opacity-30" />
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`relative z-10 h-6 w-6 md:h-8 md:w-8 ${loading ? "animate-pulse" : ""}`}
        >
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />
          <path d="M15 13v2" />
          <path d="M9 13v2" />
        </svg>
        {!loading && (
          <span className="absolute inset-0 rounded-full bg-brand-500 opacity-20 motion-safe:animate-ping" />
        )}
      </button>
    </div>
  );
}

export function DeferredAssistantWidget({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [activated, setActivated] = useState(defaultOpen);

  if (activated) {
    return <AssistantWidget defaultOpen />;
  }

  return <AssistantLauncher onClick={() => setActivated(true)} />;
}
