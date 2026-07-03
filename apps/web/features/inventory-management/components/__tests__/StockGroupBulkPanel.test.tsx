import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StockGroupBulkPanel } from "../StockGroupBulkPanel";

vi.mock("@pos/ui", () => ({
  Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));

vi.mock("@/hooks/useProducts", () => ({
  useProducts: () => ({
    data: [
      {
        id: "pack",
        name: "Kertas A4",
        sku: "A4-PACK",
        unit: "pack",
        stock: 10,
        minStock: 1,
        price: 1000,
        costPrice: null,
        hargaDinas: null,
        hargaAgen: null,
        imageUrl: null,
        isActive: true,
        size: null,
        material: null,
        stockGroupId: "group-1",
        unitMultiplierToBase: 10,
        conversionNeedsReview: false,
        stockGroup: { id: "group-1", displayName: "Kertas A4", baseUnit: "lembar", baseStock: 100 },
        category: { id: "cat-1", name: "Kertas", icon: null, color: null },
        variants: [],
      },
    ],
    isFetching: false,
  }),
}));

describe("StockGroupBulkPanel", () => {
  it("renders product-first controls with stock mode options", () => {
    const html = renderToStaticMarkup(<StockGroupBulkPanel />);

    expect(html).toContain("Update Stok Massal");
    expect(html).toContain("Cari produk");
    expect(html).toContain("Stok Bersama");
    expect(html).toContain("Stok Produk Ini");
    expect(html).not.toContain("Pilih grup stok");
  });
});
