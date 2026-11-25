import { describe, expect, it, vi } from "vitest";
import { createReportPdf, exportFinancialReportFile, type ExportInput } from "../journal-export";

const savedPdf = vi.hoisted(() => vi.fn<(contents: string) => void>());
vi.mock("jspdf", async (importOriginal) => {
  const original = await importOriginal<typeof import("jspdf")>();
  return {
    ...original,
    default: class extends original.jsPDF {
      constructor(options: import("jspdf").jsPDFOptions) {
        super(options);
        const capturePdf = () => {
          savedPdf(this.output());
          return this;
        };
        function save(filename: string, options: { returnPromise: true }): Promise<void>;
        function save(filename?: string): import("jspdf").jsPDF;
        function save(_filename?: string, options?: { returnPromise: true }): import("jspdf").jsPDF | Promise<void> {
          const pdf = capturePdf();
          return options?.returnPromise ? Promise.resolve() : pdf;
        }
        this.save = save;
      }
    },
  };
});

const journal: ExportInput = {
  period: "daily",
  from: "2026-11-25",
  to: "2026-11-25",
  rows: [{
    tanggal: "2026-11-25",
    invoice: "INV-CONTOH-001",
    person: "Pemohon contoh",
    products: "Produk contoh",
    categories: "ATK",
    status: "Pemasukan",
    amount: 25000,
    method: "CASH",
  }],
  footer: {
    totalPemasukan: 25000,
    totalPengeluaran: 0,
    grandTotal: 25000,
    byMethod: { CASH: 25000, TRANSFER: 0, QRIS: 0, DEBIT: 0, CREDIT: 0 },
  },
  categories: [{ categoryName: "ATK", transactionCount: 1, revenue: 25000 }],
};

describe("tata letak PDF Jurnal Transaksi", () => {
  it("memuat ringkasan satu halaman tanpa rincian invoice", async () => {
    const report = await createReportPdf(journal, "single");
    const contents = report.output();

    expect(report.getNumberOfPages()).toBe(1);
    expect(contents.includes("TOTAL PEMASUKAN")).toBe(true);
    expect(contents.includes("Rincian per Metode Pembayaran")).toBe(true);
    expect(contents.includes("Revenue per Kategori Produk")).toBe(true);
    expect(contents.includes("No. Invoice")).toBe(false);
    expect(contents.includes("INV-CONTOH-001")).toBe(false);
  });

  it("memuat rincian invoice secara bawaan", async () => {
    const contents = (await createReportPdf(journal)).output();

    expect(contents.includes("No. Invoice")).toBe(true);
    expect(contents.includes("INV-CONTOH-001")).toBe(true);
  });

  it("mengekspor katalog lengkap dan mempertahankan omzet dari nama subkategori lama", async () => {
    const fetchReport = vi.fn()
      .mockResolvedValueOnce(Response.json(journal))
      .mockResolvedValueOnce(Response.json({
        categories: [{ categoryName: "ATK", revenue: 25000 }],
        subcategories: [{ categoryName: "ATK", subcategoryName: "Kertas lama", revenue: 25000 }],
        summaryCatalog: {
          categories: ["ATK", "Percetakan"],
          subcategories: [
            { categoryName: "ATK", subcategoryName: "Kertas", legacyName: "Kertas lama" },
            { categoryName: "Percetakan", subcategoryName: "Print" },
            ...Array.from({ length: 28 }, (_, index) => ({
              categoryName: "ATK",
              subcategoryName: "Katalog contoh " + (index + 1),
            })),
          ],
        },
      }));
    vi.stubGlobal("fetch", fetchReport);
    try {
      await exportFinancialReportFile("daily", "pdf", false, undefined, "single");
      expect(fetchReport).toHaveBeenNthCalledWith(2, "/api/finance/report?dateFrom=2026-11-25&dateTo=2026-11-25&summaryCatalog=1");
      const contents = savedPdf.mock.lastCall?.[0] ?? "";
      expect(contents).toContain("Omzet per Subkategori");
      expect(contents).toContain("(ATK / Kertas) Tj");
      expect(contents).toContain("(Percetakan / Print) Tj");
      expect(contents).toContain("(ATK / Katalog contoh 28) Tj");
      expect(contents).toContain("(Transfer) Tj");
      expect(contents).toContain("(Rp 0) Tj");
      expect(contents).toContain("(Halaman 1 dari 1) Tj");
      expect(contents).not.toContain("Kertas lama");
      expect(contents).not.toContain("INV-CONTOH-001");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
