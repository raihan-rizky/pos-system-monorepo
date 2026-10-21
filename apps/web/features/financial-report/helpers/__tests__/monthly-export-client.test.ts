import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportMonthlyFinancialReport } from "../monthly-export-client";

const { serialize } = vi.hoisted(() => ({ serialize: vi.fn(() => new Uint8Array([80, 75])) }));
vi.mock("../monthly-workbook", () => ({ serializeMonthlyWorkbook: serialize }));

describe("exportMonthlyFinancialReport", () => {
  const anchor = { href: "", download: "", click: vi.fn(), remove: vi.fn() };
  const createUrl = vi.fn<(blob: Blob) => string>(() => "blob:monthly-export");
  const revokeUrl = vi.fn();
  const fetchReport = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    anchor.href = "";
    anchor.download = "";
    vi.stubGlobal("document", { createElement: () => anchor, body: { appendChild: vi.fn() } });
    vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    vi.stubGlobal("fetch", fetchReport);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("downloads the selected monthly report and cleans up its temporary URL", async () => {
    const report = { year: 2026, month: 9, income: [], expenses: [], receivables: [] };
    fetchReport.mockResolvedValue(new Response(JSON.stringify(report), { status: 200 }));
    await exportMonthlyFinancialReport(2026, 9);
    expect(fetchReport).toHaveBeenCalledWith("/api/finance/report/monthly?year=2026&month=9", { cache: "no-store" });
    expect(serialize).toHaveBeenCalledWith(report);
    expect(createUrl.mock.calls[0][0]).toBeInstanceOf(Blob);
    expect(anchor.download).toBe("laporan-keuangan-2026-09.xlsx");
    expect(anchor.href).toBe("blob:monthly-export");
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    await vi.runAllTimersAsync();
    expect(revokeUrl).toHaveBeenCalledWith("blob:monthly-export");
  });

  it("rejects an unsuccessful response before building or downloading a workbook", async () => {
    fetchReport.mockResolvedValue(new Response(JSON.stringify({ message: "Data laporan belum dapat dimuat." }), { status: 500 }));
    await expect(exportMonthlyFinancialReport(2026, 9)).rejects.toThrow("Data laporan belum dapat dimuat.");
    expect(serialize).not.toHaveBeenCalled();
    expect(createUrl).not.toHaveBeenCalled();
    expect(anchor.click).not.toHaveBeenCalled();
  });

  it("reports a friendly failure when the server does not return JSON", async () => {
    fetchReport.mockResolvedValue(new Response("Bad gateway", { status: 502 }));
    await expect(exportMonthlyFinancialReport(2026, 9)).rejects.toThrow("Laporan belum bisa diunduh. Silakan coba lagi.");
    expect(serialize).not.toHaveBeenCalled();
  });

  it("reports a friendly message when the network connection fails", async () => {
    fetchReport.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(exportMonthlyFinancialReport(2026, 9)).rejects.toThrow("Koneksi terputus. Periksa internet Anda lalu coba lagi.");
    expect(anchor.click).not.toHaveBeenCalled();
  });

  it("releases the temporary URL even when the browser download fails", async () => {
    fetchReport.mockResolvedValue(new Response(JSON.stringify({ year: 2026, month: 9 }), { status: 200 }));
    anchor.click.mockImplementationOnce(() => { throw new Error("Download gagal"); });
    await expect(exportMonthlyFinancialReport(2026, 9)).rejects.toThrow("Download gagal");
    await vi.runAllTimersAsync();
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    expect(revokeUrl).toHaveBeenCalledWith("blob:monthly-export");
  });
});
