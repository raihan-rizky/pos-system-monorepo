import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@/features/suppliers/goods-purchases/repositories/goods-purchases-repository",
  () => ({
    countGoodsPurchases: vi.fn(),
    createGoodsPurchaseRecord: vi.fn(),
    addGoodsPurchaseItemRecord: vi.fn(),
    approveGoodsPurchaseItemRecord: vi.fn(),
    editGoodsPurchaseItemRecord: vi.fn(),
    findGoodsPurchaseById: vi.fn(),
    listEligibleShoppingRequests: vi.fn(),
    listGoodsPurchases: vi.fn(),
    listLargeUnitProducts: vi.fn(),
    rejectGoodsPurchaseRecord: vi.fn(),
    removeGoodsPurchaseItemRecord: vi.fn(),
  }),
);

import {
  createGoodsPurchase,
  GoodsPurchaseValidationError,
  rejectGoodsPurchase,
} from "../goods-purchases-service";

const actor = { id: "owner-1", name: "Owner", storeId: "store-1" };

function itemInput(
  overrides: Partial<{
    productId: string;
    shoppingRequestItemId: string;
    quantity: number;
    latestUnitPrice: number;
    updateMasterHpp: boolean;
  }> = {},
) {
  return {
    productId: "product-1",
    shoppingRequestItemId: "item-1",
    quantity: 2,
    latestUnitPrice: 10_000,
    updateMasterHpp: false,
    ...overrides,
  };
}

describe("goods purchases service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing and duplicate create items", async () => {
    await expect(
      createGoodsPurchase(
        {
          shoppingRequestId: "request-1",
          items: [],
        },
        actor,
      ),
    ).rejects.toThrow("Minimal satu produk wajib diisi");

    await expect(
      createGoodsPurchase(
        {
          shoppingRequestId: "request-1",
          items: [
            itemInput({ productId: "product-1" }),
            itemInput({
              productId: "product-1",
              shoppingRequestItemId: "item-2",
            }),
          ],
        },
        actor,
      ),
    ).rejects.toThrow("Produk yang sama tidak boleh dipilih dua kali");
  });

  it("rejects invalid quantity and price", async () => {
    await expect(
      createGoodsPurchase(
        {
          shoppingRequestId: "request-1",
          items: [itemInput({ quantity: 0 })],
        },
        actor,
      ),
    ).rejects.toThrow("Jumlah produk harus lebih dari 0");
    await expect(
      createGoodsPurchase(
        {
          shoppingRequestId: "request-1",
          items: [itemInput({ latestUnitPrice: -1 })],
        },
        actor,
      ),
    ).rejects.toThrow("Harga produk tidak boleh negatif");
  });

  it("exports a typed validation error", () => {
    const error = new GoodsPurchaseValidationError("Tidak valid", true);
    expect(error.name).toBe("GoodsPurchaseValidationError");
    expect(error.isConflict).toBe(true);
  });

  it("requires a rejection reason", async () => {
    await expect(
      rejectGoodsPurchase("purchase-1", "   ", actor),
    ).rejects.toThrow("Alasan penolakan wajib diisi");
  });
});
