"use client";

import React from "react";
import { Sparkles, X, Loader2, AlertCircle } from "lucide-react";
import { useChartInsight } from "./hooks/useChartInsight";

export interface ChartAiInsightButtonProps {
  chartTitle: string;
  /** Serialised summary of chart data to send as context */
  chartContext: string;
  // test-only props to pre-seed state without interaction
  defaultOpen?: boolean;
  defaultLoading?: boolean;
  defaultInsights?: string[];
  defaultError?: string;
}

export const ChartAiInsightButton: React.FC<ChartAiInsightButtonProps> = ({
  chartTitle,
  chartContext,
  defaultOpen = false,
  defaultLoading = false,
  defaultInsights,
  defaultError,
}) => {
  const [open, setOpen] = React.useState(defaultOpen);

  const { insights, loading, error, fetch, reset } = useChartInsight({
    chartTitle,
    chartContext,
    defaultInsights,
    defaultError,
    defaultLoading,
  });

  const handleOpen = React.useCallback(() => {
    setOpen(true);
    if (!defaultInsights && !defaultError) void fetch();
  }, [defaultInsights, defaultError, fetch]);

  const handleClose = React.useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="chart-ai-insight-btn"
        aria-label="Analisis AI"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700 hover:bg-violet-100 transition-colors"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Analisis AI
      </button>

      {open && (
        <div
          data-testid="chart-ai-insight-panel"
          className="absolute right-0 top-full z-50 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
        >
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-violet-600" />
              <span className="text-sm font-bold text-slate-900">{chartTitle}</span>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Tutup"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {loading && (
            <div data-testid="chart-ai-insight-loading" className="space-y-2">
              {[80, 65, 90].map((w) => (
                <div
                  key={w}
                  className="h-3 animate-pulse rounded-full bg-slate-100"
                  style={{ width: `${w}%` }}
                />
              ))}
              <div className="flex items-center gap-1.5 pt-1 text-xs text-slate-400">
                <Loader2 className="h-3 w-3 animate-spin" />
                Menganalisis data...
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          {!loading && !error && insights.length > 0 && (
            <ul className="space-y-2">
              {insights.map((point) => (
                <li key={point} className="flex items-start gap-2 text-xs text-slate-700">
                  <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                  {point}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default ChartAiInsightButton;
