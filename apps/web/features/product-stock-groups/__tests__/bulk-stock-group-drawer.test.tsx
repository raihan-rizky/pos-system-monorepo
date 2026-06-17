import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { BulkStockGroupDrawer } from "../components/BulkStockGroupDrawer";

describe("BulkStockGroupDrawer", () => {
  it("renders target mode, source stock, unit filter, and pair conversion controls", () => {
    const html = renderToStaticMarkup(
      <BulkStockGroupDrawer
        open
        products={[
          {
            id: "rim",
            name: "Kertas A4 Rim",
            sku: "A4-RIM",
            unit: "rim",
            stock: 2,
            unitMultiplierToBase: 500,
          },
          {
            id: "pack",
            name: "Kertas A4 Pack",
            sku: "A4-PACK",
            unit: "pack",
            stock: 10,
            unitMultiplierToBase: 100,
          },
        ]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(html).toContain("Grup Baru");
    expect(html).toContain("Grup Existing");
    expect(html).toContain("Sumber Stok");
    expect(html).toContain("Filter Unit Existing");
    expect(html).toContain("Pair Konversi");
    expect(html).toContain("Kertas A4 Rim");
    expect(html).toContain("Kertas A4 Pack");
  });
});
