import React from "react";

export default function MainLoading() {
  return (
    <>
      {/* Slim progress bar at the very top — instant visual feedback */}
      <div className="fixed top-0 left-0 right-0 z-[999] h-[3px] bg-brand-600 animate-progress-bar shadow-[0_0_8px_rgba(12,152,233,0.6)]" />

      {/* Content-area skeleton — matches typical page layout */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header skeleton */}
        <div className="px-4 md:px-8 py-4 md:py-6 bg-white border-b border-surface-100">
          <div className="h-7 w-48 bg-surface-100 rounded-xl animate-pulse" />
          <div className="h-4 w-72 bg-surface-100 rounded-xl animate-pulse mt-2" />
        </div>

        {/* Body skeleton */}
        <div className="flex-1 p-4 md:p-8 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-28 rounded-2xl bg-surface-100 animate-pulse"
                style={{ animationDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
          <div className="h-72 rounded-2xl bg-surface-100 animate-pulse" style={{ animationDelay: "120ms" }} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="h-48 rounded-2xl bg-surface-100 animate-pulse" style={{ animationDelay: "180ms" }} />
            <div className="h-48 rounded-2xl bg-surface-100 animate-pulse" style={{ animationDelay: "220ms" }} />
          </div>
        </div>
      </div>
    </>
  );
}

