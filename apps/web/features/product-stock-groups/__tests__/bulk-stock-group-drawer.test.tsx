import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BulkStockGroupDrawer } from "../components/BulkStockGroupDrawer";

describe("BulkStockGroupDrawer", () => {
  it("starts with the destination decision and keeps later fields out of the first stage", () => {
    const html = renderToStaticMarkup(
      <BulkStockGroupDrawer
        open
        products={[
          { id: "pcs", name: "Kertas", sku: "P", unit: "pcs", stock: 24 },
          { id: "dus", name: "Kertas dus", sku: "D", unit: "dus", stock: 8 },
        ]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(html).toContain("Tujuan grup");
    expect(html).toContain("Buat grup baru");
    expect(html).toContain("Gabungkan ke grup yang ada");
    expect(html).toContain('aria-label="Tahapan grup stok"');
    expect(html).not.toContain("Pair Konversi");
    expect(html).not.toContain('aria-label="Konversi Kertas dus"');
  });
});
