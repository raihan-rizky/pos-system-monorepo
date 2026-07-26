import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportCustomerRecapPeriod, loadCustomerRecapAdvice } from "../customer-recap-export-client";

const getExportRecapMock = vi.hoisted(() => vi.fn());
const generateAnalysisMock = vi.hoisted(() => vi.fn());
const exportXlsxMock = vi.hoisted(() => vi.fn());
const exportPdfMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/customerRecapApi", () => ({
  customerRecapApi: { getExportRecap: getExportRecapMock },
}));

vi.mock("../customer-recap-ai", () => ({
  CUSTOMER_RECAP_AI_FALLBACK: "Analisis AI tidak tersedia",
  generateCustomerRecapAiAnalysis: generateAnalysisMock,
}));

vi.mock("../export-files", () => ({
  exportCustomerRecapXlsx: exportXlsxMock,
  exportCustomerRecapPdf: exportPdfMock,
}));

describe("customer recap export client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getExportRecapMock.mockResolvedValue({ dateFrom: "2026-05-01", dateTo: "2026-05-31" });
  });

  it("reuses advice already generated for the chat card instead of calling the AI again", async () => {
    const cached = ["Follow up pelanggan dengan piutang tertinggi."];

    await expect(exportCustomerRecapPeriod("30d", "pdf", { advice: cached })).resolves.toEqual({
      advice: cached,
    });

    expect(generateAnalysisMock).not.toHaveBeenCalled();
    expect(exportPdfMock).toHaveBeenCalledWith(expect.anything(), cached);
  });

  it("generates advice when the caller has none cached", async () => {
    generateAnalysisMock.mockResolvedValueOnce(["Stok Produk A perlu ditambah."]);

    await expect(exportCustomerRecapPeriod("30d", "xlsx")).resolves.toEqual({
      advice: ["Stok Produk A perlu ditambah."],
    });

    expect(generateAnalysisMock).toHaveBeenCalledTimes(1);
    expect(exportXlsxMock).toHaveBeenCalledWith(expect.anything(), ["Stok Produk A perlu ditambah."]);
  });

  it("loads advice without exporting any file", async () => {
    generateAnalysisMock.mockResolvedValueOnce(["Piutang AGEN naik."]);

    await expect(loadCustomerRecapAdvice("30d")).resolves.toEqual({ advice: ["Piutang AGEN naik."] });

    expect(exportPdfMock).not.toHaveBeenCalled();
    expect(exportXlsxMock).not.toHaveBeenCalled();
  });

  it("throws when the analysis falls back so the caller can retry", async () => {
    generateAnalysisMock.mockResolvedValueOnce(["Analisis AI tidak tersedia"]);

    await expect(loadCustomerRecapAdvice("30d")).rejects.toThrow("Analisis AI tidak tersedia");
  });
});
