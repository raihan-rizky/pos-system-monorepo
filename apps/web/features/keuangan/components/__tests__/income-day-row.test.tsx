import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
type RowComponent = { IncomeDayRow: React.ComponentType<{ date: string; label: string; total: number; count: number; manualCount: number; canOpenHistory: boolean }> };
const load = () => vi.importActual<RowComponent>("../IncomeDayRow").catch(() => null);
describe("rincian pemasukan Keuangan", () => {
  it("membuka pelunasan nota lama berdasarkan tanggal penerimaan", async () => {
    const component = await load(); expect(component).not.toBeNull(); if (!component) return;
    const html = renderToStaticMarkup(createElement(component.IncomeDayRow, { date: "2026-11-10", label: "10 Nov", total: 60_000, count: 0, manualCount: 0, canOpenHistory: true }));
    expect(html).toContain("/history?mode=receipt&amp;date=2026-11-10");
    expect(html).toContain("0 nota lunas dibuat");
  });
  it("tidak menawarkan tautan Riwayat jika izin tidak tersedia", async () => {
    const component = await load(); expect(component).not.toBeNull(); if (!component) return;
    const html = renderToStaticMarkup(createElement(component.IncomeDayRow, { date: "2026-11-10", label: "10 Nov", total: 60_000, count: 0, manualCount: 0, canOpenHistory: false }));
    expect(html).not.toContain("href=");
    expect(html).toContain("60.000");
  });
});
