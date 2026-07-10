import { describe, expect, it } from "vitest";
import {
  buildCustomerRecapExport,
  CUSTOMER_RECAP_EXPORT_TYPES,
} from "../export-core";

describe("buildCustomerRecapExport", () => {
  it("groups active customers by type, sorts by spend, and builds favorites and top products", () => {
    const data = buildCustomerRecapExport({
      dateFrom: "2026-05-01",
      dateTo: "2026-05-31",
      customers: [
        {
          id: "umum-low",
          name: "Umum Low",
          type: "UMUM",
          totalDebt: 10_000,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          lastVisitAt: new Date("2026-05-03T00:00:00.000Z"),
        },
        {
          id: "umum-high",
          name: "Umum High",
          type: "UMUM",
          totalDebt: 20_000,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          lastVisitAt: new Date("2026-05-04T00:00:00.000Z"),
        },
        {
          id: "agen-one",
          name: "Agen One",
          type: "AGEN",
          totalDebt: 0,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          lastVisitAt: new Date("2026-05-02T00:00:00.000Z"),
        },
        {
          id: "industri-empty",
          name: "Industri Empty",
          type: "INDUSTRI",
          totalDebt: 0,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          lastVisitAt: null,
        },
        {
          id: "government-empty",
          name: "Government Empty",
          type: "PEMERINTAH",
          totalDebt: 0,
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          lastVisitAt: null,
        },
      ],
      transactions: [
        {
          id: "tx-low",
          customerId: "umum-low",
          createdAt: new Date("2026-05-02T00:00:00.000Z"),
          status: "COMPLETED",
          total: 100_000,
          items: [
            { productId: "p-a", productName: "Produk A", quantity: 1, subtotal: 60_000 },
            { productId: "p-b", productName: "Produk B", quantity: 2, subtotal: 40_000 },
          ],
        },
        {
          id: "tx-high",
          customerId: "umum-high",
          createdAt: new Date("2026-05-03T00:00:00.000Z"),
          status: "COMPLETED",
          total: 250_000,
          items: [
            { productId: "p-a", productName: "Produk A", quantity: 3, subtotal: 150_000 },
            { productId: "p-c", productName: "Produk C", quantity: 1, subtotal: 100_000 },
          ],
        },
        {
          id: "tx-agen",
          customerId: "agen-one",
          createdAt: new Date("2026-05-04T00:00:00.000Z"),
          status: "DP",
          total: 75_000,
          items: [
            { productId: "p-a", productName: "Produk A", quantity: 1, subtotal: 75_000 },
          ],
        },
        {
          id: "tx-ignored",
          customerId: "umum-high",
          createdAt: new Date("2026-05-04T00:00:00.000Z"),
          status: "VOIDED",
          total: 999_999,
          items: [
            { productId: "p-z", productName: "Produk Z", quantity: 99, subtotal: 999_999 },
          ],
        },
      ],
      debtPaymentLogs: [],
    });

    expect(CUSTOMER_RECAP_EXPORT_TYPES).toEqual([
      "AGEN",
      "UMUM",
      "PEMERINTAH",
      "INDUSTRI",
    ]);
    expect(data.groups.map((group) => group.type)).toEqual([
      "AGEN",
      "UMUM",
      "PEMERINTAH",
      "INDUSTRI",
    ]);
    expect(data.groups[0]?.customers).toMatchObject([
      {
        name: "Agen One",
        orderCount: 1,
        totalSpent: 75_000,
        averageOrderValue: 75_000,
        favoriteProducts: "Produk A",
      },
    ]);
    expect(data.groups[1]?.customers).toMatchObject([
      {
        name: "Umum High",
        totalSpent: 250_000,
        favoriteProducts: "Produk A, Produk C",
      },
      {
        name: "Umum Low",
        totalSpent: 100_000,
        favoriteProducts: "Produk B, Produk A",
      },
    ]);
    expect(data.groups[1]?.topProducts).toEqual([
      { productId: "p-a", productName: "Produk A", quantity: 4, subtotal: 210_000 },
      { productId: "p-b", productName: "Produk B", quantity: 2, subtotal: 40_000 },
      { productId: "p-c", productName: "Produk C", quantity: 1, subtotal: 100_000 },
    ]);
    expect(data.groups[2]?.customers).toEqual([]);
    expect(data.groups[3]?.customers).toEqual([]);
    expect(data.summary).toMatchObject({
      totalDebtOutstanding: 30_000,
      avgOrderValue: 425_000 / 3,
    });
  });
});
