import { describe, expect, it, vi } from "vitest";
import { generateCustomerRecapAiAnalysis } from "../customer-recap-ai";
import type { CustomerRecapExportData } from "../export-core";

const sendChatMessageMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/ai-assistant/api/assistantApi", () => ({
  sendChatMessage: sendChatMessageMock,
}));

const exportData: CustomerRecapExportData = {
  dateFrom: "2026-05-01",
  dateTo: "2026-05-31",
  summary: {
    newCustomers: 3,
    returningCustomers: 4,
    churnedCustomers: 1,
    totalDebtOutstanding: 500_000,
    debtCollectedInPeriod: 100_000,
    avgOrderValue: 125_000,
    orderFrequency: 2,
    repeatPurchaseRate: 0.5,
  },
  typeSummaries: [
    {
      type: "AGEN",
      customerCount: 2,
      transactionCount: 4,
      totalSpent: 500_000,
      averageOrderValue: 125_000,
      debtOutstanding: 250_000,
    },
  ],
  groups: [
    {
      type: "AGEN",
      customers: [],
      topProducts: [
        { productId: "p1", productName: "Produk A", quantity: 4, subtotal: 500_000 },
      ],
      summary: {
        type: "AGEN",
        customerCount: 2,
        transactionCount: 4,
        totalSpent: 500_000,
        averageOrderValue: 125_000,
        debtOutstanding: 250_000,
      },
    },
  ],
};

async function* streamWithAnswer(answerMarkdown: string) {
  yield {
    type: "final" as const,
    answer: { answerMarkdown },
  };
}

describe("generateCustomerRecapAiAnalysis", () => {
  it("returns normalized Indonesian bullets from the existing AI stream", async () => {
    sendChatMessageMock.mockResolvedValueOnce(
      streamWithAnswer("- Penjualan Agen meningkat\n* Fokus stok Produk A"),
    );

    await expect(generateCustomerRecapAiAnalysis(exportData)).resolves.toEqual([
      "Penjualan Agen meningkat",
      "Fokus stok Produk A",
    ]);
    expect(sendChatMessageMock).toHaveBeenCalledTimes(1);
    expect(sendChatMessageMock.mock.calls[0]?.[0].messages[0].content).toContain(
      "2026-05-01",
    );
  });

  it("returns the fallback when the AI provider fails", async () => {
    sendChatMessageMock.mockRejectedValueOnce(new Error("provider unavailable"));

    await expect(generateCustomerRecapAiAnalysis(exportData)).resolves.toEqual([
      "Analisis AI tidak tersedia",
    ]);
  });
});
