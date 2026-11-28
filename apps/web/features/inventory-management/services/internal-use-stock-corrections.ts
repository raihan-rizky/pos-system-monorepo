import type { Prisma } from "@pos/db";
import { applyProductStockDeltas, StockMutationError } from "@/features/product-stock-groups/stock-mutations";
import type { InternalUseStock } from "../helpers/internal-use-log";
import { calculateOutLogCorrectionMovements, jakartaDateKey } from "../helpers/inventory-management-rules";

export async function lockInventoryLogForCorrection(
  tx: Prisma.TransactionClient,
  storeId: string,
  id: string,
) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT logs."id"
    FROM "pos_inventory_logs" AS logs
    INNER JOIN "pos_products" AS products ON products."id" = logs."productId"
    WHERE logs."id" = ${id} AND products."storeId" = ${storeId}
    FOR UPDATE OF logs
  `;
  return rows.length > 0;
}

export async function isInventoryCorrectionDayLocked(
  tx: Prisma.TransactionClient,
  storeId: string,
  createdAt: Date,
) {
  const periodKey = jakartaDateKey(createdAt);
  const [matching, day] = await Promise.all([
    tx.inventoryTask.findUnique({
      where: { storeId_type_periodKey: { storeId, type: "DAILY_STOCK_MATCHING", periodKey } },
      select: { status: true },
    }),
    tx.inventoryDaySession.findUnique({
      where: { storeId_periodKey: { storeId, periodKey } },
      select: { status: true },
    }),
  ]);
  return matching?.status === "SUBMITTED" || day?.status === "CHECKED_OUT";
}

export async function recordInternalUseCorrectionMovements(
  tx: Prisma.TransactionClient,
  input: {
    storeId: string;
    sourceId: string;
    correctionId: string;
    from: InternalUseStock;
    to: InternalUseStock;
    note: string | null;
    requestedBy: string;
    approvedBy: string;
    approverName: string | null;
    decidedAt: Date;
  },
) {
  const movements = calculateOutLogCorrectionMovements({
    originalProductId: input.from.productId,
    originalQuantity: input.from.quantity,
    correctedProductId: input.to.productId,
    correctedQuantity: input.to.quantity,
  });
  if (!movements.length) return;

  const stockChanges = await applyProductStockDeltas(tx, {
    storeId: input.storeId,
    items: movements.map(({ productId, delta }) => ({ productId, delta })),
    allowNegative: true,
  });

  // The shared writer locks rows in ID order. An exchange can briefly debit a
  // group before its reversal is added, so validate each balance at the end.
  const closingStocks = new Map<string, { productId: string; remaining: number; netDelta: number }>();
  for (const change of stockChanges) {
    const key = change.stockGroupId ? `group:${change.stockGroupId}` : `product:${change.productId}`;
    const netDelta = (closingStocks.get(key)?.netDelta ?? 0) + change.baseDelta;
    closingStocks.set(key, { productId: change.productId, remaining: change.afterStock, netDelta });
  }
  for (const { productId, remaining, netDelta } of closingStocks.values()) {
    if (netDelta < 0 && remaining < 0) {
      throw new StockMutationError("INSUFFICIENT_STOCK", { productId });
    }
  }

  for (const movement of movements) {
    const log = await tx.inventoryLog.create({
      data: {
        productId: movement.productId,
        type: "ADJUSTMENT",
        reason: "MANUAL_ADJUSTMENT",
        quantity: movement.delta,
        unitCost: movement.kind === "REPLACEMENT" ? input.to.unitCost : input.from.unitCost,
        note: `Koreksi Pemakaian Internal ${input.sourceId}: ${input.note ?? "Koreksi data"}`,
        createdBy: input.requestedBy,
        status: "APPROVED",
        approvedBy: input.approvedBy,
        approverName: input.approverName,
        decidedAt: input.decidedAt,
      },
      select: { id: true },
    });
    await tx.inventoryLogCorrectionMovement.create({
      data: { correctionRequestId: input.correctionId, inventoryLogId: log.id, kind: movement.kind },
    });
  }
}
