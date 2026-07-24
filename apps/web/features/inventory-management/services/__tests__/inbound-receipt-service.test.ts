import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryInboundReceiptRepository as ConcreteInventoryInboundReceiptRepository } from "../../repositories/InventoryInboundReceiptRepository";
import {
  InventoryManagementError,
  approveInboundReceipt,
  createAndSubmitGoodsPurchaseReceipt,
  createInboundReceipt,
  getReceivingQueue,
  needsRevisionInboundReceipt,
  rejectInboundReceipt,
  submitInboundReceipt,
  updateAndSubmitInboundReceipt,
} from "../inbound-receipt-service";
import type {
  InboundReceiptForApproval,
  InboundReceiptStatus,
  ReceivingQueueRepositoryRow,
} from "../../types/inventory-management";

const goodsPurchaseFindManyMock = vi.hoisted(() => vi.fn());
const goodsPurchaseFindFirstMock = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", () => ({
  db: {
    goodsPurchase: {
      findMany: goodsPurchaseFindManyMock,
      findFirst: goodsPurchaseFindFirstMock,
    },
  },
  Prisma: {},
}));

vi.mock("@/features/product-stock-groups/stock-mutations", () => ({
  applyProductStockDelta: vi.fn(),
}));

function submittedReceipt(
  overrides: Partial<InboundReceiptForApproval> = {},
): InboundReceiptForApproval {
  return {
    id: "receipt-1",
    storeId: "store-main",
    supplierId: null,
    status: "SUBMITTED",
    lines: [
      {
        id: "line-1",
        productId: "product-1",
        status: "RECEIVED",
        receivedQuantity: 4,
        latestCostPrice: 12000,
        productIsActive: true,
      },
      {
        id: "line-2",
        productId: "product-2",
        status: "MISSING",
        receivedQuantity: 3,
        latestCostPrice: 9000,
        productIsActive: true,
      },
    ],
    ...overrides,
  };
}

function receivingQueueRows(): ReceivingQueueRepositoryRow[] {
  return [
    {
      goodsPurchaseId: "gp-1",
      goodsPurchaseNumber: "PB-202607-001",
      supplierId: "supplier-1",
      supplierName: "CV Kertas",
      fulfillmentStatus: "NOT_RECEIVED",
      itemId: "gpi-1",
      productId: "product-1",
      productName: "Kertas Dus",
      sku: "KD-1",
      unit: "dus",
      orderedQuantity: 50,
      approvedReceivedQuantity: 20,
      pendingReservedQuantity: 10,
      pendingReceiptIds: ["receipt-2"],
    },
  ];
}

function createRepository(
  receipt: InboundReceiptForApproval | null = submittedReceipt(),
) {
  return {
    runInTransaction: vi.fn(async (callback) => callback({ tx: true })),
    findReceiptForApproval: vi.fn(async () => receipt),
    createInboundStockLog: vi.fn(async (_tx, input) => ({
      id: `log-${input.productId}`,
    })),
    applyProductStockDelta: vi.fn(async () => undefined),
    markReceiptApproved: vi.fn(async () => ({
      id: "receipt-1",
      status: "APPROVED" as const,
    })),
    markReceiptRejected: vi.fn(async () => ({
      id: "receipt-1",
      status: "REJECTED" as const,
    })),
    markReceiptNeedsRevision: vi.fn(async () => ({
      id: "receipt-1",
      status: "NEEDS_REVISION" as const,
    })),
    markReceiptSubmitted: vi.fn(async () => ({
      id: "receipt-1",
      status: "SUBMITTED" as const,
    })),
    findReceiptForEdit: vi.fn(async () => ({
      id: "receipt-1",
      storeId: "store-main",
      status: "NEEDS_REVISION" as InboundReceiptStatus,
      submittedBy: "inventory-1",
      goodsPurchaseId: null as string | null,
    })),
    updateReceiptDraft: vi.fn(async () => ({
      id: "receipt-1",
      status: "NEEDS_REVISION" as const,
    })),
    createInboundReceiptDraft: vi.fn(async () => ({
      id: "receipt-1",
      status: "DRAFT" as const,
    })),
    listInboundReceipts: vi.fn(async () => []),
    listReceivingQueue: vi.fn(async () => receivingQueueRows()),
    getGoodsPurchaseReceivingComparison: vi.fn(async () => null),
    lockGoodsPurchase: vi.fn(async () => true),
    findGoodsPurchaseForReceipt: vi.fn(async () => ({
      id: "gp-1",
      number: "PB-202607-001",
      shoppingRequestId: "shopping-1",
      supplierId: "supplier-1",
      supplierNameSnapshot: "CV Kertas",
      items: [
        {
          id: "gpi-1",
          shoppingRequestItemId: "shopping-item-1",
          productId: "product-1",
          productNameSnapshot: "Kertas Dus",
          skuSnapshot: "KD-1",
          unitSnapshot: "dus",
          latestUnitPrice: 120_000,
          quantity: 10,
          inboundReceiptLines: [
            {
              status: "RECEIVED" as const,
              receivedQuantity: 2,
              receipt: { status: "APPROVED" as const },
            },
            {
              status: "PARTIAL" as const,
              receivedQuantity: 3,
              receipt: { status: "SUBMITTED" as const },
            },
          ],
        },
        {
          id: "gpi-2",
          shoppingRequestItemId: "shopping-item-2",
          productId: "product-2",
          productNameSnapshot: "Lakban",
          skuSnapshot: "LB-1",
          unitSnapshot: "roll",
          latestUnitPrice: 15_000,
          quantity: 4,
          inboundReceiptLines: [],
        },
      ],
    })),
    createSubmittedGoodsPurchaseReceipt: vi.fn(async () => ({
      id: "receipt-1",
      status: "SUBMITTED" as const,
    })),
  };
}

describe("inbound receipt service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists approved goods purchases and reserves submitted receipt quantities", async () => {
    const repository = createRepository();

    const result = await getReceivingQueue({
      repository,
      user: {
        id: "inventory-1",
        name: "Ira",
        role: "INVENTORY",
        storeId: "store-main",
      },
    });

    expect(repository.listReceivingQueue).toHaveBeenCalledWith("store-main", {});
    expect(result).toEqual({
      purchases: [
        expect.objectContaining({
          id: "gp-1",
          number: "PB-202607-001",
          supplierId: "supplier-1",
          supplierName: "CV Kertas",
          fulfillmentStatus: "NOT_RECEIVED",
          pendingReceiptCount: 1,
          items: [
            expect.objectContaining({
              goodsPurchaseItemId: "gpi-1",
              orderedQuantity: 50,
              approvedReceivedQuantity: 20,
              pendingReservedQuantity: 10,
              availableQuantity: 20,
            }),
          ],
        }),
      ],
      items: [],
    });
  });

  it("groups purchase items and counts each submitted receipt once", async () => {
    const repository = createRepository();
    vi.mocked(repository.listReceivingQueue).mockResolvedValueOnce([
      ...receivingQueueRows(),
      {
        ...receivingQueueRows()[0],
        itemId: "gpi-2",
        productId: "product-2",
        productName: "Kertas Pack",
        sku: "KP-1",
        unit: "pack",
        orderedQuantity: 30,
        approvedReceivedQuantity: 10,
        pendingReservedQuantity: 5,
        pendingReceiptIds: ["receipt-2", "receipt-3"],
      },
    ]);

    const result = await getReceivingQueue({
      repository,
      user: {
        id: "inventory-1",
        name: "Ira",
        role: "INVENTORY",
        storeId: "store-main",
      },
    });

    expect(result.purchases).toHaveLength(1);
    expect(result.purchases[0]).toMatchObject({
      pendingReceiptCount: 2,
      items: [
        expect.objectContaining({ goodsPurchaseItemId: "gpi-1", availableQuantity: 20 }),
        expect.objectContaining({ goodsPurchaseItemId: "gpi-2", availableQuantity: 15 }),
      ],
    });
  });

  it("discards purchases whose items have no available quantity", async () => {
    const repository = createRepository();
    vi.mocked(repository.listReceivingQueue).mockResolvedValueOnce([
      {
        ...receivingQueueRows()[0],
        approvedReceivedQuantity: 40,
        pendingReservedQuantity: 10,
      },
    ]);

    const result = await getReceivingQueue({
      repository,
      user: {
        id: "inventory-1",
        name: "Ira",
        role: "INVENTORY",
        storeId: "store-main",
      },
    });

    expect(result).toEqual({ purchases: [], items: [] });
  });

  it("forwards the optional goods purchase filter to the repository", async () => {
    const repository = createRepository();

    await getReceivingQueue({
      repository,
      user: {
        id: "inventory-1",
        name: "Ira",
        role: "INVENTORY",
        storeId: "store-main",
      },
      input: { goodsPurchaseId: "gp-1" },
    });

    expect(repository.listReceivingQueue).toHaveBeenCalledWith("store-main", {
      goodsPurchaseId: "gp-1",
    });
  });

  it("rejects unscoped users before loading receiving queue", async () => {
    const repository = createRepository();

    await expect(
      getReceivingQueue({
        repository,
        user: { id: "inventory-1", name: "Ira", role: "INVENTORY", storeId: null },
      }),
    ).rejects.toMatchObject({ code: "STORE_REQUIRED", status: 403 });
    expect(repository.listReceivingQueue).not.toHaveBeenCalled();
  });

  it("queries approved goods purchases instead of shopping requests for the queue", () => {
    const repositorySource = readFileSync(
      new URL(
        "../../repositories/InventoryInboundReceiptRepository.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(repositorySource).toContain("db.goodsPurchase.findMany");
    expect(repositorySource).toMatch(/status:\s*"APPROVED"/);
    expect(repositorySource).toContain('fulfillmentStatus: { not: "RECEIVED" }');
    expect(repositorySource).not.toContain("db.shoppingRequest.findMany");
  });

  it("excludes non-counting line statuses from queue approved and pending quantities", async () => {
    goodsPurchaseFindManyMock.mockResolvedValueOnce([
      {
        id: "gp-1",
        number: "PB-202607-001",
        supplierId: "supplier-1",
        supplierNameSnapshot: "CV Kertas",
        fulfillmentStatus: "PARTIALLY_RECEIVED",
        items: [
          {
            id: "gpi-1",
            productId: "product-1",
            productNameSnapshot: "Kertas Dus",
            skuSnapshot: "KD-1",
            unitSnapshot: "dus",
            quantity: 50,
            inboundReceiptLines: [
              {
                status: "RECEIVED",
                receivedQuantity: 5,
                receipt: { id: "receipt-approved-1", status: "APPROVED" },
              },
              {
                status: "MISSING",
                receivedQuantity: 7,
                receipt: { id: "receipt-approved-2", status: "APPROVED" },
              },
              {
                status: "DAMAGED",
                receivedQuantity: 11,
                receipt: { id: "receipt-approved-3", status: "APPROVED" },
              },
              {
                status: "MISMATCH",
                receivedQuantity: 13,
                receipt: { id: "receipt-approved-4", status: "APPROVED" },
              },
              {
                status: "PARTIAL",
                receivedQuantity: 3,
                receipt: { id: "receipt-submitted-1", status: "SUBMITTED" },
              },
              {
                status: "MISSING",
                receivedQuantity: 17,
                receipt: { id: "receipt-submitted-2", status: "SUBMITTED" },
              },
              {
                status: "DAMAGED",
                receivedQuantity: 19,
                receipt: { id: "receipt-submitted-3", status: "SUBMITTED" },
              },
              {
                status: "MISMATCH",
                receivedQuantity: 23,
                receipt: { id: "receipt-submitted-4", status: "SUBMITTED" },
              },
            ],
          },
        ],
      },
    ]);
    const repository = new ConcreteInventoryInboundReceiptRepository();

    const rows = await repository.listReceivingQueue("store-main", {});

    expect(rows[0]).toMatchObject({
      approvedReceivedQuantity: 5,
      pendingReservedQuantity: 3,
    });
  });

  it("excludes non-counting line statuses from comparison totals and batch quantities", async () => {
    goodsPurchaseFindFirstMock.mockResolvedValueOnce({
      id: "gp-1",
      number: "PB-202607-001",
      supplierNameSnapshot: "CV Kertas",
      fulfillmentStatus: "PARTIALLY_RECEIVED",
      items: [
        {
          id: "gpi-1",
          productNameSnapshot: "Kertas Dus",
          skuSnapshot: "KD-1",
          unitSnapshot: "dus",
          quantity: 50,
          inboundReceiptLines: [
            {
              status: "RECEIVED",
              receivedQuantity: 5,
              receipt: { status: "APPROVED" },
            },
            {
              status: "MISSING",
              receivedQuantity: 7,
              receipt: { status: "APPROVED" },
            },
            {
              status: "DAMAGED",
              receivedQuantity: 11,
              receipt: { status: "APPROVED" },
            },
            {
              status: "MISMATCH",
              receivedQuantity: 13,
              receipt: { status: "APPROVED" },
            },
            {
              status: "PARTIAL",
              receivedQuantity: 3,
              receipt: { status: "SUBMITTED" },
            },
            {
              status: "MISSING",
              receivedQuantity: 17,
              receipt: { status: "SUBMITTED" },
            },
            {
              status: "DAMAGED",
              receivedQuantity: 19,
              receipt: { status: "SUBMITTED" },
            },
            {
              status: "MISMATCH",
              receivedQuantity: 23,
              receipt: { status: "SUBMITTED" },
            },
          ],
        },
      ],
      inboundReceipts: [
        {
          id: "receipt-1",
          createdAt: new Date("2026-07-24T01:00:00.000Z"),
          status: "SUBMITTED",
          approvedAt: null,
          approver: null,
          lines: [
            {
              goodsPurchaseItemId: "gpi-1",
              status: "RECEIVED",
              receivedQuantity: 5,
              matchStatus: "MATCHED",
              note: null,
            },
            {
              goodsPurchaseItemId: "gpi-2",
              status: "MISSING",
              receivedQuantity: 7,
              matchStatus: "MISMATCHED",
              note: "Tidak datang",
            },
            {
              goodsPurchaseItemId: "gpi-3",
              status: "DAMAGED",
              receivedQuantity: 11,
              matchStatus: "MISMATCHED",
              note: "Rusak",
            },
            {
              goodsPurchaseItemId: "gpi-4",
              status: "MISMATCH",
              receivedQuantity: 13,
              matchStatus: "MISMATCHED",
              note: "Barang berbeda",
            },
          ],
        },
      ],
    });
    const repository = new ConcreteInventoryInboundReceiptRepository();

    const comparison = await repository.getGoodsPurchaseReceivingComparison(
      "store-main",
      "gp-1",
    );

    expect(comparison?.items[0]).toMatchObject({
      approvedReceivedQuantity: 5,
      pendingReservedQuantity: 3,
      remainingQuantity: 42,
    });
    expect(comparison?.receipts[0].lines).toEqual([
      expect.objectContaining({
        goodsPurchaseItemId: "gpi-1",
        receivedQuantity: 5,
      }),
      expect.objectContaining({
        goodsPurchaseItemId: "gpi-2",
        receivedQuantity: 0,
      }),
      expect.objectContaining({
        goodsPurchaseItemId: "gpi-3",
        receivedQuantity: 0,
      }),
      expect.objectContaining({
        goodsPurchaseItemId: "gpi-4",
        receivedQuantity: 0,
      }),
    ]);
  });

  it("approves a submitted receipt by applying stock only for eligible lines in one transaction", async () => {
    const repository = createRepository();

    const result = await approveInboundReceipt({
      repository,
      user: {
        id: "owner-1",
        name: "Owner",
        role: "OWNER",
        storeId: "store-main",
      },
      receiptId: "receipt-1",
    });

    expect(result.status).toBe("APPROVED");
    expect(repository.runInTransaction).toHaveBeenCalledTimes(1);
    expect(repository.applyProductStockDelta).toHaveBeenCalledTimes(1);
    expect(repository.applyProductStockDelta).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        storeId: "store-main",
        productId: "product-1",
        delta: 4,
      }),
    );
    expect(repository.createInboundStockLog).toHaveBeenCalledTimes(1);
    expect(repository.markReceiptApproved).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        receiptId: "receipt-1",
        approvedBy: "owner-1",
        lineLogIds: [{ lineId: "line-1", inventoryLogId: "log-product-1" }],
      }),
    );
  });

  it("does not apply stock again when the receipt is already approved", async () => {
    const repository = createRepository(
      submittedReceipt({ status: "APPROVED" }),
    );

    const result = await approveInboundReceipt({
      repository,
      user: {
        id: "owner-1",
        name: "Owner",
        role: "OWNER",
        storeId: "store-main",
      },
      receiptId: "receipt-1",
    });

    expect(result.status).toBe("APPROVED");
    expect(repository.applyProductStockDelta).not.toHaveBeenCalled();
    expect(repository.createInboundStockLog).not.toHaveBeenCalled();
    expect(repository.markReceiptApproved).not.toHaveBeenCalled();
  });

  it("blocks approval when an eligible line has no valid latest cost", async () => {
    const repository = createRepository(
      submittedReceipt({
        lines: [
          {
            id: "line-1",
            productId: "product-1",
            status: "RECEIVED",
            receivedQuantity: 4,
            latestCostPrice: null,
            productIsActive: true,
          },
        ],
      }),
    );

    await expect(
      approveInboundReceipt({
        repository,
        user: {
          id: "owner-1",
          name: "Owner",
          role: "OWNER",
          storeId: "store-main",
        },
        receiptId: "receipt-1",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_RECEIPT_LINE",
      status: 422,
    });
    expect(repository.applyProductStockDelta).not.toHaveBeenCalled();
  });

  it("maps status-guarded approval races to conflict errors", async () => {
    const repository = createRepository();
    vi.mocked(repository.markReceiptApproved).mockRejectedValueOnce(
      new Error("INBOUND_RECEIPT_CONFLICT"),
    );

    await expect(
      approveInboundReceipt({
        repository,
        user: {
          id: "owner-1",
          name: "Owner",
          role: "OWNER",
          storeId: "store-main",
        },
        receiptId: "receipt-1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
  });


  it("maps status-guarded submit races to conflict errors", async () => {
    const repository = createRepository();
    vi.mocked(repository.markReceiptSubmitted).mockRejectedValueOnce(
      new Error("INBOUND_RECEIPT_CONFLICT"),
    );

    await expect(
      submitInboundReceipt({
        repository,
        user: {
          id: "inventory-1",
          name: "Ira",
          role: "INVENTORY",
          storeId: "store-main",
        },
        receiptId: "receipt-1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("updates creator-owned needs-revision receipts and submits them again", async () => {
    const repository = createRepository();

    const result = await updateAndSubmitInboundReceipt({
      repository,
      user: {
        id: "inventory-1",
        name: "Ira",
        role: "INVENTORY",
        storeId: "store-main",
      },
      receiptId: "receipt-1",
      input: {
        note: "Sudah dicek ulang",
        lines: [
          {
            id: "line-1",
            productId: "product-1",
            expectedQuantity: 10,
            receivedQuantity: 8,
            status: "PARTIAL",
            note: "Kurang 2",
          },
        ],
      },
    });

    expect(result.status).toBe("SUBMITTED");
    expect(repository.updateReceiptDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        receiptId: "receipt-1",
        note: "Sudah dicek ulang",
        lines: [
          expect.objectContaining({
            id: "line-1",
            status: "PARTIAL",
            note: "Kurang 2",
          }),
        ],
      }),
    );
    expect(repository.markReceiptSubmitted).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        receiptId: "receipt-1",
        submittedBy: "inventory-1",
      }),
    );
  });

  it("blocks non-creators from editing needs-revision receipts", async () => {
    const repository = createRepository();
    vi.mocked(repository.findReceiptForEdit).mockResolvedValueOnce({
      id: "receipt-1",
      storeId: "store-main",
      status: "NEEDS_REVISION",
      submittedBy: "inventory-2",
      goodsPurchaseId: null,
    });

    await expect(
      updateAndSubmitInboundReceipt({
        repository,
        user: {
          id: "inventory-1",
          name: "Ira",
          role: "INVENTORY",
          storeId: "store-main",
        },
        receiptId: "receipt-1",
        input: {
          lines: [
            {
              id: "line-1",
              productId: "product-1",
              expectedQuantity: 10,
              receivedQuantity: 8,
              status: "PARTIAL",
              note: "Kurang 2",
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    expect(repository.updateReceiptDraft).not.toHaveBeenCalled();
    expect(repository.markReceiptSubmitted).not.toHaveBeenCalled();
  });

  it("blocks Goods Purchase receipts from the legacy revision resubmit path", async () => {
    const repository = createRepository();
    vi.mocked(repository.findReceiptForEdit).mockResolvedValueOnce({
      id: "receipt-1",
      storeId: "store-main",
      status: "NEEDS_REVISION",
      submittedBy: "inventory-1",
      goodsPurchaseId: "gp-1",
    });

    await expect(
      updateAndSubmitInboundReceipt({
        repository,
        user: {
          id: "inventory-1",
          name: "Ira",
          role: "INVENTORY",
          storeId: "store-main",
        },
        receiptId: "receipt-1",
        input: {
          lines: [
            {
              id: "line-1",
              productId: "product-client-value",
              expectedQuantity: 999,
              receivedQuantity: 999,
              status: "OVER_RECEIVED",
              note: "Client mencoba mengganti snapshot",
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
      message:
        "Penerimaan Barang dari Pembelian Barang tidak dapat direvisi melalui alur lama",
    });
    expect(repository.updateReceiptDraft).not.toHaveBeenCalled();
    expect(repository.markReceiptSubmitted).not.toHaveBeenCalled();
  });

  it("rejects unscoped users before repository writes", async () => {
    const repository = createRepository();

    await expect(
      submitInboundReceipt({
        repository,
        user: { id: "inventory-1", name: "Ira", role: "INVENTORY", storeId: null },
        receiptId: "receipt-1",
      }),
    ).rejects.toMatchObject({ code: "STORE_REQUIRED", status: 403 });
    expect(repository.markReceiptSubmitted).not.toHaveBeenCalled();
  });

  it("marks submitted receipts as needs revision with a required reason", async () => {
    const repository = createRepository();

    const result = await needsRevisionInboundReceipt({
      repository,
      user: {
        id: "owner-1",
        name: "Owner",
        role: "OWNER",
        storeId: "store-main",
      },
      receiptId: "receipt-1",
      revisionReason: "Qty perlu dicek ulang",
    });

    expect(result.status).toBe("NEEDS_REVISION");
    expect(repository.runInTransaction).toHaveBeenCalledTimes(1);
    expect(repository.markReceiptNeedsRevision).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        storeId: "store-main",
        receiptId: "receipt-1",
        revisedBy: "owner-1",
        revisionReason: "Qty perlu dicek ulang",
      }),
    );
  });

  it("requires a revision reason", async () => {
    const repository = createRepository();

    await expect(
      needsRevisionInboundReceipt({
        repository,
        user: {
          id: "owner-1",
          name: "Owner",
          role: "OWNER",
          storeId: "store-main",
        },
        receiptId: "receipt-1",
        revisionReason: " ",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
    expect(repository.markReceiptNeedsRevision).not.toHaveBeenCalled();
  });

  it("rejects unscoped users before marking needs revision", async () => {
    const repository = createRepository();

    await expect(
      needsRevisionInboundReceipt({
        repository,
        user: { id: "owner-1", name: "Owner", role: "OWNER", storeId: null },
        receiptId: "receipt-1",
        revisionReason: "Cek ulang",
      }),
    ).rejects.toMatchObject({ code: "STORE_REQUIRED", status: 403 });
    expect(repository.markReceiptNeedsRevision).not.toHaveBeenCalled();
  });

  it("maps status-guarded needs-revision races to conflict errors", async () => {
    const repository = createRepository();
    vi.mocked(repository.markReceiptNeedsRevision).mockRejectedValueOnce(
      new Error("INBOUND_RECEIPT_CONFLICT"),
    );

    await expect(
      needsRevisionInboundReceipt({
        repository,
        user: {
          id: "owner-1",
          name: "Owner",
          role: "OWNER",
          storeId: "store-main",
        },
        receiptId: "receipt-1",
        revisionReason: "Cek ulang",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
  });

  it("requires a rejection reason", async () => {
    const repository = createRepository();

    await expect(
      rejectInboundReceipt({
        repository,
        user: {
          id: "owner-1",
          name: "Owner",
          role: "OWNER",
          storeId: "store-main",
        },
        receiptId: "receipt-1",
        rejectionReason: " ",
      }),
    ).rejects.toBeInstanceOf(InventoryManagementError);
    expect(repository.markReceiptRejected).not.toHaveBeenCalled();
  });

  it("creates a draft inbound receipt with validated line notes", async () => {
    const repository = createRepository();

    const result = await createInboundReceipt({
      repository,
      user: {
        id: "inventory-1",
        name: "Ira",
        role: "INVENTORY",
        storeId: "store-main",
      },
      input: {
        supplierId: "supplier-1",
        shoppingRequestId: "shopping-1",
        note: "Invoice 123",
        lines: [
          {
            productId: "product-1",
            expectedQuantity: 10,
            receivedQuantity: 8,
            status: "PARTIAL",
            note: "Kurang 2",
          },
        ],
      },
    });

    expect(result.status).toBe("DRAFT");
    expect(repository.createInboundReceiptDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        storeId: "store-main",
        createdBy: "inventory-1",
        lines: [
          expect.objectContaining({
            productId: "product-1",
            status: "PARTIAL",
            note: "Kurang 2",
          }),
        ],
      }),
    );
  });

  it("creates a submitted goods purchase receipt from the latest server quantities", async () => {
    const repository = createRepository();

    const result = await createAndSubmitGoodsPurchaseReceipt({
      repository,
      user: {
        id: "inventory-1",
        name: "Ira",
        role: "INVENTORY",
        storeId: "store-main",
      },
      input: {
        goodsPurchaseId: "gp-1",
        note: "Surat jalan SJ-1",
        lines: [
          {
            goodsPurchaseItemId: "gpi-1",
            matchStatus: "MATCHED",
            receivedQuantity: 5,
          },
          {
            goodsPurchaseItemId: "gpi-2",
            matchStatus: "MISMATCHED",
            receivedQuantity: 3,
            note: "Kurang 1 roll",
          },
        ],
      },
    });

    expect(result.status).toBe("SUBMITTED");
    expect(repository.runInTransaction).toHaveBeenCalledTimes(1);
    expect(repository.lockGoodsPurchase).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        storeId: "store-main",
        goodsPurchaseId: "gp-1",
      }),
    );
    expect(repository.createSubmittedGoodsPurchaseReceipt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        storeId: "store-main",
        goodsPurchaseId: "gp-1",
        shoppingRequestId: "shopping-1",
        supplierId: "supplier-1",
        submittedBy: "inventory-1",
        note: "Surat jalan SJ-1",
        lines: [
          expect.objectContaining({
            goodsPurchaseItemId: "gpi-1",
            productId: "product-1",
            expectedQuantity: 5,
            receivedQuantity: 5,
            status: "RECEIVED",
            matchStatus: "MATCHED",
            reviewStatus: "PENDING",
          }),
          expect.objectContaining({
            goodsPurchaseItemId: "gpi-2",
            expectedQuantity: 4,
            receivedQuantity: 3,
            matchStatus: "MISMATCHED",
            reviewStatus: "PENDING",
            note: "Kurang 1 roll",
          }),
        ],
      }),
    );
    expect(repository.markReceiptSubmitted).not.toHaveBeenCalled();
    expect(repository.applyProductStockDelta).not.toHaveBeenCalled();
    expect(repository.createInboundStockLog).not.toHaveBeenCalled();
  });

  it("locks the goods purchase before loading current receipt reservations", async () => {
    const repository = createRepository();

    await createAndSubmitGoodsPurchaseReceipt({
      repository,
      user: {
        id: "inventory-1",
        name: "Ira",
        role: "INVENTORY",
        storeId: "store-main",
      },
      input: {
        goodsPurchaseId: "gp-1",
        lines: [
          {
            goodsPurchaseItemId: "gpi-1",
            matchStatus: "MATCHED",
            receivedQuantity: 5,
          },
          {
            goodsPurchaseItemId: "gpi-2",
            matchStatus: "MATCHED",
            receivedQuantity: 4,
          },
        ],
      },
    });

    expect(repository.lockGoodsPurchase.mock.invocationCallOrder[0]).toBeLessThan(
      repository.findGoodsPurchaseForReceipt.mock.invocationCallOrder[0],
    );
  });

  it("does not put Goods Purchase receipts into needs revision", async () => {
    const repository = createRepository();
    vi.mocked(repository.findReceiptForEdit).mockResolvedValueOnce({
      id: "receipt-1",
      storeId: "store-main",
      status: "SUBMITTED",
      submittedBy: "inventory-1",
      goodsPurchaseId: "gp-1",
    });

    await expect(
      needsRevisionInboundReceipt({
        repository,
        user: {
          id: "owner-1",
          name: "Owner",
          role: "OWNER",
          storeId: "store-main",
        },
        receiptId: "receipt-1",
        revisionReason: "Coba revisi",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
      message:
        "Penerimaan Barang dari Pembelian Barang tidak mendukung status perlu revisi",
    });
    expect(repository.markReceiptNeedsRevision).not.toHaveBeenCalled();
  });

  it("requires every currently available purchase item", async () => {
    const repository = createRepository();

    await expect(
      createAndSubmitGoodsPurchaseReceipt({
        repository,
        user: {
          id: "inventory-1",
          name: "Ira",
          role: "INVENTORY",
          storeId: "store-main",
        },
        input: {
          goodsPurchaseId: "gp-1",
          lines: [
            {
              goodsPurchaseItemId: "gpi-1",
              matchStatus: "MATCHED",
              receivedQuantity: 5,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Semua produk yang masih tersedia wajib diisi",
    });
    expect(repository.createSubmittedGoodsPurchaseReceipt).not.toHaveBeenCalled();
  });

  it("requires a note when received quantity differs from expected batch", async () => {
    const repository = createRepository();

    await expect(
      createAndSubmitGoodsPurchaseReceipt({
        repository,
        user: {
          id: "inventory-1",
          name: "Ira",
          role: "INVENTORY",
          storeId: "store-main",
        },
        input: {
          goodsPurchaseId: "gp-1",
          lines: [
            {
              goodsPurchaseItemId: "gpi-1",
              matchStatus: "MATCHED",
              receivedQuantity: 4,
            },
            {
              goodsPurchaseItemId: "gpi-2",
              matchStatus: "MATCHED",
              receivedQuantity: 4,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Catatan produk wajib diisi saat jumlah diterima berbeda",
    });
    expect(repository.createSubmittedGoodsPurchaseReceipt).not.toHaveBeenCalled();
  });

  it("does not allow received quantity above current available quantity", async () => {
    const repository = createRepository();

    await expect(
      createAndSubmitGoodsPurchaseReceipt({
        repository,
        user: {
          id: "inventory-1",
          name: "Ira",
          role: "INVENTORY",
          storeId: "store-main",
        },
        input: {
          goodsPurchaseId: "gp-1",
          lines: [
            {
              goodsPurchaseItemId: "gpi-1",
              matchStatus: "MATCHED",
              receivedQuantity: 6,
              note: "Datang lebih banyak",
            },
            {
              goodsPurchaseItemId: "gpi-2",
              matchStatus: "MATCHED",
              receivedQuantity: 4,
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT", status: 409 });
    expect(repository.createSubmittedGoodsPurchaseReceipt).not.toHaveBeenCalled();
  });

  it("ignores floating-point availability within the quantity tolerance", async () => {
    const repository = createRepository();
    vi.mocked(repository.findGoodsPurchaseForReceipt).mockResolvedValueOnce({
      id: "gp-1",
      number: "PB-202607-001",
      shoppingRequestId: "shopping-1",
      supplierId: "supplier-1",
      supplierNameSnapshot: "CV Kertas",
      items: [
        {
          id: "gpi-residual",
          shoppingRequestItemId: "shopping-item-residual",
          productId: "product-residual",
          productNameSnapshot: "Produk Residual",
          skuSnapshot: "FLOAT-1",
          unitSnapshot: "pcs",
          latestUnitPrice: 1_000,
          quantity: 0.8,
          inboundReceiptLines: [
            {
              status: "RECEIVED",
              receivedQuantity: 0.1,
              receipt: { status: "APPROVED" },
            },
            {
              status: "PARTIAL",
              receivedQuantity: 0.7,
              receipt: { status: "SUBMITTED" },
            },
          ],
        },
        {
          id: "gpi-available",
          shoppingRequestItemId: "shopping-item-available",
          productId: "product-available",
          productNameSnapshot: "Produk Tersedia",
          skuSnapshot: "AVAILABLE-1",
          unitSnapshot: "pcs",
          latestUnitPrice: 2_000,
          quantity: 2,
          inboundReceiptLines: [],
        },
      ],
    });

    await expect(
      createAndSubmitGoodsPurchaseReceipt({
        repository,
        user: {
          id: "inventory-1",
          name: "Ira",
          role: "INVENTORY",
          storeId: "store-main",
        },
        input: {
          goodsPurchaseId: "gp-1",
          lines: [
            {
              goodsPurchaseItemId: "gpi-available",
              matchStatus: "MATCHED",
              receivedQuantity: 2,
            },
          ],
        },
      }),
    ).resolves.toMatchObject({ status: "SUBMITTED" });
    expect(repository.createSubmittedGoodsPurchaseReceipt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        lines: [
          expect.objectContaining({
            goodsPurchaseItemId: "gpi-available",
            expectedQuantity: 2,
          }),
        ],
      }),
    );
  });

  it("guards legacy source writes at the repository boundary", async () => {
    const repository = new ConcreteInventoryInboundReceiptRepository();
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const tx = {
      inventoryInboundReceipt: { updateMany },
      inventoryInboundReceiptLine: {
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };

    await repository.updateReceiptDraft(tx as never, {
      storeId: "store-main",
      receiptId: "receipt-legacy",
      lines: [
        {
          id: "line-1",
          productId: "product-1",
          expectedQuantity: 10,
          receivedQuantity: 10,
          status: "RECEIVED",
        },
      ],
    });
    await repository.markReceiptNeedsRevision(tx as never, {
      storeId: "store-main",
      receiptId: "receipt-legacy",
      revisedBy: "owner-1",
      revisionReason: "Cek ulang",
    });
    await repository.markReceiptSubmitted(tx as never, {
      storeId: "store-main",
      receiptId: "receipt-legacy",
      submittedBy: "inventory-1",
      submittedAt: new Date("2026-07-24T00:00:00.000Z"),
    });

    expect(updateMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ goodsPurchaseId: null }),
      }),
    );
    expect(updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ goodsPurchaseId: null }),
      }),
    );
    expect(updateMany).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: expect.objectContaining({ goodsPurchaseId: null }),
      }),
    );
  });

  it("requires notes for non-normal inbound lines before creating drafts", async () => {
    const repository = createRepository();

    await expect(
      createInboundReceipt({
        repository,
        user: {
          id: "inventory-1",
          name: "Ira",
          role: "INVENTORY",
          storeId: "store-main",
        },
        input: {
          lines: [
            {
              productId: "product-1",
              expectedQuantity: 10,
              receivedQuantity: 8,
              status: "PARTIAL",
            },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
    expect(repository.createInboundReceiptDraft).not.toHaveBeenCalled();
  });
});
