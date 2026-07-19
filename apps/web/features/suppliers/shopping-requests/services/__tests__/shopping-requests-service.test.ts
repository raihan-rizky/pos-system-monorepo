import { describe, expect, it, vi, beforeEach } from "vitest";

const supplierFindFirstMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ id: "supplier-1" }),
);
const productFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", () => ({
  db: {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        shoppingRequest: { count: vi.fn().mockResolvedValue(0) },
        supplier: { findFirst: supplierFindFirstMock },
      };
      return fn(tx);
    }),
    product: {
      findMany: productFindManyMock,
    },
    supplier: {
      findFirst: supplierFindFirstMock,
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
    cancelShoppingRequestIfUndecided: vi.fn(),
    updateShoppingRequestStatus: vi.fn(),
    updateShoppingRequestItems: vi.fn(),
    approveShoppingRequestWithStock: vi.fn(),
    saveShoppingRequestApprovedQuantities: vi.fn(),
    approveShoppingRequestItemsWithStock: vi.fn(),
    updateShoppingRequestWithItems: vi.fn(),
  }),
);

import * as repo from "@/features/suppliers/shopping-requests/repositories/shopping-requests-repository";
import {
  createShoppingRequest,
  approveShoppingRequest,
  cancelShoppingRequest,
  ShoppingRequestValidationError,
} from "../shopping-requests-service";
import * as shoppingRequestService from "../shopping-requests-service";

const actor = { id: "user-1", name: "Admin", storeId: "store-main" };
type TestActor = typeof actor;

const productSnapshot = {
  id: "prod-1",
  name: "Kertas A4",
  sku: "KRT-A4",
  unit: "rim",
  stock: 25,
};

beforeEach(() => {
  vi.clearAllMocks();
  supplierFindFirstMock.mockResolvedValue({ id: "supplier-1" });
  productFindManyMock.mockResolvedValue([]);
});

describe("createShoppingRequest", () => {
  it("rejects empty items list", async () => {
    await expect(
      createShoppingRequest(
        { supplierId: "supplier-1", items: [], requestedByName: "Admin" },
        actor,
        () => [productSnapshot],
      ),
    ).rejects.toThrow(ShoppingRequestValidationError);
    await expect(
      createShoppingRequest(
        { supplierId: "supplier-1", items: [], requestedByName: "Admin" },
        actor,
        () => [productSnapshot],
      ),
    ).rejects.toThrow("at least one item");
  });

  it("requires a supplier", async () => {
    await expect(
      createShoppingRequest(
        {
          supplierId: "",
          items: [
            {
              productId: "prod-1",
              requestedQty: 5,
              stockMode: "PRODUCT_ONLY",
            },
          ],
        },
        actor,
        () => [productSnapshot],
      ),
    ).rejects.toThrow("Supplier wajib dipilih");
  });

  it("rejects a supplier that is inactive or missing", async () => {
    supplierFindFirstMock.mockResolvedValueOnce(null);

    await expect(
      createShoppingRequest(
        {
          supplierId: "supplier-inactive",
          items: [
            {
              productId: "prod-1",
              requestedQty: 5,
              stockMode: "PRODUCT_ONLY",
            },
          ],
        },
        actor,
        () => [productSnapshot],
      ),
    ).rejects.toThrow("Supplier tidak aktif");
  });

  it("passes sanitized items with product snapshot to repository", async () => {
    vi.mocked(repo.createShoppingRequestWithItems).mockResolvedValue({
      id: "sr-1",
      number: "DPB-202606-001",
      status: "REQUESTED" as never,
      supplierId: "supplier-1",
      supplierName: "Supplier A",
      requestedByName: "Admin",
      approvedByName: null,
      itemCount: 1,
      decidedItemCount: 0,
      pendingItemCount: 1,
      totalRequestedQty: 5,
      totalApprovedQty: null,
      createdAt: "2026-06-19T10:00:00.000Z",
      approvedAt: null,
      note: null,
      stockAppliedAt: null,
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
          stockMode: "PRODUCT_ONLY",
          decisionStatus: "PENDING",
          decidedById: null,
          decidedByName: null,
          decidedAt: null,
          itemStockAppliedAt: null,
          costPriceSnapshot: null,
          imageUrl: null,
          product: { unitMultiplierToBase: 1, stockGroup: null },
        },
      ],
    });

    await createShoppingRequest(
      {
        supplierId: "supplier-1",
        items: [
          {
            productId: "prod-1",
            requestedQty: 5,
            stockMode: "PRODUCT_ONLY",
          },
        ],
        requestedByName: "Admin",
      },
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
        stockMode: "PRODUCT_ONLY",
      },
    ]);
  });
});

describe("approveShoppingRequest", () => {
  const draftRequest = {
    id: "sr-1",
    number: "DPB-202606-001",
    status: "REQUESTED" as never,
    supplierId: "supplier-1",
    supplierName: "Supplier A",
    requestedByName: "Admin",
    approvedByName: null,
    itemCount: 2,
    decidedItemCount: 0,
    pendingItemCount: 2,
    totalRequestedQty: 10,
    totalApprovedQty: null,
    createdAt: "2026-06-19T10:00:00.000Z",
    approvedAt: null,
    note: null,
    stockAppliedAt: null,
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
        stockMode: "GROUP_STOCK" as const,
        decisionStatus: "PENDING" as const,
        decidedById: null,
        decidedByName: null,
        decidedAt: null,
        itemStockAppliedAt: null,
        costPriceSnapshot: null,
        imageUrl: null,
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
        stockMode: "PRODUCT_ONLY" as const,
        decisionStatus: "PENDING" as const,
        decidedById: null,
        decidedByName: null,
        decidedAt: null,
        itemStockAppliedAt: null,
        costPriceSnapshot: null,
        imageUrl: null,
        product: { unitMultiplierToBase: 1, stockGroup: null },
      },
    ],
  };

  it("rejects if request is not REQUESTED", async () => {
    vi.mocked(repo.findShoppingRequestById).mockResolvedValue({
      ...draftRequest,
      status: "APPROVED",
    });

    await expect(
      approveShoppingRequest(
        "sr-1",
        { items: [{ id: "sri-1" }] },
        actor,
      ),
    ).rejects.toThrow(ShoppingRequestValidationError);
    await expect(
      approveShoppingRequest(
        "sr-1",
        { items: [{ id: "sri-1" }] },
        actor,
      ),
    ).rejects.toThrow("belum berstatus Diajukan");
  });

  it("approves all pending items from quantities saved in the request", async () => {
    const preparedRequest = {
      ...draftRequest,
      items: draftRequest.items.map((item, index) => ({
        ...item,
        approvedQty: index === 0 ? 5 : 3,
      })),
    };
    vi.mocked(repo.findShoppingRequestById).mockResolvedValue(preparedRequest);
    vi.mocked(repo.approveShoppingRequestItemsWithStock).mockResolvedValue({
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
          { id: "sri-1" },
          { id: "sri-2", stockMode: "PRODUCT_ONLY" },
        ],
      },
      actor,
    );

    expect(repo.approveShoppingRequestItemsWithStock).toHaveBeenCalledWith({
      id: "sr-1",
      actor,
      items: [
        { id: "sri-1", stockMode: "GROUP_STOCK" },
        { id: "sri-2", stockMode: "PRODUCT_ONLY" },
      ],
      approveAllPending: true,
    });
  });

  it("requires every pending item to have an explicit approved quantity", async () => {
    vi.mocked(repo.findShoppingRequestById).mockResolvedValue(draftRequest);

    await expect(
      approveShoppingRequest(
        "sr-1",
        { items: [{ id: "sri-1" }, { id: "sri-2" }] },
        actor,
      ),
    ).rejects.toThrow("Jumlah yang Di-ACC");
    expect(repo.approveShoppingRequestItemsWithStock).not.toHaveBeenCalled();
  });

  it("saves approved quantities without calling stock approval", async () => {
    const saveApprovedQuantities = (
      shoppingRequestService as Record<string, unknown>
    ).saveShoppingRequestApprovedQuantities as
      | ((
          id: string,
          input: unknown,
          _actor: TestActor,
        ) => Promise<unknown>)
      | undefined;

    expect(saveApprovedQuantities).toBeTypeOf("function");
    if (!saveApprovedQuantities) return;
    vi.mocked(repo.findShoppingRequestById).mockResolvedValue(draftRequest);
    vi.mocked(repo.saveShoppingRequestApprovedQuantities).mockResolvedValue({
      ...draftRequest,
      items: draftRequest.items.map((item, index) => ({
        ...item,
        approvedQty: index === 0 ? 6 : item.approvedQty,
      })),
    });

    await saveApprovedQuantities(
      "sr-1",
      {
        items: [{ id: "sri-1", approvedQty: 6 }],
        confirmOverRequested: true,
      },
      actor,
    );

    expect(repo.saveShoppingRequestApprovedQuantities).toHaveBeenCalledWith({
      id: "sr-1",
      actor,
      items: [{ id: "sri-1", approvedQty: 6 }],
    });
    expect(repo.approveShoppingRequestItemsWithStock).not.toHaveBeenCalled();
  });

  it("requires confirmation when an approved quantity exceeds the request", async () => {
    const saveApprovedQuantities = (
      shoppingRequestService as Record<string, unknown>
    ).saveShoppingRequestApprovedQuantities as
      | ((id: string, input: unknown, _actor: TestActor) => Promise<unknown>)
      | undefined;

    expect(saveApprovedQuantities).toBeTypeOf("function");
    if (!saveApprovedQuantities) return;
    vi.mocked(repo.findShoppingRequestById).mockResolvedValue(draftRequest);

    await expect(
      saveApprovedQuantities(
        "sr-1",
        { items: [{ id: "sri-1", approvedQty: 6 }] },
        actor,
      ),
    ).rejects.toThrow("melebihi Jumlah Kebutuhan");
  });

  it("approves one prepared item without changing its saved quantity", async () => {
    const approveItem = (
      shoppingRequestService as Record<string, unknown>
    ).approveShoppingRequestItem as
      | ((
          requestId: string,
          itemId: string,
          input: unknown,
          _actor: TestActor,
        ) => Promise<unknown>)
      | undefined;

    expect(approveItem).toBeTypeOf("function");
    if (!approveItem) return;
    vi.mocked(repo.findShoppingRequestById).mockResolvedValue({
      ...draftRequest,
      items: draftRequest.items.map((item) =>
        item.id === "sri-1" ? { ...item, approvedQty: 5 } : item,
      ),
    });
    vi.mocked(repo.approveShoppingRequestItemsWithStock).mockResolvedValue(
      draftRequest,
    );

    await approveItem(
      "sr-1",
      "sri-1",
      { stockMode: "PRODUCT_ONLY" },
      actor,
    );

    expect(repo.approveShoppingRequestItemsWithStock).toHaveBeenCalledWith({
      id: "sr-1",
      actor,
      items: [{ id: "sri-1", stockMode: "PRODUCT_ONLY" }],
      approveAllPending: false,
    });
  });

  it("locks cancellation after the first item decision", async () => {
    vi.mocked(repo.findShoppingRequestById).mockResolvedValue({
      ...draftRequest,
      items: draftRequest.items.map((item, index) =>
        index === 0 ? { ...item, decisionStatus: "APPROVED" as const } : item,
      ),
    });

    await expect(cancelShoppingRequest("sr-1", actor)).rejects.toThrow(
      "tidak dapat dibatalkan",
    );
    expect(repo.cancelShoppingRequestIfUndecided).not.toHaveBeenCalled();
  });

  it("edits the full request while every item is still pending", async () => {
    const updateRequest = (
      shoppingRequestService as Record<string, unknown>
    ).updateShoppingRequest as
      | ((id: string, input: unknown, _actor: TestActor) => Promise<unknown>)
      | undefined;
    expect(updateRequest).toBeTypeOf("function");
    if (!updateRequest) return;
    vi.mocked(repo.findShoppingRequestById).mockResolvedValue(draftRequest);
    productFindManyMock.mockResolvedValueOnce([productSnapshot]);
    vi.mocked(repo.updateShoppingRequestWithItems).mockResolvedValue(
      draftRequest,
    );

    await updateRequest(
      "sr-1",
      {
        supplierId: "supplier-1",
        note: "Prioritas minggu ini",
        items: [
          {
            productId: "prod-1",
            requestedQty: 7,
            stockMode: "PRODUCT_ONLY",
          },
        ],
      },
      actor,
    );

    expect(repo.updateShoppingRequestWithItems).toHaveBeenCalledWith({
      id: "sr-1",
      actor,
      supplierId: "supplier-1",
      note: "Prioritas minggu ini",
      items: [
        {
          productId: "prod-1",
          productName: "Kertas A4",
          unit: "rim",
          stockOnHand: 25,
          requestedQty: 7,
          stockMode: "PRODUCT_ONLY",
        },
      ],
    });
  });

  it("locks edit after the first item decision", async () => {
    const updateRequest = (
      shoppingRequestService as Record<string, unknown>
    ).updateShoppingRequest as
      | ((id: string, input: unknown, _actor: TestActor) => Promise<unknown>)
      | undefined;
    expect(updateRequest).toBeTypeOf("function");
    if (!updateRequest) return;
    vi.mocked(repo.findShoppingRequestById).mockResolvedValue({
      ...draftRequest,
      items: draftRequest.items.map((item, index) =>
        index === 0 ? { ...item, decisionStatus: "APPROVED" as const } : item,
      ),
    });

    await expect(
      updateRequest(
        "sr-1",
        {
          supplierId: "supplier-1",
          items: [
            {
              productId: "prod-1",
              requestedQty: 7,
              stockMode: "PRODUCT_ONLY",
            },
          ],
        },
        actor,
      ),
    ).rejects.toThrow("tidak dapat diedit");
    expect(repo.updateShoppingRequestWithItems).not.toHaveBeenCalled();
  });

  it("loads product snapshots only from the actor store", async () => {
    productFindManyMock.mockResolvedValueOnce([productSnapshot]);
    vi.mocked(repo.createShoppingRequestWithItems).mockResolvedValue({
      id: "sr-2",
      number: "DPB-202606-002",
      status: "REQUESTED",
      supplierId: "supplier-1",
      supplierName: "Supplier A",
      requestedByName: "Admin",
      approvedByName: null,
      itemCount: 0,
      decidedItemCount: 0,
      pendingItemCount: 0,
      totalRequestedQty: 0,
      totalApprovedQty: null,
      createdAt: "2026-06-19T10:00:00.000Z",
      approvedAt: null,
      stockAppliedAt: null,
      note: null,
      items: [],
    });

    await createShoppingRequest(
      {
        supplierId: "supplier-1",
        items: [
          { productId: "prod-1", requestedQty: 1, stockMode: "PRODUCT_ONLY" },
        ],
      },
      actor,
    );

    expect(productFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "store-main" }),
      }),
    );
  });

  it("returns a friendly conflict when another approval already applied stock", async () => {
    vi.mocked(repo.findShoppingRequestById).mockResolvedValue({
      ...draftRequest,
      items: draftRequest.items.map((item) => ({ ...item, approvedQty: 5 })),
    });
    vi.mocked(repo.approveShoppingRequestItemsWithStock).mockRejectedValue(
      new Error("ALREADY_DECIDED"),
    );

    await expect(
      approveShoppingRequest(
        "sr-1",
        { items: [{ id: "sri-1" }, { id: "sri-2" }] },
        actor,
      ),
    ).rejects.toThrow("sudah diproses");
  });
});
