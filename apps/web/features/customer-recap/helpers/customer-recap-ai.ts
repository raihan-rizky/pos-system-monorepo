import { sendChatMessage } from "@/features/ai-assistant/api/assistantApi";
import type { CustomerRecapExportData } from "./export-core";

export const CUSTOMER_RECAP_AI_FALLBACK = "Analisis AI tidak tersedia";

function buildAiContext(data: CustomerRecapExportData): string {
  return JSON.stringify({
    period: { dateFrom: data.dateFrom, dateTo: data.dateTo },
    summary: data.summary,
    typeSummaries: data.typeSummaries,
    topProductsByType: data.groups.map((group) => ({
      type: group.type,
      topProducts: group.topProducts,
    })),
  });
}

function normalizeBullets(answer: string): string[] {
  const bullets = answer
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);

  return bullets.length > 0 ? bullets.slice(0, 5) : [CUSTOMER_RECAP_AI_FALLBACK];
}

export async function generateCustomerRecapAiAnalysis(
  data: CustomerRecapExportData,
  options: { signal?: AbortSignal } = {},
): Promise<string[]> {
  try {
    const stream = await sendChatMessage(
      {
        messages: [
          {
            role: "user",
            content: `Berikan 3-5 insight singkat dan saran actionable dari rekap pelanggan berikut. Gunakan bahasa Indonesia yang jelas dan ringkas. Format jawaban: bullet points langsung, tanpa intro.\nData rekap: ${buildAiContext(data)}`,
          },
        ],
        pageContext: { page: "customers" },
      },
      options,
    );

    let answer = "";
    for await (const frame of stream) {
      if ("type" in frame && frame.type === "final") {
        answer = frame.answer.answerMarkdown;
      }
    }

    return normalizeBullets(answer);
  } catch {
    return [CUSTOMER_RECAP_AI_FALLBACK];
  }
}
