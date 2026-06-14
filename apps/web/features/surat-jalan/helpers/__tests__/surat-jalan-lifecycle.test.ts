import { describe, expect, it } from "vitest";
import { planSuratJalanCreation } from "../surat-jalan-lifecycle";
import type { SuratJalanTransactionItem } from "../../types/surat-jalan";

const invoiceItems: SuratJalanTransactionItem[] = [
  {
    id: "item-paper",
    productId: "product-paper",
    printingServiceId: null,
    productName: "Kertas A4",
    quantity: 10,
    unit: "rim",
    currentStock: 2,
  },
  {
    id: "item-pen",
    productId: "product-pen",
    printingServiceId: null,
    productName: "Pulpen",
    quantity: 5,
    unit: "pcs",
    currentStock: 8,
  },
];

describe("planSuratJalanCreation", () => {
  it("confirms the first surat jalan, reverses original invoice stock, and plans fresh stock-outs", () => {
    const plan = planSuratJalanCreation({
      transaction: {
        id: "txn-1",
        status: "COMPLETED",
        stockManagedBySuratJalan: false,
        customerName: "PT Teladan",
        items: invoiceItems,
      },
      existingSuratJalan: [],
      quantities: {
        "item-paper": 4,
        "item-pen": 2,
      },
      keterangan: {
        "item-paper": "Lantai 2",
      },
      recipientName: "Gudang PT Teladan",
      actor: { id: "cashier-1", name: "Cashier", role: "CASHIER" },
      number: "TLD-14062026-001",
      now: new Date("2026-06-14T04:00:00.000Z"),
    });

    expect(plan.status).toBe("CONFIRMED");
    expect(plan.sequence).toBe(1);
    expect(plan.shouldMarkTransactionManaged).toBe(true);
    expect(plan.invoiceReversalMovements).toEqual([
      {
        productId: "product-paper",
        quantity: 10,
        type: "IN",
        reason: "SALE_RETURN",
        note: "Reversal invoice txn-1 untuk Surat Jalan TLD-14062026-001",
      },
      {
        productId: "product-pen",
        quantity: 5,
        type: "IN",
        reason: "SALE_RETURN",
        note: "Reversal invoice txn-1 untuk Surat Jalan TLD-14062026-001",
      },
    ]);
    expect(plan.deliveryStockMovements).toEqual([
      {
        productId: "product-paper",
        quantity: 4,
        type: "OUT",
        reason: "SALE",
        note: "Surat Jalan TLD-14062026-001 untuk invoice txn-1",
      },
      {
        productId: "product-pen",
        quantity: 2,
        type: "OUT",
        reason: "SALE",
        note: "Surat Jalan TLD-14062026-001 untuk invoice txn-1",
      },
    ]);
    expect(plan.items).toEqual([
      expect.objectContaining({
        transactionItemId: "item-paper",
        quantity: 4,
        keterangan: "Lantai 2",
        stockBefore: 12,
        stockAfter: 8,
      }),
      expect.objectContaining({
        transactionItemId: "item-pen",
        quantity: 2,
        keterangan: "",
        stockBefore: 13,
        stockAfter: 11,
      }),
    ]);
  });

  it("creates later surat jalan as pending without stock movements", () => {
    const plan = planSuratJalanCreation({
      transaction: {
        id: "txn-1",
        status: "COMPLETED",
        stockManagedBySuratJalan: true,
        customerName: "PT Teladan",
        items: invoiceItems,
      },
      existingSuratJalan: [
        {
          id: "sj-1",
          number: "TLD-14062026-001",
          status: "CONFIRMED",
          recipientName: "PT Teladan",
          sequence: 1,
          requestedByName: "Cashier",
          approvedByName: "Cashier",
          createdAt: "2026-06-14T04:00:00.000Z",
          confirmedAt: "2026-06-14T04:00:00.000Z",
          items: [
            {
              id: "sj-item-1",
              transactionItemId: "item-paper",
              productId: "product-paper",
              productName: "Kertas A4",
              quantity: 4,
              unit: "rim",
              keterangan: "",
              stockBefore: 12,
              stockAfter: 8,
            },
          ],
        },
      ],
      quantities: {
        "item-paper": 3,
      },
      keterangan: {},
      recipientName: "Gudang PT Teladan",
      actor: { id: "sales-1", name: "Sales", role: "SALES" },
      number: "TLD-14062026-002",
      now: new Date("2026-06-14T05:00:00.000Z"),
    });

    expect(plan.status).toBe("PENDING");
    expect(plan.sequence).toBe(2);
    expect(plan.shouldMarkTransactionManaged).toBe(false);
    expect(plan.invoiceReversalMovements).toEqual([]);
    expect(plan.deliveryStockMovements).toEqual([]);
    expect(plan.items).toEqual([
      expect.objectContaining({
        transactionItemId: "item-paper",
        quantity: 3,
        stockBefore: null,
        stockAfter: null,
      }),
    ]);
  });

  it("blocks quantities above remaining invoice quantity", () => {
    expect(() =>
      planSuratJalanCreation({
        transaction: {
          id: "txn-1",
          status: "COMPLETED",
          stockManagedBySuratJalan: true,
          customerName: "PT Teladan",
          items: invoiceItems,
        },
        existingSuratJalan: [],
        quantities: {
          "item-paper": 11,
        },
        keterangan: {},
        recipientName: "Gudang PT Teladan",
        actor: { id: "cashier-1", name: "Cashier", role: "CASHIER" },
        number: "TLD-14062026-001",
        now: new Date("2026-06-14T04:00:00.000Z"),
      }),
    ).toThrow("QUANTITY_EXCEEDS_REMAINING");
  });
});
