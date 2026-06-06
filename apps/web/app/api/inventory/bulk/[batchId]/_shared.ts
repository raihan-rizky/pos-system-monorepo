import { Prisma } from "@pos/db";

import { productSnapshot, stockDelta } from "@/features/batch-operations/helpers/snapshots";
import { summarizeBulkApprovalBundle } from "@/features/bulk-stock-approval/helpers/bundle-status";
import { apiError } from "@/lib/api/responses";

type Tx = Prisma.TransactionClient;
type InventoryLogStatus = "PENDING" | "APPROVED" | "REJECTED";

export function computeAfterStock(
  type: "IN" | "OUT" | "ADJUSTMENT",
  currentStock: number,
  quantity: number,
) {
  return currentStock + stockDelta(type, currentStock, quantity);
}

export async function findBulkBatch(tx: Tx, batchId: string) {
  const batch = await tx.batchOperation.findUnique({
    where: { id: batchId },
    include: {
      items: {
        include: {
          product: true,
        },
      },
    },
  });

  if (!batch || batch.type !== "BULK_STOCK_ADJUSTMENT") {
    throw new Error("BATCH_NOT_FOUND");
  }

  return batch;
}

export async function updateBatchDecisionStatus(
  tx: Tx,
  batch: Awaited<ReturnType<typeof findBulkBatch>>,
  override?: { inventoryLogId: string; status: InventoryLogStatus },
) {
  const inventoryLogIds = batch.items
    .map((item) => item.inventoryLogId)
    .filter((id): id is string => Boolean(id));
  const logs = inventoryLogIds.length
    ? await tx.inventoryLog.findMany({
        where: { id: { in: inventoryLogIds } },
        select: { id: true, status: true },
      })
    : [];
  const statusById = new Map(logs.map((log) => [log.id, log.status as InventoryLogStatus]));
  if (override) statusById.set(override.inventoryLogId, override.status);

  const statuses = inventoryLogIds.map((id) => ({
    status: statusById.get(id) ?? "PENDING",
  }));
  const summary = summarizeBulkApprovalBundle(statuses);

  await tx.batchOperation.update({
    where: { id: batch.id },
    data: {
      status: summary.status,
      summary: {
        ...(typeof batch.summary === "object" && batch.summary !== null
          ? (batch.summary as Record<string, unknown>)
          : {}),
        ...summary,
      },
    },
  });

  return summary;
}

export function findBatchLogItem(
  batch: Awaited<ReturnType<typeof findBulkBatch>>,
  inventoryLogId: string,
) {
  const item = batch.items.find((candidate) => candidate.inventoryLogId === inventoryLogId);
  if (!item) throw new Error("LOG_NOT_IN_BATCH");
  return item;
}

export async function approvePendingBulkLog(
  tx: Tx,
  input: {
    batchId: string;
    inventoryLogId: string;
    approverId: string;
    approverName: string | null | undefined;
    skipBatchStatusUpdate?: boolean;
  },
) {
  const batch = await findBulkBatch(tx, input.batchId);
  const item = findBatchLogItem(batch, input.inventoryLogId);
  const log = await tx.inventoryLog.findUnique({ where: { id: input.inventoryLogId } });
  if (!log) throw new Error("LOG_NOT_FOUND");
  if (log.status !== "PENDING") throw new Error(`ALREADY_DECIDED:${log.status}`);

  const product = await tx.product.findUnique({ where: { id: log.productId } });
  if (!product) throw new Error("PRODUCT_NOT_FOUND");

  const afterStock = computeAfterStock(log.type, product.stock, log.quantity);
  if (afterStock < 0) throw new Error(`NEGATIVE_STOCK:${product.stock}:${Math.abs(log.quantity)}`);

  const updatedProduct = await tx.product.update({
    where: { id: product.id },
    data: { stock: afterStock },
  });
  const updatedLog = await tx.inventoryLog.update({
    where: { id: log.id },
    data: {
      status: "APPROVED",
      approvedBy: input.approverId,
      approverName: input.approverName,
      decidedAt: new Date(),
    },
  });

  await tx.batchOperationItem.update({
    where: { id: item.id },
    data: {
      afterSnapshot: productSnapshot(updatedProduct) as unknown as Prisma.InputJsonValue,
    },
  });

  let batchSummary = null;
  if (!input.skipBatchStatusUpdate) {
    batchSummary = await updateBatchDecisionStatus(tx, batch, {
      inventoryLogId: log.id,
      status: "APPROVED",
    });
  }

  return { log: updatedLog, batchStatus: batchSummary?.status ?? "PENDING", batchSummary };
}

export async function rejectPendingBulkLog(
  tx: Tx,
  input: {
    batchId: string;
    inventoryLogId: string;
    approverId: string;
    approverName: string | null | undefined;
    reason: string;
    skipBatchStatusUpdate?: boolean;
  },
) {
  const batch = await findBulkBatch(tx, input.batchId);
  findBatchLogItem(batch, input.inventoryLogId);
  const log = await tx.inventoryLog.findUnique({ where: { id: input.inventoryLogId } });
  if (!log) throw new Error("LOG_NOT_FOUND");
  if (log.status !== "PENDING") throw new Error(`ALREADY_DECIDED:${log.status}`);

  const updatedLog = await tx.inventoryLog.update({
    where: { id: log.id },
    data: {
      status: "REJECTED",
      approvedBy: input.approverId,
      approverName: input.approverName,
      decidedAt: new Date(),
      rejectionReason: input.reason,
    },
  });
  let batchSummary = null;
  if (!input.skipBatchStatusUpdate) {
    batchSummary = await updateBatchDecisionStatus(tx, batch, {
      inventoryLogId: log.id,
      status: "REJECTED",
    });
  }

  return { log: updatedLog, batchStatus: batchSummary?.status ?? "PENDING", batchSummary };
}

export function mapBulkRequestError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    if (
      error.message === "BATCH_NOT_FOUND" ||
      error.message === "LOG_NOT_FOUND" ||
      error.message === "LOG_NOT_IN_BATCH" ||
      error.message === "PRODUCT_NOT_FOUND"
    ) {
      return apiError("Permintaan tidak ditemukan", 404, { code: "NotFound" });
    }
    if (error.message.startsWith("ALREADY_DECIDED:")) {
      return apiError("Permintaan sudah diputuskan", 409, {
        code: "Conflict",
        extra: { currentStatus: error.message.split(":")[1] },
      });
    }
    if (error.message.startsWith("NEGATIVE_STOCK:")) {
      const [, available, requested] = error.message.split(":");
      return apiError("Stok tidak mencukupi", 422, {
        code: "ValidationError",
        errors: { stock: ["Stok tidak mencukupi"] },
        extra: {
          available: Number(available),
          requested: Number(requested),
        },
      });
    }
  }

  return apiError(fallback, 500, { code: "InternalError" });
}
