import { describe, expect, it, vi } from "vitest";
import type { WorkBook } from "xlsx-js-style";

const captured = vi.hoisted(() => ({ workbooks: [] as WorkBook[], tables: [] as Array<{ body?: Array<Array<string | number>> }> }));
vi.mock("xlsx-js-style", async importOriginal => {
  const actual = await importOriginal<typeof import("xlsx-js-style")>();
  return { ...actual, ...(actual as unknown as { default: object }).default, writeFile: (workbook: WorkBook) => captured.workbooks.push(workbook) };
});
vi.mock("jspdf", async importOriginal => {
  const actual = await importOriginal<typeof import("jspdf")>();
  return { ...actual, default: class extends actual.jsPDF { constructor() { super({ orientation: "landscape", unit: "pt", format: "a4" }); this.save = vi.fn().mockReturnThis() as typeof this.save; } } };
});
vi.mock("jspdf-autotable", async importOriginal => {
  const actual = await importOriginal<typeof import("jspdf-autotable")>();
  return { ...actual, default: (doc: Parameters<typeof actual.default>[0], options: Parameters<typeof actual.default>[1]) => {
    captured.tables.push(options as typeof captured.tables[number]);
    return actual.default(doc, options);
  } };
});
import { exportFinancialReportFile, exportReportPdf, exportReportXlsx, type ExportInput } from "../journal-export";

describe("ekspor jurnal kategori", () => {
  const input: ExportInput = {
      period: "daily", from: "2026-09-02", to: "2026-09-02",
      rows: [{ tanggal: "2026-09-02", invoice: "INV", person: "", products: "Buku", categories: "ATK / Buku", status: "Pemasukan", amount: 0.01, method: "CASH" }],
      footer: { totalPemasukan: 0.01, totalPengeluaran: 0, grandTotal: 0.01, byMethod: { CASH: 0.01, TRANSFER: 0, QRIS: 0, DEBIT: 0, CREDIT: 0 } },
      categories: [{ categoryName: "ATK / Buku", transactionCount: 1, revenue: 0.01 }],
  };
  it("menampilkan sen pada PDF agar rincian tetap dapat direkonsiliasi", async () => {
    await exportReportPdf(input);
    expect(captured.tables.flatMap(table => table.body ?? []).flat()).toContain("Rp 0,01");
  });
  it("menampilkan sen pada Excel agar rincian tetap dapat direkonsiliasi", async () => {
    await exportReportXlsx(input);
    const sheet = captured.workbooks[0].Sheets["Kategori Produk"];
    expect(sheet.C2.v).toBe(0.01);
    expect(sheet.C2.s.numFmt).toContain("0.00");
  });
  it("sends the Sales preview context to the journal server", async () => {
    const fetchReport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Ditolak" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchReport);
    try {
      await expect(exportFinancialReportFile("daily", "pdf", true)).rejects.toThrow("Ditolak");
      expect(fetchReport).toHaveBeenCalledWith("/api/finance/report/journal?period=daily&view=sales", { cache: "no-store" });
    } finally { vi.unstubAllGlobals(); }
  });
  it("mengirim rentang tanggal pilihan untuk ekspor jurnal", async () => {
    const fetchReport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Ditolak" }), { status: 403 }));
    vi.stubGlobal("fetch", fetchReport);
    try {
      await expect(exportFinancialReportFile("custom", "pdf", false, { from: "2026-05-03", to: "2026-05-05" })).rejects.toThrow("Ditolak");
      expect(fetchReport).toHaveBeenCalledWith("/api/finance/report/journal?period=custom&from=2026-05-03&to=2026-05-05", { cache: "no-store" });
    } finally { vi.unstubAllGlobals(); }
  });
});
