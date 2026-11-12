import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
type RowComponent = { IncomeDayRow: React.ComponentType<{ date: string; label: string; total: number; count: number; manualCount: number; canOpenHistory: boolean; onOpen: (date: string) => void }> };
const load = () => vi.importActual<RowComponent>("../IncomeDayRow").catch(() => null);
describe("rincian pemasukan Keuangan", () => {
  it("menawarkan tombol untuk membuka rincian pada tanggal penerimaan tanpa berpindah halaman", async () => {
    const component = await load(); expect(component).not.toBeNull(); if (!component) return;
    const html = renderToStaticMarkup(createElement(component.IncomeDayRow, { date: "2026-11-08", label: "08 Nov 2026", total: 60_000, count: 0, manualCount: 0, canOpenHistory: true, onOpen: vi.fn() }));
    expect(html).toContain("<button");
    expect(html).not.toContain("href=");
    expect(html).toContain("08 Nov 2026");
    expect(html).toContain("0 nota lunas dibuat");
  });
  it("tidak menawarkan tautan Riwayat jika izin tidak tersedia", async () => {
    const component = await load(); expect(component).not.toBeNull(); if (!component) return;
    const html = renderToStaticMarkup(createElement(component.IncomeDayRow, { date: "2026-11-10", label: "10 Nov", total: 60_000, count: 0, manualCount: 0, canOpenHistory: false, onOpen: vi.fn() }));
    expect(html).not.toContain("href=");
    expect(html).not.toContain("<button");
    expect(html).toContain("60.000");
  });
});
