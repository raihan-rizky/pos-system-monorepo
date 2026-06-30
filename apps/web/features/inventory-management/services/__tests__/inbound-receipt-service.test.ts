import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InventoryManagementError,
  approveInboundReceipt,
  createAndSubmitInboundReceipt,
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
  InventoryInboundReceiptRepository,
  ReceivingQueueRepositoryRow,
} from "../../types/inventory-management";

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
      shoppingRequestId: "shopping-1",
      shoppingRequestNumber: "DPB-202606-001",
      supplierName: "Supplier A",
      itemId: "item-1",
      productId: "product-1",
      productName: "Produk A",
      unit: "pcs",
      expectedQuantity: 10,
      receiptLines: [
        { receiptStatus: "APPROVED", lineStatus: "RECEIVED", receivedQuantity: 3 },
        { receiptStatus: "SUBMITTED", lineStatus: "PARTIAL", receivedQuantity: 2 },
        { receiptStatus: "SUBMITTED", lineStatus: "MISSING", receivedQuantity: 5 },
        { receiptStatus: "NEEDS_REVISION", lineStatus: "OVER_RECEIVED", receivedQuantity: 4 },
      ],
    },
  ];
}

function createRepository(
  receipt: InboundReceiptForApproval | null = submittedReceipt(),
): InventoryInboundReceiptRepository {
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
  };
}

describe("inbound receipt service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns receiving queue with approved, reserved, and remaining quantities", async () => {
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
    expect(result.items).toEqual([
      expect.objectContaining({
        shoppingRequestId: "shopping-1",
        itemId: "item-1",
        expectedQuantity: 10,
        approvedReceivedQuantity: 3,
        submittedReservedQuantity: 2,
        remainingQuantity: 5,
      }),
    ]);
  });

  it("marks invoices with active inbound receipts for the picker badge", async () => {
    const repository = createRepository();
    vi.mocked(repository.listReceivingQueue).mockResolvedValueOnce([
      {
        shoppingRequestId: "shopping-1",
        shoppingRequestNumber: "DPB-202606-001",
        supplierName: "Supplier A",
        itemId: "item-1",
        productId: "product-1",
        productName: "Produk A",
        unit: "pcs",
        expectedQuantity: 10,
        receiptLines: [
          { receiptStatus: "DRAFT", lineStatus: "RECEIVED", receivedQuantity: 2 },
          { receiptStatus: "NEEDS_REVISION", lineStatus: "PARTIAL", receivedQuantity: 3 },
          { receiptStatus: "REJECTED", lineStatus: "OVER_RECEIVED", receivedQuantity: 8 },
        ],
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

    expect(result.items[0]).toMatchObject({
      hasActiveReceipt: true,
      activeReceiptCount: 2,
      activeReceiptStatuses: ["DRAFT", "NEEDS_REVISION"],
      isFullyReceived: false,
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

  it("creates and submits an inbound receipt in one transaction", async () => {
    const repository = createRepository();

    const result = await createAndSubmitInboundReceipt({
      repository,
      user: {
        id: "inventory-1",
        name: "Ira",
        role: "INVENTORY",
        storeId: "store-main",
      },
      input: {
        shoppingRequestId: "shopping-1",
        lines: [
          {
            productId: "product-1",
            expectedQuantity: 10,
            receivedQuantity: 10,
            status: "RECEIVED",
          },
        ],
      },
    });

    expect(result.status).toBe("SUBMITTED");
    expect(repository.runInTransaction).toHaveBeenCalledTimes(1);
    expect(repository.createInboundReceiptDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        storeId: "store-main",
        createdBy: "inventory-1",
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
