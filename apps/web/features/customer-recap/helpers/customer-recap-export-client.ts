"use client";

import { customerRecapApi } from "../api/customerRecapApi";
import {
  buildCustomerRecapRange,
  type CustomerRecapPreset,
} from "./recap-core";
import type { CustomerRecapQuery } from "../types/customer-recap";
import type { AssistantExportFormat, AssistantReportPeriod } from "@/features/ai-assistant/types/assistant";

export async function exportCustomerRecapRange(
  range: CustomerRecapQuery,
  format: AssistantExportFormat,
): Promise<void> {
  const data = await customerRecapApi.getExportRecap(range);
  const [{ generateCustomerRecapAiAnalysis }, exportFiles] = await Promise.all([
    import("./customer-recap-ai"),
    import("./export-files"),
  ]);
  const aiAnalysis = await generateCustomerRecapAiAnalysis(data);

  if (format === "xlsx") {
    await exportFiles.exportCustomerRecapXlsx(data, aiAnalysis);
  } else {
    await exportFiles.exportCustomerRecapPdf(data, aiAnalysis);
  }
}

export async function exportCustomerRecapPeriod(
  period: AssistantReportPeriod,
  format: AssistantExportFormat,
): Promise<void> {
  const preset: CustomerRecapPreset = period;
  await exportCustomerRecapRange(buildCustomerRecapRange(preset), format);
}
