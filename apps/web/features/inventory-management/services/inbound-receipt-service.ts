import {
  getInboundStockQuantity,
  requiresInboundLineNote,
} from "../helpers/inbound-receipt-rules";
import type {
  CreateInboundReceiptDraftInput,
  InboundReceiptLineStatus,
  InboundReceiptMutationResult,
  InventoryInboundReceiptRepository,
  InventoryManagementUser,
  ReceivingQueueResult,
} from "../types/inventory-management";

export class InventoryManagementError extends Error {
  constructor(
    public readonly code:
      | "STORE_REQUIRED"
      | "NOT_FOUND"
      | "CONFLICT"
      | "INVALID_RECEIPT_LINE"
      | "VALIDATION_ERROR",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "InventoryManagementError";
  }
}

interface InboundReceiptServiceInput {
  repository: InventoryInboundReceiptRepository;
  user: InventoryManagementUser & { name?: string | null };
  receiptId: string;
}

interface RejectInboundReceiptInput extends InboundReceiptServiceInput {
  rejectionReason: string;
}

interface NeedsRevisionInboundReceiptInput extends InboundReceiptServiceInput {
  revisionReason: string;
}

export interface GetReceivingQueueInput {
  repository: InventoryInboundReceiptRepository;
  user: InventoryManagementUser & { name?: string | null };
  input?: { search?: string | null; take?: number };
}

export interface CreateInboundReceiptServiceInput {
  repository: InventoryInboundReceiptRepository;
  user: InventoryManagementUser & { name?: string | null };
  input: {
    supplierId?: string | null;
    shoppingRequestId?: string | null;
    note?: string | null;
    lines: Array<{
      productId: string;
      shoppingRequestItemId?: string | null;
      expectedQuantity: number;
      receivedQuantity: number;
      status: InboundReceiptLineStatus;
      note?: string | null;
    }>;
  };
}

function requireStoreId(user: InventoryManagementUser): string {
  if (!user.storeId) {
    throw new InventoryManagementError(
      "STORE_REQUIRED",
      "Inventory workflow requires a store-scoped user",
      403,
    );
  }
  return user.storeId;
}

function ensureSubmitted(status: string): void {
  if (status !== "SUBMITTED") {
    throw new InventoryManagementError(
      "CONFLICT",
      `Inbound receipt is ${status}`,
      409,
    );
  }
}

export async function getReceivingQueue(
  input: GetReceivingQueueInput,
): Promise<ReceivingQueueResult> {
  const storeId = requireStoreId(input.user);
  const rows = await input.repository.listReceivingQueue(storeId, input.input ?? {});

  return {
    items: rows.map((row) => {
      const approvedReceivedQuantity = row.receiptLines
        .filter((line) => line.receiptStatus === "APPROVED")
        .reduce(
          (total, line) =>
            total +
            getInboundStockQuantity({
              status: line.lineStatus,
              receivedQuantity: line.receivedQuantity,
            }),
          0,
        );
      const submittedReservedQuantity = row.receiptLines
        .filter((line) => line.receiptStatus === "SUBMITTED")
        .reduce(
          (total, line) =>
            total +
            getInboundStockQuantity({
              status: line.lineStatus,
              receivedQuantity: line.receivedQuantity,
            }),
          0,
        );

      return {
        shoppingRequestId: row.shoppingRequestId,
        shoppingRequestNumber: row.shoppingRequestNumber,
        supplierName: row.supplierName,
        itemId: row.itemId,
        productId: row.productId,
        productName: row.productName,
        unit: row.unit,
        expectedQuantity: row.expectedQuantity,
        approvedReceivedQuantity,
        submittedReservedQuantity,
        remainingQuantity: Math.max(
          0,
          row.expectedQuantity - approvedReceivedQuantity - submittedReservedQuantity,
        ),
      };
    }),
  };
}

export async function approveInboundReceipt(
  input: InboundReceiptServiceInput,
): Promise<InboundReceiptMutationResult> {
  const storeId = requireStoreId(input.user);

  try {
    return await input.repository.runInTransaction(async (tx) => {
      const receipt = await input.repository.findReceiptForApproval(tx, {
        storeId,
        receiptId: input.receiptId,
      });
      if (!receipt) {
        throw new InventoryManagementError(
          "NOT_FOUND",
          "Inbound receipt not found",
          404,
        );
      }
      if (receipt.status === "APPROVED") {
        return { id: receipt.id, status: "APPROVED" };
      }

      ensureSubmitted(receipt.status);

      const lineLogIds: Array<{ lineId: string; inventoryLogId: string }> = [];
      for (const line of receipt.lines) {
        const stockQuantity = getInboundStockQuantity({
          status: line.status,
          receivedQuantity: line.receivedQuantity,
        });
        if (stockQuantity <= 0) continue;
        if (!line.productIsActive || line.latestCostPrice === null || line.latestCostPrice <= 0) {
          throw new InventoryManagementError(
            "INVALID_RECEIPT_LINE",
            "Inbound receipt line is not eligible for approval",
            422,
          );
        }

        await input.repository.applyProductStockDelta(tx, {
          storeId,
          productId: line.productId,
          delta: stockQuantity,
        });
        const log = await input.repository.createInboundStockLog(tx, {
          productId: line.productId,
          quantity: stockQuantity,
          unitCost: line.latestCostPrice,
          supplierId: receipt.supplierId,
          createdBy: input.user.id,
          person: input.user.name ?? null,
          note: `Inbound receipt ${receipt.id}`,
        });
        lineLogIds.push({ lineId: line.id, inventoryLogId: log.id });
      }

      return input.repository.markReceiptApproved(tx, {
        storeId,
        receiptId: receipt.id,
        approvedBy: input.user.id,
        approvedAt: new Date(),
        lineLogIds,
      });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INBOUND_RECEIPT_CONFLICT") {
      throw new InventoryManagementError(
        "CONFLICT",
        "Inbound receipt status changed before approval",
        409,
      );
    }
    throw error;
  }
}

export async function submitInboundReceipt(
  input: InboundReceiptServiceInput,
): Promise<InboundReceiptMutationResult> {
  const storeId = requireStoreId(input.user);
  try {
    return await input.repository.runInTransaction((tx) =>
      input.repository.markReceiptSubmitted(tx, {
        storeId,
        receiptId: input.receiptId,
        submittedBy: input.user.id,
        submittedAt: new Date(),
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INBOUND_RECEIPT_CONFLICT") {
      throw new InventoryManagementError(
        "CONFLICT",
        "Inbound receipt status changed before submission",
        409,
      );
    }
    throw error;
  }
}

export async function rejectInboundReceipt(
  input: RejectInboundReceiptInput,
): Promise<InboundReceiptMutationResult> {
  const storeId = requireStoreId(input.user);
  const rejectionReason = input.rejectionReason.trim();
  if (!rejectionReason) {
    throw new InventoryManagementError(
      "VALIDATION_ERROR",
      "Rejection reason is required",
      422,
    );
  }

  return input.repository.runInTransaction((tx) =>
    input.repository.markReceiptRejected(tx, {
      storeId,
      receiptId: input.receiptId,
      rejectedBy: input.user.id,
      rejectionReason,
    }),
  );
}

export async function needsRevisionInboundReceipt(
  input: NeedsRevisionInboundReceiptInput,
): Promise<InboundReceiptMutationResult> {
  const storeId = requireStoreId(input.user);
  const revisionReason = input.revisionReason.trim();
  if (!revisionReason) {
    throw new InventoryManagementError(
      "VALIDATION_ERROR",
      "Revision reason is required",
      422,
    );
  }

  try {
    return await input.repository.runInTransaction((tx) =>
      input.repository.markReceiptNeedsRevision(tx, {
        storeId,
        receiptId: input.receiptId,
        revisedBy: input.user.id,
        revisionReason,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "INBOUND_RECEIPT_CONFLICT") {
      throw new InventoryManagementError(
        "CONFLICT",
        "Inbound receipt status changed before revision",
        409,
      );
    }
    throw error;
  }
}

export async function createInboundReceipt(
  input: CreateInboundReceiptServiceInput,
): Promise<InboundReceiptMutationResult> {
  const storeId = requireStoreId(input.user);
  if (input.input.lines.length === 0) {
    throw new InventoryManagementError(
      "VALIDATION_ERROR",
      "Inbound receipt requires at least one line",
      422,
    );
  }

  const lines: CreateInboundReceiptDraftInput["lines"] = input.input.lines.map(
    (line) => {
      if (
        line.expectedQuantity <= 0 ||
        line.receivedQuantity < 0 ||
        !Number.isFinite(line.expectedQuantity) ||
        !Number.isFinite(line.receivedQuantity)
      ) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Inbound receipt quantities are invalid",
          422,
        );
      }
      const note = line.note?.trim() || null;
      if (requiresInboundLineNote(line.status) && !note) {
        throw new InventoryManagementError(
          "VALIDATION_ERROR",
          "Inbound receipt line note is required",
          422,
        );
      }

      return {
        productId: line.productId,
        shoppingRequestItemId: line.shoppingRequestItemId ?? null,
        expectedQuantity: line.expectedQuantity,
        receivedQuantity: line.receivedQuantity,
        status: line.status,
        note,
      };
    },
  );

  return input.repository.runInTransaction((tx) =>
    input.repository.createInboundReceiptDraft(tx, {
      storeId,
      createdBy: input.user.id,
      supplierId: input.input.supplierId ?? null,
      shoppingRequestId: input.input.shoppingRequestId ?? null,
      note: input.input.note?.trim() || null,
      lines,
    }),
  );
}
