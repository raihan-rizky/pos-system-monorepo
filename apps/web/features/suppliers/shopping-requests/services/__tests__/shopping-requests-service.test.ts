import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@pos/db", () => ({
  db: {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        shoppingRequest: { count: vi.fn().mockResolvedValue(0) },
      };
      return fn(tx);
    }),
    product: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock(
  "@/features/suppliers/shopping-requests/repositories/shopping-requests-repository",
  () => ({
    countShoppingRequests: vi.fn(),
    listShoppingRequests: vi.fn(),
    findShoppingRequestById: vi.fn(),
    createShoppingRequestWithItems: vi.fn(),
    updateShoppingRequestStatus: vi.fn(),
    updateShoppingRequestItems: vi.fn(),
  }),
);

import * as repo from "@/features/suppliers/shopping-requests/repositories/shopping-requests-repository";
import {
  createShoppingRequest,
  approveShoppingRequest,
  ShoppingRequestValidationError,
} from "../shopping-requests-service";

const actor = { id: "user-1", name: "Admin", storeId: "store-main" };

const productSnapshot = {
  id: "prod-1",
  name: "Kertas A4",
  sku: "KRT-A4",
  unit: "rim",
  stock: 25,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createShoppingRequest", () => {
  it("rejects empty items list", async () => {
    await expect(
      createShoppingRequest(
        { items: [], requestedByName: "Admin" },
        actor,
        () => [productSnapshot],
      ),
    ).rejects.toThrow(ShoppingRequestValidationError);
    await expect(
      createShoppingRequest(
        { items: [], requestedByName: "Admin" },
        actor,
        () => [productSnapshot],
      ),
    ).rejects.toThrow("at least one item");
  });

  it("passes sanitized items with product snapshot to repository", async () => {
    vi.mocked(repo.createShoppingRequestWithItems).mockResolvedValue({
      id: "sr-1",
      number: "DPB-202606-001",
      status: "DRAFT",
      supplierId: null,
      supplierName: null,
      requestedByName: "Admin",
      approvedByName: null,
      itemCount: 1,
      totalRequestedQty: 5,
      totalApprovedQty: null,
      createdAt: "2026-06-19T10:00:00.000Z",
      approvedAt: null,
      note: null,
      items: [
        {
          id: "sri-1",
          productId: "prod-1",
          productName: "Kertas A4",
          productSku: "KRT-A4",
          unit: "rim",
          stockOnHand: 25,
          requestedQty: 5,
          approvedQty: null,
          product: { unitMultiplierToBase: 1, stockGroup: null },
        },
      ],
    });

    await createShoppingRequest(
      { items: [{ productId: "prod-1", requestedQty: 5 }], requestedByName: "Admin" },
      actor,
      () => [productSnapshot],
    );

    expect(repo.createShoppingRequestWithItems).toHaveBeenCalledTimes(1);
    const args = vi.mocked(repo.createShoppingRequestWithItems).mock.calls[0][0];
    expect(args.items).toEqual([
      {
        productId: "prod-1",
        productName: "Kertas A4",
        unit: "rim",
        stockOnHand: 25,
        requestedQty: 5,
      },
    ]);
  });
});

describe("approveShoppingRequest", () => {
  const draftRequest = {
    id: "sr-1",
    number: "DPB-202606-001",
    status: "DRAFT" as const,
    supplierId: null,
    supplierName: null,
    requestedByName: "Admin",
    approvedByName: null,
    itemCount: 2,
    totalRequestedQty: 10,
    totalApprovedQty: null,
    createdAt: "2026-06-19T10:00:00.000Z",
    approvedAt: null,
    note: null,
    items: [
      {
        id: "sri-1",
        productId: "prod-1",
        productName: "Kertas A4",
        productSku: "KRT-A4",
        unit: "rim",
        stockOnHand: 25,
        requestedQty: 5,
        approvedQty: null as number | null,
        product: { unitMultiplierToBase: 1, stockGroup: null },
      },
      {
        id: "sri-2",
        productId: "prod-2",
        productName: "Pulpen",
        productSku: "PLP-01",
        unit: "pcs",
        stockOnHand: 3,
        requestedQty: 5,
        approvedQty: null as number | null,
        product: { unitMultiplierToBase: 1, stockGroup: null },
      },
    ],
  };

  it("rejects if request is not DRAFT", async () => {
    vi.mocked(repo.findShoppingRequestById).mockResolvedValue({
      ...draftRequest,
      status: "APPROVED",
    });

    await expect(
      approveShoppingRequest(
        "sr-1",
        { items: [{ id: "sri-1", approvedQty: 5 }] },
        actor,
      ),
    ).rejects.toThrow(ShoppingRequestValidationError);
    await expect(
      approveShoppingRequest(
        "sr-1",
        { items: [{ id: "sri-1", approvedQty: 5 }] },
        actor,
      ),
    ).rejects.toThrow("not DRAFT");
  });

  it("sets approvedQty per item and marks APPROVED", async () => {
    vi.mocked(repo.findShoppingRequestById).mockResolvedValue(draftRequest);
    vi.mocked(repo.updateShoppingRequestItems).mockResolvedValue(undefined);
    vi.mocked(repo.updateShoppingRequestStatus).mockResolvedValue({
      ...draftRequest,
      status: "APPROVED",
      approvedByName: "Admin",
      approvedAt: "2026-06-19T11:00:00.000Z",
      totalApprovedQty: 8,
    });

    await approveShoppingRequest(
      "sr-1",
      {
        items: [
          { id: "sri-1", approvedQty: 5 },
          { id: "sri-2", approvedQty: 3 },
        ],
      },
      actor,
    );

    expect(repo.updateShoppingRequestItems).toHaveBeenCalledWith(
      "sr-1",
      [
        { id: "sri-1", approvedQty: 5 },
        { id: "sri-2", approvedQty: 3 },
      ],
    );
    expect(repo.updateShoppingRequestStatus).toHaveBeenCalledWith(
      "sr-1",
      expect.objectContaining({ status: "APPROVED" }),
    );
  });
});
