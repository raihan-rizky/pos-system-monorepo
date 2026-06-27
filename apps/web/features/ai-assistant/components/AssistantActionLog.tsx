"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, Circle, Loader2 } from "lucide-react";
import type { AssistantActionLogEntry } from "../types/assistant";

type AssistantActionLogProps = {
  entries: AssistantActionLogEntry[];
};

function formatActionTime(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusIcon(entry: AssistantActionLogEntry) {
  if (entry.status === "failed") return <AlertCircle className="h-3.5 w-3.5 text-danger-400" aria-hidden="true" />;
  if (entry.status === "active") return <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-300" aria-hidden="true" />;
  return <CheckCircle2 className="h-3.5 w-3.5 text-success-400" aria-hidden="true" />;
}

export function AssistantActionLog({ entries }: AssistantActionLogProps) {
  const [expanded, setExpanded] = useState(() => entries.some((entry) => entry.status === "active"));
  if (entries.length === 0) return null;

  const latest = entries[entries.length - 1];
  const latestTime = formatActionTime(latest.occurredAt);
  const isActive = entries.some((entry) => entry.status === "active");

  return (
    <div className="mt-3 border-t border-surface-500/30 pt-2 text-[11px] text-surface-300">
      {/* Loading shimmer bar — visible while any step is actively running */}
      {isActive ? (
        <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-surface-700/40">
          <div
            className="h-full w-1/2 rounded-full"
            style={{
              background: "linear-gradient(90deg, transparent, rgba(12, 152, 233, 0.7), rgba(56, 189, 248, 0.5), transparent)",
              animation: "assistant-shimmer 1.5s ease-in-out infinite",
            }}
          />
          <style>{`
            @keyframes assistant-shimmer {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(300%); }
            }
          `}</style>
        </div>
      ) : null}

      <button
        type="button"
        className="flex w-full items-center gap-2 text-left transition-colors hover:text-surface-100"
        aria-expanded={expanded}
        aria-label={expanded ? "Sembunyikan proses AI" : "Tampilkan proses AI"}
        onClick={() => setExpanded((value) => !value)}
      >
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
        <Circle className="h-2 w-2 flex-shrink-0 fill-current text-brand-300" aria-hidden="true" />
        <span className="font-semibold text-surface-200">Status</span>
        <span className="min-w-0 flex-1 truncate text-surface-400">{latest.label}</span>
        <time className="flex-shrink-0 text-[10px] text-surface-500" dateTime={latest.occurredAt}>
          {latestTime}
        </time>
      </button>

      {expanded ? (
        <ol className="mt-2 space-y-2" aria-label="Proses AI">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-start gap-2">
              <span className="mt-0.5 flex-shrink-0">{statusIcon(entry)}</span>
              <span className={entry.status === "failed" ? "min-w-0 flex-1 text-danger-300" : "min-w-0 flex-1 text-surface-300"}>
                {entry.label}
              </span>
              <time className="flex-shrink-0 text-[10px] text-surface-500" dateTime={entry.occurredAt}>
                {formatActionTime(entry.occurredAt)}
              </time>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
