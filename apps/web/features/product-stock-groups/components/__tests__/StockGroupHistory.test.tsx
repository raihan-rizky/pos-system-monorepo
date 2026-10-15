import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StockGroupHistoryList } from "../StockGroupHistory";
describe("actual history records", () => {
  it("shows actual stock snapshots, actor and Indonesian labels", () => {
    const html = renderToStaticMarkup(
      <StockGroupHistoryList
        records={[
          {
            id: "a",
            type: "CONVERSION_RATE_CHANGED",
            createdAt: "2026-10-14T00:00:00Z",
            person: "Rina",
            note: "Periksa dus",
            before: { baseStock: 100, baseUnit: "pcs" },
            after: { baseStock: 120, baseUnit: "pcs" },
          },
        ]}
      />,
    );
    expect(html).toContain("Konversi satuan diubah");
    expect(html).toContain("Stok sebelum");
    expect(html).toContain("100 pcs");
    expect(html).toContain("120 pcs");
    expect(html).toContain("Rina");
  });
  it("does not invent stock or an actor for incomplete records", () => {
    const html = renderToStaticMarkup(
      <StockGroupHistoryList
        records={[
          {
            id: "a",
            type: "VARIANT_ADDED",
            createdAt: "2026-10-14T00:00:00Z",
            before: { stock: 50 },
            after: { unit: "dus" },
          },
        ]}
      />,
    );
    expect(html).not.toContain("Stok sebelum");
    expect(html).not.toContain("Stok sesudah");
    expect(html).not.toContain("Sistem");
    expect(html).not.toContain("50");
    expect(
      renderToStaticMarkup(<StockGroupHistoryList records={[]} />),
    ).toContain("Belum ada riwayat");
  });
});
