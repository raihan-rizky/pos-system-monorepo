import { describe, expect, it } from "vitest";
import {
  buildShoppingRequestPrintRows,
  formatShoppingRequestDate,
} from "../shopping-request-print";
import type { ShoppingRequestDetail } from "../../types/shopping-request";

const detail: ShoppingRequestDetail = {
  id: "sr-1",
  number: "DPB-202606-001",
  status: "APPROVED",
  supplierId: null,
  supplierName: null,
  requestedByName: "Andi",
  approvedByName: "Budi",
  itemCount: 2,
  totalRequestedQty: 10,
  totalApprovedQty: 8,
  createdAt: "2026-06-19T10:00:00.000Z",
  approvedAt: "2026-06-19T11:00:00.000Z",
  note: null,
  items: [
    {
      id: "sri-1",
      productId: "p1",
      productName: "Kertas A4",
      productSku: "KRT-A4",
      unit: "rim",
      stockOnHand: 25,
      requestedQty: 5,
      approvedQty: 5,
    },
    {
      id: "sri-2",
      productId: "p2",
      productName: "Pulpen",
      productSku: "PLP-01",
      unit: "pcs",
      stockOnHand: 3,
      requestedQty: 5,
      approvedQty: 3,
    },
  ],
};

describe("buildShoppingRequestPrintRows", () => {
  it("returns rows with no, name, kebutuhan, sisa stock, jumlah acc", () => {
    const rows = buildShoppingRequestPrintRows(detail);
    expect(rows).toEqual([
      {
        no: 1,
        productName: "Kertas A4",
        requestedQty: "5 rim",
        stockOnHand: "25 rim",
        approvedQty: "5 rim",
      },
      {
        no: 2,
        productName: "Pulpen",
        requestedQty: "5 pcs",
        stockOnHand: "3 pcs",
        approvedQty: "3 pcs",
      },
    ]);
  });

  it("shows dash when approvedQty is null", () => {
    const rows = buildShoppingRequestPrintRows({
      ...detail,
      items: [
        { ...detail.items[0], approvedQty: null },
      ],
    });
    expect(rows[0].approvedQty).toBe("-");
  });
});

describe("formatShoppingRequestDate", () => {
  it("formats ISO date to id-ID long date", () => {
    expect(formatShoppingRequestDate("2026-06-19T10:00:00.000Z")).toMatch(
      /19 .* 2026/,
    );
  });

  it("returns dash for null or invalid", () => {
    expect(formatShoppingRequestDate(null)).toBe("-");
    expect(formatShoppingRequestDate("not-a-date")).toBe("-");
  });
});
