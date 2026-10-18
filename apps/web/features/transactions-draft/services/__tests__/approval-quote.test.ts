import { describe, expect, it, vi } from "vitest";
import {
  buildApprovalFingerprint,
  buildApprovalQuote,
} from "../approval-quote";

describe("buildApprovalFingerprint", () => {
  it("quotes sequential modal pricing with both percentages from the current unit", async () => {
    const client = makeQuoteClient({ customerType: "UMUM", rules: [{ id: "sequential", categoryId: "paper-category", category: { name: "Paper" }, customerType: null, customerTypes: [], unit: "rim", brandId: null, mode: "UNIT_COST_PLUS_PERCENT_DISCOUNT", value: 10, discountPercent: 5, isActive: true }] });
    const quote = await buildApprovalQuote(client as never, { storeId: "store-1", transactionId: "tx-1", actorRole: "OWNER", canViewCostPrice: true, items: [{ productId: "paper", quantity: 2 }] });
    expect(quote.items[0]).toMatchObject({ appliedUnitPrice: 41.8, subtotal: 83.6, appliedPricing: { value: 10, discountPercent: 5 } });
  });
  it("recalculates saved DPP tax when approval changes the quantity", async () => {
    const client = makeQuoteClient({ customerType: "UMUM" });
    const current = await client.transaction.findFirst();
    client.transaction.findFirst.mockResolvedValue({ ...current, tax: 11, taxRate: 12, taxMethod: "DPP_NILAI_LAIN" } as never);
    const quote = await buildApprovalQuote(client as never, {
      storeId: "store-1", transactionId: "tx-1", actorRole: "OWNER", canViewCostPrice: false,
      items: [{ productId: "paper", quantity: 2 }],
    });
    expect(quote).toMatchObject({ subtotal: 200, tax: 22, total: 222 });
  });
  it("is stable for equivalent objects regardless of key insertion order", () => {
    const first = {
      customerId: "customer-1",
      items: [{ productId: "paper", quantity: 2, price: 15_500 }],
      total: 31_000,
    };
    const reordered = {
      total: 31_000,
      items: [{ price: 15_500, quantity: 2, productId: "paper" }],
      customerId: "customer-1",
    };

    expect(buildApprovalFingerprint(first)).toBe(
      buildApprovalFingerprint(reordered),
    );
  });

  it("changes when approved cart or price data changes", () => {
    const quote = {
      customerId: "customer-1",
      items: [{ productId: "paper", quantity: 2, price: 15_500 }],
      total: 31_000,
    };

    expect(buildApprovalFingerprint({ ...quote, total: 32_000 })).not.toBe(
      buildApprovalFingerprint(quote),
    );
    expect(
      buildApprovalFingerprint({
        ...quote,
        items: [{ ...quote.items[0], quantity: 3 }],
      }),
    ).not.toBe(buildApprovalFingerprint(quote));
  });

  it("prices approval lines from current catalog data and returns price facts", async () => {
    const client = makeQuoteClient({
      customerType: "UMUM",
      product: {
        id: "paper",
        storeId: "store-1",
        name: "Kertas A4",
        price: 100,
        costPrice: 40,
        hargaAgen: 85,
        hargaDinas: 90,
        unit: "rim",
        categoryId: "paper-category",
        category: { name: "Paper" },
        brandId: null,
        brand: null,
        updatedAt: new Date("2026-10-01T00:00:00.000Z"),
      },
      discount: 5,
      rules: [
        {
          id: "special-1",
          categoryId: "paper-category",
          category: { name: "Paper" },
          customerType: "ALL",
          mode: "PERCENT_DISCOUNT",
          value: 10,
          unit: null,
          brandId: null,
          brand: null,
          isActive: true,
          updatedAt: new Date("2026-10-02T00:00:00.000Z"),
        },
      ],
    });

    const quote = await buildApprovalQuote(client as never, {
      storeId: "store-1",
      transactionId: "tx-1",
      actorRole: "OWNER",
      canViewCostPrice: true,
      items: [{ productId: "paper", quantity: 2 }],
    });

    expect(quote.items[0]).toMatchObject({
      name: "Kertas A4",
      modal: 40,
      regular: 100,
      agent: 85,
      government: 90,
      special: 90,
      appliedUnitPrice: 90,
      subtotal: 180,
    });
    expect(quote).toMatchObject({ subtotal: 180, discount: 5, tax: 0, total: 175 });
  });

  it("preserves distinct notes on repeated service lines and derives the material unit from the catalog", async () => {
    const client = makeQuoteClient({ customerType: "UMUM" });
    client.printingService.findMany.mockResolvedValue([{ id: "print", storeId: "store-1", name: "Cetak", basePrice: 100, unit: "lembar", updatedAt: new Date() }] as never);
    const current = await client.transaction.findFirst();
    client.transaction.findFirst.mockResolvedValue({ ...current, items: [
      { id: "line-a", printingServiceId: "print", serviceNote: "Depan", rawMaterialProductId: "paper", size: null, material: null },
      { id: "line-b", printingServiceId: "print", serviceNote: "Belakang", rawMaterialProductId: "paper", size: null, material: null },
    ] } as never);
    const quote = await buildApprovalQuote(client as never, { storeId: "store-1", transactionId: "tx-1", actorRole: "OWNER", canViewCostPrice: true, items: [
      { sourceItemId: "line-a", printingServiceId: "print", quantity: 1, rawMaterialProductId: "paper", rawMaterialQuantity: 0.5 },
      { sourceItemId: "line-b", printingServiceId: "print", quantity: 2, rawMaterialProductId: "paper", rawMaterialQuantity: 1 },
    ] });
    expect(quote.items.map((line) => line.input.serviceNote)).toEqual(["Depan", "Belakang"]);
    expect(quote.items.map((line) => line.rawMaterialUnit)).toEqual(["rim", "rim"]);
    await expect(buildApprovalQuote(client as never, { storeId: "store-1", transactionId: "tx-1", actorRole: "OWNER", canViewCostPrice: true, items: [
      { printingServiceId: "print", quantity: 1, rawMaterialProductId: "paper", rawMaterialQuantity: 1 },
    ] })).rejects.toThrow("APPROVAL_SERVICE_NOTE_REQUIRED");
  });

  it("hides modal price without the price-log read permission", async () => {
    const client = makeQuoteClient({ customerType: "UMUM" });

    const quote = await buildApprovalQuote(client as never, {
      storeId: "store-1",
      transactionId: "tx-1",
      actorRole: "CASHIER",
      canViewCostPrice: false,
      items: [{ productId: "paper", quantity: 1 }],
    });

    expect(quote.items[0].modal).toBeNull();
    expect(quote.items[0].regular).toBe(100);
  });

  it("only applies a submitted custom price for roles and customer types allowed by pricing rules", async () => {
    const allowedClient = makeQuoteClient({ customerType: "INDUSTRI" });
    const allowed = await buildApprovalQuote(allowedClient as never, {
      storeId: "store-1",
      transactionId: "tx-1",
      actorRole: "CASHIER",
      canViewCostPrice: false,
      items: [{ productId: "paper", quantity: 1, submittedPrice: 75 }],
    });

    const deniedClient = makeQuoteClient({ customerType: "UMUM" });
    const denied = await buildApprovalQuote(deniedClient as never, {
      storeId: "store-1",
      transactionId: "tx-1",
      actorRole: "SALES",
      canViewCostPrice: false,
      items: [{ productId: "paper", quantity: 1, submittedPrice: 1 }],
    });

    expect(allowed.items[0].appliedUnitPrice).toBe(75);
    expect(denied.items[0].appliedUnitPrice).toBe(100);
  });
});

function makeQuoteClient(input: {
  customerType: string;
  product?: Record<string, unknown>;
  discount?: number;
  rules?: Record<string, unknown>[];
}) {
  return {
    transaction: {
      findFirst: vi.fn().mockResolvedValue({
        id: "tx-1",
        storeId: "store-1",
        status: "PENDING_APPROVAL",
        customerId: "customer-1",
        customer: { type: input.customerType },
        subtotal: 100,
        discount: input.discount ?? 0,
        tax: 0,
        total: 100,
        items: [],
      }),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([
        input.product ?? {
          id: "paper",
          storeId: "store-1",
          name: "Kertas A4",
          price: 100,
          costPrice: 40,
          hargaAgen: 85,
          hargaDinas: 90,
          unit: "rim",
          categoryId: "paper-category",
          category: { name: "Paper" },
          brandId: null,
          brand: null,
          updatedAt: new Date("2026-10-01T00:00:00.000Z"),
        },
      ]),
    },
    printingService: { findMany: vi.fn().mockResolvedValue([]) },
    categoryCustomerPricingRule: {
      findMany: vi.fn().mockResolvedValue(input.rules ?? []),
    },
  };
}
