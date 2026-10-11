import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ShoppingRequestDetail } from "../../types/shopping-request";
import { ShoppingRequestPrintPages } from "../ShoppingRequestPrintModal";

vi.mock("@/hooks/useSettings", () => ({ useStoreSettings: () => ({ data: null }) }));
vi.mock("../../api/shopping-requests-api", () => ({ getShoppingRequest: vi.fn() }));

function makeDetail(): ShoppingRequestDetail {
  return {
    id: "sr-1",
    number: "DPB-202610-001",
    name: "DPB-202610-001",
    status: "REQUESTED",
    supplierId: null,
    supplierName: null,
    requestedByName: "Raihan",
    approvedByName: null,
    itemCount: 120,
    decidedItemCount: 0,
    pendingItemCount: 120,
    totalRequestedQty: 120,
    totalApprovedQty: null,
    createdAt: "2026-10-05T03:00:00.000Z",
    approvedAt: null,
    note: null,
    stockAppliedAt: null,
    items: Array.from({ length: 120 }, (_, index) => ({
      id: `item-${index + 1}`,
      productId: `product-${index + 1}`,
      productName: `Produk ${index + 1}`,
      productSku: `SKU-${index + 1}`,
      unit: "pcs",
      stockOnHand: 10,
      requestedQty: 1,
      approvedQty: null,
      stockMode: "PRODUCT_ONLY",
      decisionStatus: "PENDING",
      decidedById: null,
      decidedByName: null,
      decidedAt: null,
      itemStockAppliedAt: null,
      costPriceSnapshot: null,
      imageUrl: null,
      product: { unitMultiplierToBase: 1, stockGroup: null },
    })),
  };
}

describe("shopping request print layout", () => {
  it("includes acknowledgment signatures after the table on the first receipt", () => {
    const html = renderToStaticMarkup(
      <ShoppingRequestPrintPages
        detail={makeDetail()}
        storeName="Toko Teladan"
        storeAddress="Cilegon"
        storePhone="0254"
      />,
    );
    const summary = html.split('data-print-page="summary"')[1].split('data-print-page="full"')[0];

    expect(summary).toContain("Mengetahui:");
    expect(summary).toContain("Wakil Direktur");
    expect(summary).toContain("Kepala Gudang");
    expect(summary.match(/\(_______________\)/g)).toHaveLength(2);
    expect(summary.indexOf("Mengetahui:")).toBeGreaterThan(summary.indexOf("</table>"));
    expect(html.match(/Mengetahui:/g)).toHaveLength(2);
  });

  it("keeps the number column compact in both preview and print tables", () => {
    const stylesheet = readFileSync(
      join(process.cwd(), "features/suppliers/shopping-requests/components/shopping-request-print.css"),
      "utf8",
    );

    expect(stylesheet).toMatch(/\.shopping-request-print-table th:first-child\s*\{[^}]*width:\s*10mm/s);
  });

  it("renders both A4 receipts and keeps the last item in each", () => {
    const html = renderToStaticMarkup(
      <ShoppingRequestPrintPages
        detail={makeDetail()}
        storeName="Toko Teladan"
        storeAddress="Cilegon"
        storePhone="0254"
      />,
    );

    expect(html.match(/data-print-page="summary"/g)).toHaveLength(1);
    expect(html.match(/data-print-page="full"/g)).toHaveLength(1);
    expect(html).toContain("KEBUTUHAN BELANJA");
    expect(html).toContain("SISA STOCK BARANG DI GUDANG");
    expect(html).toContain("JUMLAH YANG DI ACC");
    expect(html.match(/<th\b/g)).toHaveLength(8);
    expect(html.match(/Produk 120/g)).toHaveLength(2);
  });

  it("shows one receipt at a time in the preview while keeping both for printing", () => {
    const props = {
      detail: makeDetail(),
      storeName: "Toko Teladan",
      storeAddress: "Cilegon",
      storePhone: "0254",
    };
    const firstPage = renderToStaticMarkup(<ShoppingRequestPrintPages {...props} activePage={0} />);
    const secondPage = renderToStaticMarkup(<ShoppingRequestPrintPages {...props} activePage={1} />);

    expect(firstPage.match(/data-print-page=/g)).toHaveLength(2);
    expect(firstPage).toMatch(/data-print-page="summary"[^>]*shopping-request-print-page--active/);
    expect(firstPage).not.toMatch(/data-print-page="full"[^>]*shopping-request-print-page--active/);
    expect(secondPage).toMatch(/data-print-page="full"[^>]*shopping-request-print-page--active/);
    expect(secondPage).not.toMatch(/data-print-page="summary"[^>]*shopping-request-print-page--active/);
  });

  it("uses paged print styles without clipping the receipt container", () => {
    const stylesheet = readFileSync(
      join(process.cwd(), "features/suppliers/shopping-requests/components/shopping-request-print.css"),
      "utf8",
    );

    expect(stylesheet).toContain("size: A4");
    expect(stylesheet).toContain("break-before: page");
    expect(stylesheet).toContain("table-header-group");
    expect(stylesheet).toContain("break-inside: avoid");
    expect(stylesheet).toContain("overflow: visible");
    expect(stylesheet).toMatch(/@media screen\s*\{[^}]*shopping-request-print-page:not\(\.shopping-request-print-page--active\)\s*\{\s*display:\s*none/s);
    expect(stylesheet).toContain("font-family: Arial, sans-serif");
    expect(stylesheet).not.toMatch(/#shopping-request-print\s*\{[^}]*overflow:\s*hidden/s);
  });
});
