"use client";

import React from "react";
import { sendChatMessage } from "@/features/ai-assistant/api/assistantApi";

interface UseChartInsightOptions {
  chartTitle: string;
  chartContext: string;
  defaultInsights?: string[];
  defaultError?: string;
  defaultLoading?: boolean;
}

interface UseChartInsightReturn {
  insights: string[];
  loading: boolean;
  error: string | null;
  fetch: () => Promise<void>;
  reset: () => void;
}

export function useChartInsight({
  chartTitle,
  chartContext,
  defaultInsights,
  defaultError,
  defaultLoading,
}: UseChartInsightOptions): UseChartInsightReturn {
  const [insights, setInsights] = React.useState<string[]>(defaultInsights ?? []);
  const [loading, setLoading] = React.useState(defaultLoading ?? false);
  const [error, setError] = React.useState<string | null>(defaultError ?? null);
  const abortRef = React.useRef<AbortController | null>(null);

  const fetch = React.useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);
    setInsights([]);

    try {
      const stream = await sendChatMessage(
        {
          messages: [
            {
              role: "user",
              content: `Berikan 3–5 insight singkat dan saran actionable dari data grafik berikut.\nGrafik: ${chartTitle}\nData: ${chartContext}\n\nFormat jawaban: bullet points langsung, tanpa intro.`,
            },
          ],
        },
        { signal: ac.signal },
      );

      let answer = "";
      for await (const frame of stream) {
        if ("type" in frame && frame.type === "final") {
          answer = frame.answer.answerMarkdown;
        }
      }

      const bullets = answer
        .split("\n")
        .map((l) => l.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean);
      setInsights(bullets.length ? bullets : [answer.trim()]);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setError((err as Error).message || "Gagal memuat insight AI");
    } finally {
      setLoading(false);
    }
  }, [chartTitle, chartContext]);

  const reset = React.useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
    setInsights([]);
    setError(null);
  }, []);

  return { insights, loading, error, fetch, reset };
}
