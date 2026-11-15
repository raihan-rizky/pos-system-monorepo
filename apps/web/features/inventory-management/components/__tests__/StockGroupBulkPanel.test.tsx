import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StockGroupBulkPanel } from "../StockGroupBulkPanel";
import { SingleStockUpdatePanel } from "../SingleStockUpdatePanel";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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
  it.each([["massal", StockGroupBulkPanel], ["satuan", SingleStockUpdatePanel]] as const)("offers classification filters for %s stock selection", (_name, Panel) => {
    const client = new QueryClient();
    client.setQueryData(["product-classification", "catalog"], { subcategories: [], legacyCategories: [] });
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><Panel /></QueryClientProvider>);
    expect(html).toContain("Kategori produk");
    expect(html).toContain("Belum diatur");
  });

  it("renders product-first controls with stock mode options", () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><StockGroupBulkPanel /></QueryClientProvider>);

    expect(html).toContain("Update Stok Massal");
    expect(html).toContain("Cari produk");
    expect(html).toContain("Stok Bersama");
    expect(html).toContain("Stok Produk Ini");
    expect(html).toContain("persetujuan");
    expect(html).toContain("persediaan fisik yang sama");
    expect(html).toContain("tidak mengubah stok grup");
    expect(html).not.toContain("Pilih grup stok");
  });
});
