"use client";

import { customerRecapApi } from "../api/customerRecapApi";
import {
  buildCustomerRecapRange,
  type CustomerRecapPreset,
} from "./recap-core";
import type { CustomerRecapQuery } from "../types/customer-recap";
import type { AssistantExportFormat, AssistantReportPeriod } from "@/features/ai-assistant/types/assistant";

/** Reuses `advice` when the caller already generated it, so the export skips a second AI call. */
export type CustomerRecapExportOptions = { advice?: string[] };

export async function exportCustomerRecapRange(
  range: CustomerRecapQuery,
  format: AssistantExportFormat,
  options: CustomerRecapExportOptions = {},
): Promise<{ advice: string[] }> {
  const data = await customerRecapApi.getExportRecap(range);
  const [{ generateCustomerRecapAiAnalysis }, exportFiles] = await Promise.all([
    import("./customer-recap-ai"),
    import("./export-files"),
  ]);
  const aiAnalysis = options.advice?.length
    ? options.advice
    : await generateCustomerRecapAiAnalysis(data);

  if (format === "xlsx") {
    await exportFiles.exportCustomerRecapXlsx(data, aiAnalysis);
  } else {
    await exportFiles.exportCustomerRecapPdf(data, aiAnalysis);
  }
  return { advice: aiAnalysis };
}

export async function exportCustomerRecapPeriod(
  period: AssistantReportPeriod,
  format: AssistantExportFormat,
  options: CustomerRecapExportOptions = {},
): Promise<{ advice: string[] }> {
  const preset: CustomerRecapPreset = period;
  return exportCustomerRecapRange(buildCustomerRecapRange(preset), format, options);
}

export async function loadCustomerRecapAdvice(
  period: AssistantReportPeriod,
  options: { signal?: AbortSignal } = {},
): Promise<{ advice: string[] }> {
  const preset: CustomerRecapPreset = period;
  const data = await customerRecapApi.getExportRecap(buildCustomerRecapRange(preset));
  const { generateCustomerRecapAiAnalysis, CUSTOMER_RECAP_AI_FALLBACK } = await import("./customer-recap-ai");
  const advice = await generateCustomerRecapAiAnalysis(data, options);
  // The generator swallows its own errors; surface them so the caller can retry.
  if (advice.length === 1 && advice[0] === CUSTOMER_RECAP_AI_FALLBACK) {
    throw new Error(CUSTOMER_RECAP_AI_FALLBACK);
  }
  return { advice };
}
