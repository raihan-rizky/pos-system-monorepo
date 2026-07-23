import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = vi.hoisted(() => ({
  goodsPurchase: {
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  goodsPurchaseItem: {
    create: vi.fn(),
    delete: vi.fn(),
    update: vi.fn(),
  },
  product: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  productPriceLog: { createMany: vi.fn() },
  expense: { create: vi.fn() },
  inventoryLog: { create: vi.fn() },
  productStockGroup: { update: vi.fn() },
}));

const DecimalMock = vi.hoisted(
  () =>
    class DecimalMock {
      static ROUND_HALF_UP = 4;
      private readonly value: number;

      constructor(value: unknown) {
        this.value = Number(
          value && typeof value === "object" && "toString" in value
            ? value.toString()
            : value,
        );
      }

      add(other: DecimalMock) {
        return new DecimalMock(this.value + Number(other.toString()));
      }

      mul(other: DecimalMock) {
        return new DecimalMock(this.value * Number(other.toString()));
      }

      toDecimalPlaces(places: number) {
        const factor = 10 ** places;
        return new DecimalMock(Math.round(this.value * factor) / factor);
      }

      toString() {
        return String(this.value);
      }
    },
);

vi.mock("@pos/db", () => ({
  Prisma: {
    Decimal: DecimalMock,
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {},
  },
  db: {
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) =>
      callback(tx),
    ),
  },
}));

import {
  addGoodsPurchaseItemRecord,
  approveGoodsPurchaseItemRecord,
  editGoodsPurchaseItemRecord,
  GoodsPurchaseRepositoryError,
  rejectGoodsPurchaseRecord,
  removeGoodsPurchaseItemRecord,
} from "../goods-purchases-repository";

const actor = { id: "owner-1", name: "Owner", storeId: "store-1" };
const now = new Date("2026-07-24T03:00:00.000Z");

function item(
  id: string,
  productId: string,
  reviewStatus: "PENDING" | "APPROVED",
  updateMasterHpp = false,
) {
  return {
    id,
    goodsPurchaseId: "purchase-1",
    shoppingRequestItemId: `request-${id}`,
    productId,
    productNameSnapshot: productId,
    skuSnapshot: productId.toUpperCase(),
    unitSnapshot: "box",
    unitMultiplierSnapshot: 12,
    quantity: 2,
    masterCostPriceSnapshot: new DecimalMock(10_000),
    latestUnitPrice: new DecimalMock(11_000),
    lineTotal: new DecimalMock(22_000),
    updateMasterHpp,
    reviewStatus,
    approvedById: reviewStatus === "APPROVED" ? "owner-1" : null,
    approvedByName: reviewStatus === "APPROVED" ? "Owner" : null,
    approvedAt: reviewStatus === "APPROVED" ? now : null,
    createdAt: now,
    updatedAt: now,
  };
}

function purchase(
  items: ReturnType<typeof item>[],
  status: "PENDING" | "APPROVED" = "PENDING",
) {
  return {
    id: "purchase-1",
    storeId: "store-1",
    number: "PB-202607-001",
    sequence: 1,
    shoppingRequestId: "shopping-1",
    activeShoppingRequestKey: "shopping-1",
    supplierId: "supplier-1",
    supplierNameSnapshot: "CV Kertas",
    status,
    totalAmount: new DecimalMock(44_000),
    createdById: "admin-1",
    createdByName: "Admin",
    approvedById: status === "APPROVED" ? "owner-1" : null,
    approvedByName: status === "APPROVED" ? "Owner" : null,
    rejectedById: null,
    rejectedByName: null,
    rejectionReason: null,
    approvedAt: status === "APPROVED" ? now : null,
    rejectedAt: null,
    createdAt: now,
    updatedAt: now,
    shoppingRequest: { number: "DPB-202607-001" },
    items,
  };
}

describe("goods purchase item review transaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.goodsPurchaseItem.update.mockResolvedValue({});
    tx.goodsPurchaseItem.create.mockResolvedValue({});
    tx.goodsPurchaseItem.delete.mockResolvedValue({});
    tx.goodsPurchase.updateMany.mockResolvedValue({ count: 1 });
    tx.goodsPurchase.update.mockResolvedValue({});
    tx.expense.create.mockResolvedValue({});
    tx.product.update.mockResolvedValue({});
    tx.productPriceLog.createMany.mockResolvedValue({ count: 1 });
  });

  it("keeps the header pending while another item needs action", async () => {
    const first = item("item-1", "product-update", "PENDING", true);
    const second = item("item-2", "product-keep", "PENDING");
    tx.goodsPurchase.findFirst
      .mockResolvedValueOnce(purchase([first, second]))
      .mockResolvedValueOnce(
        purchase([{ ...first, reviewStatus: "APPROVED" }, second]),
      );

    const result = await approveGoodsPurchaseItemRecord(
      "purchase-1",
      "item-1",
      actor,
      now,
    );

    expect(result.finalized).toBe(false);
    expect(tx.expense.create).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
  });

  it("finalizes exactly once after the final item approval", async () => {
    const last = item("item-last", "product-update", "PENDING", true);
    const keep = item("item-keep", "product-keep", "APPROVED");
    const approvedItems = [
      { ...last, reviewStatus: "APPROVED" as const },
      keep,
    ];
    tx.goodsPurchase.findFirst
      .mockResolvedValueOnce(purchase([last, keep]))
      .mockResolvedValueOnce(purchase(approvedItems))
      .mockResolvedValueOnce(purchase(approvedItems, "APPROVED"));
    tx.product.findMany.mockResolvedValue([
      {
        id: "product-update",
        price: new DecimalMock(20_000),
        costPrice: new DecimalMock(10_000),
        hargaAgen: null,
        hargaDinas: null,
      },
    ]);

    const result = await approveGoodsPurchaseItemRecord(
      "purchase-1",
      "item-last",
      actor,
      now,
    );

    expect(result.finalized).toBe(true);
    expect(tx.goodsPurchase.updateMany).toHaveBeenCalledWith({
      where: {
        id: "purchase-1",
        storeId: "store-1",
        status: "PENDING",
      },
      data: expect.objectContaining({ status: "APPROVED" }),
    });
    expect(tx.expense.create).toHaveBeenCalledTimes(1);
  });

  it("updates only selected HPP values and writes price logs", async () => {
    const last = item("item-last", "product-update", "PENDING", true);
    const keep = item("item-keep", "product-keep", "APPROVED");
    const approvedItems = [
      { ...last, reviewStatus: "APPROVED" as const },
      keep,
    ];
    tx.goodsPurchase.findFirst
      .mockResolvedValueOnce(purchase([last, keep]))
      .mockResolvedValueOnce(purchase(approvedItems))
      .mockResolvedValueOnce(purchase(approvedItems, "APPROVED"));
    tx.product.findMany.mockResolvedValue([
      {
        id: "product-update",
        price: new DecimalMock(20_000),
        costPrice: new DecimalMock(10_000),
        hargaAgen: null,
        hargaDinas: null,
      },
    ]);

    await approveGoodsPurchaseItemRecord(
      "purchase-1",
      "item-last",
      actor,
      now,
    );

    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: "product-update" },
      data: { costPrice: expect.anything() },
    });
    expect(tx.productPriceLog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          productId: "product-update",
          field: "COST_PRICE",
          source: "SYSTEM",
        }),
      ]),
    });
    expect(tx.product.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "product-keep" } }),
    );
  });

  it("never writes stock or inventory logs", async () => {
    const last = item("item-last", "product-update", "PENDING");
    const approvedItems = [
      { ...last, reviewStatus: "APPROVED" as const },
    ];
    tx.goodsPurchase.findFirst
      .mockResolvedValueOnce(purchase([last]))
      .mockResolvedValueOnce(purchase(approvedItems))
      .mockResolvedValueOnce(purchase(approvedItems, "APPROVED"));
    tx.product.findMany.mockResolvedValue([]);

    await approveGoodsPurchaseItemRecord(
      "purchase-1",
      "item-last",
      actor,
      now,
    );

    expect(tx.product.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stock: expect.anything() }),
      }),
    );
    expect(tx.inventoryLog.create).not.toHaveBeenCalled();
    expect(tx.productStockGroup.update).not.toHaveBeenCalled();
  });

  it("rejects actions for a non-pending purchase", async () => {
    tx.goodsPurchase.findFirst.mockResolvedValue(null);

    await expect(
      approveGoodsPurchaseItemRecord(
        "purchase-1",
        "item-1",
        actor,
        now,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GoodsPurchaseRepositoryError>>({
        code: "NOT_PENDING",
      }),
    );
  });

  it("resets an approved item to pending when edited", async () => {
    const approved = item(
      "item-1",
      "product-update",
      "APPROVED",
      true,
    );
    tx.goodsPurchase.findFirst
      .mockResolvedValueOnce(purchase([approved]))
      .mockResolvedValueOnce(
        purchase([{ ...approved, reviewStatus: "PENDING" }]),
      );
    tx.product.findFirst.mockResolvedValue({
      id: "product-update",
      name: "Kertas Box",
      sku: "BOX-1",
      unit: "box",
      unitMultiplierToBase: 12,
      costPrice: new DecimalMock(10_000),
    });

    const result = await editGoodsPurchaseItemRecord(
      "purchase-1",
      "item-1",
      {
        productId: "product-update",
        quantity: 3,
        latestUnitPrice: 12_000,
        updateMasterHpp: true,
      },
      actor,
    );

    expect(result.finalized).toBe(false);
    expect(tx.goodsPurchaseItem.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: expect.objectContaining({
        reviewStatus: "PENDING",
        approvedById: null,
        approvedByName: null,
        approvedAt: null,
      }),
    });
  });

  it("requires at least one item to remain", async () => {
    tx.goodsPurchase.findFirst.mockResolvedValueOnce(
      purchase([item("item-1", "product-1", "PENDING")]),
    );

    await expect(
      removeGoodsPurchaseItemRecord(
        "purchase-1",
        "item-1",
        actor,
        now,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GoodsPurchaseRepositoryError>>({
        code: "MIN_ITEMS",
      }),
    );
  });

  it("can finalize after removing the last pending item", async () => {
    const pending = item("item-pending", "product-pending", "PENDING");
    const approved = item(
      "item-approved",
      "product-approved",
      "APPROVED",
    );
    tx.goodsPurchase.findFirst
      .mockResolvedValueOnce(purchase([pending, approved]))
      .mockResolvedValueOnce(purchase([approved]))
      .mockResolvedValueOnce(purchase([approved], "APPROVED"));
    tx.product.findMany.mockResolvedValue([]);

    const result = await removeGoodsPurchaseItemRecord(
      "purchase-1",
      "item-pending",
      actor,
      now,
    );

    expect(result.finalized).toBe(true);
    expect(tx.expense.create).toHaveBeenCalledTimes(1);
  });

  it("allows only new, non-duplicate large-unit products", async () => {
    const existing = item("item-1", "product-existing", "PENDING");
    tx.goodsPurchase.findFirst.mockResolvedValueOnce(purchase([existing]));

    await expect(
      addGoodsPurchaseItemRecord(
        "purchase-1",
        {
          productId: "product-existing",
          quantity: 1,
          latestUnitPrice: 10_000,
          updateMasterHpp: false,
        },
        actor,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GoodsPurchaseRepositoryError>>({
        code: "DUPLICATE_PRODUCT",
      }),
    );

    tx.goodsPurchase.findFirst.mockResolvedValueOnce(purchase([existing]));
    tx.product.findFirst.mockResolvedValueOnce({
      id: "product-small",
      name: "Kertas Lembar",
      sku: "SHEET-1",
      unit: "lembar",
      unitMultiplierToBase: 1,
      costPrice: new DecimalMock(1_000),
    });
    await expect(
      addGoodsPurchaseItemRecord(
        "purchase-1",
        {
          productId: "product-small",
          quantity: 1,
          latestUnitPrice: 1_000,
          updateMasterHpp: false,
        },
        actor,
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GoodsPurchaseRepositoryError>>({
        code: "SMALL_UNIT",
      }),
    );
  });

  it("rejects without creating expense or HPP updates and frees the request", async () => {
    tx.goodsPurchase.updateMany.mockResolvedValueOnce({ count: 1 });
    tx.goodsPurchase.findFirst.mockResolvedValueOnce({
      ...purchase([item("item-1", "product-1", "PENDING")]),
      status: "REJECTED",
      activeShoppingRequestKey: null,
      rejectedById: "owner-1",
      rejectedByName: "Owner",
      rejectionReason: "Harga terlalu tinggi",
      rejectedAt: now,
    });

    await rejectGoodsPurchaseRecord(
      "purchase-1",
      "Harga terlalu tinggi",
      actor,
      now,
    );

    expect(tx.goodsPurchase.updateMany).toHaveBeenCalledWith({
      where: {
        id: "purchase-1",
        storeId: "store-1",
        status: "PENDING",
      },
      data: expect.objectContaining({
        status: "REJECTED",
        activeShoppingRequestKey: null,
        rejectionReason: "Harga terlalu tinggi",
      }),
    });
    expect(tx.expense.create).not.toHaveBeenCalled();
    expect(tx.product.update).not.toHaveBeenCalled();
  });
});
