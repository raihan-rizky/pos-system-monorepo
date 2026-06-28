import { describe, expect, it } from "vitest";
import {
  buildSuratJalanNumber,
  calculateSuratJalanProgress,
  getSuratJalanEligibility,
  getSuratJalanRemainingItems,
  previewSuratJalanStockImpact,
} from "../surat-jalan-core";
import type {
  SuratJalanTransactionItem,
  SuratJalanRecord,
} from "../../types/surat-jalan";

const productItems: SuratJalanTransactionItem[] = [
  {
    id: "item-paper",
    productId: "product-paper",
    printingServiceId: null,
    productName: "Kertas A4",
    quantity: 10,
    unit: "rim",
    currentStock: 20,
  },
  {
    id: "item-pen",
    productId: "product-pen",
    printingServiceId: null,
    productName: "Pulpen",
    quantity: 5,
    unit: "pcs",
    currentStock: 3,
  },
];

const confirmedSuratJalan: SuratJalanRecord = {
  id: "sj-1",
  number: "TLD-14062026-001",
  status: "CONFIRMED",
  recipientName: "PT Teladan",
  sequence: 1,
  requestedByName: "Cashier",
  approvedByName: "Cashier",
  markingStatus: "UNMARKED",
  markedByName: null,
  markedAt: null,
  markingNote: null,
  createdAt: "2026-06-14T04:00:00.000Z",
  confirmedAt: "2026-06-14T04:05:00.000Z",
  items: [
    {
      id: "sj-item-paper",
      transactionItemId: "item-paper",
      productId: "product-paper",
      productName: "Kertas A4",
      quantity: 4,
      unit: "rim",
      keterangan: "",
      stockBefore: 20,
      stockAfter: 16,
    },
  ],
};

describe("getSuratJalanEligibility", () => {
  it("allows completed product-only invoices", () => {
    expect(
      getSuratJalanEligibility({
        status: "COMPLETED",
        items: productItems,
      }),
    ).toEqual({ eligible: true, reason: null });
  });

  it("rejects invoices containing printing-service lines", () => {
    expect(
      getSuratJalanEligibility({
        status: "COMPLETED",
        items: [
          ...productItems,
          {
            id: "item-service",
            productId: null,
            printingServiceId: "service-print",
            productName: "Print Warna",
            quantity: 1,
            unit: "pcs",
            currentStock: null,
          },
        ],
      }),
    ).toEqual({
      eligible: false,
      reason: "PRINTING_SERVICE_NOT_ELIGIBLE",
    });
  });

  it("rejects non-final invoice statuses", () => {
    expect(
      getSuratJalanEligibility({
        status: "DRAFT",
        items: productItems,
      }),
    ).toEqual({ eligible: false, reason: "STATUS_NOT_ELIGIBLE" });
  });
});

describe("getSuratJalanRemainingItems", () => {
  it("subtracts only confirmed surat jalan quantities from invoice quantities", () => {
    const remaining = getSuratJalanRemainingItems({
      invoiceItems: productItems,
      suratJalan: [
        confirmedSuratJalan,
        {
          ...confirmedSuratJalan,
          id: "sj-pending",
          number: "TLD-14062026-002",
          status: "PENDING",
          items: [
            {
              ...confirmedSuratJalan.items[0],
              id: "pending-paper",
              quantity: 3,
            },
          ],
        },
      ],
    });

    expect(remaining).toEqual([
      expect.objectContaining({
        transactionItemId: "item-paper",
        invoiceQuantity: 10,
        deliveredQuantity: 4,
        pendingQuantity: 3,
        remainingQuantity: 6,
      }),
      expect.objectContaining({
        transactionItemId: "item-pen",
        invoiceQuantity: 5,
        deliveredQuantity: 0,
        pendingQuantity: 0,
        remainingQuantity: 5,
      }),
    ]);
  });
});

describe("calculateSuratJalanProgress", () => {
  it("summarizes delivered, pending, and remaining quantities", () => {
    expect(
      calculateSuratJalanProgress({
        invoiceItems: productItems,
        suratJalan: [
          confirmedSuratJalan,
          {
            ...confirmedSuratJalan,
            id: "sj-pending",
            status: "PENDING",
            items: [
              {
                ...confirmedSuratJalan.items[0],
                id: "pending-paper",
                quantity: 2,
              },
            ],
          },
        ],
      }),
    ).toEqual({
      totalQuantity: 15,
      deliveredQuantity: 4,
      pendingQuantity: 2,
      remainingQuantity: 11,
      status: "PENDING_APPROVAL",
    });
  });
});

describe("previewSuratJalanStockImpact", () => {
  it("shows current stock, requested quantity, after stock, and invalid negative stock rows", () => {
    expect(
      previewSuratJalanStockImpact({
        items: productItems,
        quantities: {
          "item-paper": 7,
          "item-pen": 4,
        },
      }),
    ).toEqual([
      {
        transactionItemId: "item-paper",
        productId: "product-paper",
        productName: "Kertas A4",
        currentStock: 20,
        requestedQuantity: 7,
        afterStock: 13,
        isInsufficientStock: false,
      },
      {
        transactionItemId: "item-pen",
        productId: "product-pen",
        productName: "Pulpen",
        currentStock: 3,
        requestedQuantity: 4,
        afterStock: -1,
        isInsufficientStock: true,
      },
    ]);
  });
});

describe("buildSuratJalanNumber", () => {
  it("uses TLD-DDMMYYYY-001 format", () => {
    expect(buildSuratJalanNumber(new Date("2026-06-14T10:00:00.000Z"), 1)).toBe(
      "TLD-14062026-001",
    );
    expect(buildSuratJalanNumber(new Date("2026-06-14T10:00:00.000Z"), 12)).toBe(
      "TLD-14062026-012",
    );
  });
});
