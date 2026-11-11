import { describe, expect, it, vi } from "vitest";

type Args = { date: string; mode: "receipt" | "outstanding-dp"; category?: string; subcategory?: string; method?: string; previewSales?: boolean };
type Helpers = { buildReceiptHistoryUrl: (args: Args & { period?: "daily" | "weekly" | "monthly" }) => string; parseReceiptHistoryParams: (params: Record<string, string | string[] | undefined>) => { status: string; date?: string; mode?: string; period?: string }; receiptHistoryRange: (date: string, period: "daily" | "weekly" | "monthly") => { dateFrom: string; dateTo: string } };
const loadHelpers = () => vi.importActual<Helpers>("../receipt-history").catch(() => null);

describe("tautan Riwayat penerimaan", () => {
  it("membawa tanggal lampau dan filter yang terkode ke halaman Riwayat", async () => {
    const helpers = await loadHelpers(); expect(helpers).not.toBeNull(); if (!helpers) return;
    const url = new URL(helpers.buildReceiptHistoryUrl({ date: "2026-11-10", mode: "receipt", category: "ATK", subcategory: "Alat Tulis", method: "TRANSFER", previewSales: true }), "http://localhost");
    expect(url.pathname).toBe("/history");
    expect(Object.fromEntries(url.searchParams)).toEqual({ mode: "receipt", date: "2026-11-10", category: "ATK", subcategory: "Alat Tulis", method: "TRANSFER", view: "sales" });
  });

  it("mempertahankan Riwayat biasa dan menolak konteks yang tidak sah", async () => {
    const helpers = await loadHelpers(); expect(helpers).not.toBeNull(); if (!helpers) return;
    expect(helpers.parseReceiptHistoryParams({}).status).toBe("none");
    expect(helpers.parseReceiptHistoryParams({ mode: "receipt", date: "2026-02-30" }).status).toBe("invalid");
    expect(helpers.parseReceiptHistoryParams({ mode: "receipt", date: ["2026-11-10", "2026-11-11"] }).status).toBe("invalid");
    expect(helpers.parseReceiptHistoryParams({ mode: "outstanding-dp", date: "2026-11-10" })).toMatchObject({ status: "valid", mode: "outstanding-dp", date: "2026-11-10" });
  });

  it("membuka Harian pada tanggal pilihan dan menyimpan rentang cepat di URL", async () => {
    const helpers = await loadHelpers(); expect(helpers).not.toBeNull(); if (!helpers) return;
    expect(helpers.receiptHistoryRange("2026-11-10", "daily")).toEqual({ dateFrom: "2026-11-10", dateTo: "2026-11-10" });
    expect(helpers.receiptHistoryRange("2026-11-10", "weekly")).toEqual({ dateFrom: "2026-11-04", dateTo: "2026-11-10" });
    expect(helpers.receiptHistoryRange("2026-11-10", "monthly")).toEqual({ dateFrom: "2026-11-01", dateTo: "2026-11-10" });
    const url = helpers.buildReceiptHistoryUrl({ date: "2026-11-10", mode: "receipt", period: "weekly" });
    expect(url).toContain("period=weekly");
    expect(helpers.parseReceiptHistoryParams({ date: "2026-11-10", mode: "receipt", period: "weekly" })).toMatchObject({ status: "valid", period: "weekly" });
    expect(helpers.parseReceiptHistoryParams({ date: "2026-11-10", mode: "receipt", period: "yearly" }).status).toBe("invalid");
  });
  it("menerima subkategori sepanjang batas nama kategori produk", async () => {
    const helpers = await loadHelpers(); expect(helpers).not.toBeNull(); if (!helpers) return;
    expect(helpers.parseReceiptHistoryParams({ mode: "receipt", date: "2026-11-10", category: "ATK", subcategory: "A".repeat(150) }).status).toBe("valid");
    expect(helpers.parseReceiptHistoryParams({ mode: "receipt", date: "2026-11-10", category: "ATK", subcategory: "A".repeat(151) }).status).toBe("invalid");
  });
});
