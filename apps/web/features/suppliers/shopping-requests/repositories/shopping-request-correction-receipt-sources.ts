import type { Prisma } from "@pos/db";
import { getInboundStockQuantity } from "@/features/inventory-management/helpers/inbound-receipt-rules";
import { effectiveReceivedQuantities } from "../helpers/shopping-request-correction";
import type { ExistingCorrectionReceiptLine } from "../helpers/shopping-request-correction-lines";
import { loadCorrectedReceiptTotals } from "./received-quantity-repository";

export async function loadCorrectionReceiptSources(
  tx: Prisma.TransactionClient,
  input: { storeId: string; purchaseId: string },
): Promise<ExistingCorrectionReceiptLine[]> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "pos_goods_purchases"
    WHERE "id" = ${input.purchaseId} AND "storeId" = ${input.storeId} AND "status" = 'APPROVED'
    FOR UPDATE
  `;
  if (locked.length !== 1) throw new Error("Pembelian tidak tersedia di toko ini.");
  const purchase = await tx.goodsPurchase.findFirst({
    where: { id: input.purchaseId, storeId: input.storeId, status: "APPROVED" },
    select: { id: true, shoppingRequestId: true, items: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, shoppingRequestItemId: true, productId: true } } },
  });
  if (!purchase) throw new Error("Pembelian tidak tersedia di toko ini.");
  const items = purchase.items.map((item) => ({ id: item.id, purchaseId: purchase.id, requestId: purchase.shoppingRequestId }));
  // The shared reader validates the receipt bundle, ownership, and movement sources.
  const totals = await loadCorrectedReceiptTotals(tx, input.storeId, items);
  const itemIds = items.map((item) => item.id);
  if (!itemIds.length) return [];
  const [receipts, movements] = await Promise.all([
    tx.inventoryInboundReceiptLine.findMany({
      where: { goodsPurchaseItemId: { in: itemIds }, receipt: { storeId: input.storeId, goodsPurchaseId: purchase.id, status: "APPROVED" } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, goodsPurchaseItemId: true, status: true, receivedQuantity: true },
    }),
    tx.shoppingRequestCorrectionMovement.findMany({
      where: { goodsPurchaseItemId: { in: itemIds }, correction: { storeId: input.storeId, shoppingRequestId: purchase.shoppingRequestId } },
      select: { goodsPurchaseItemId: true, receiptLineId: true, oldReceivedQty: true, newReceivedQty: true },
    }),
  ]);

  return purchase.items.map((item) => {
    const itemReceipts = receipts.filter((receipt) => receipt.goodsPurchaseItemId === item.id);
    const itemMovements = movements.filter((movement) => movement.goodsPurchaseItemId === item.id).map((movement) => ({
      purchaseItemId: item.id, receiptLineId: movement.receiptLineId, oldReceivedQty: movement.oldReceivedQty, newReceivedQty: movement.newReceivedQty,
    }));
    const sources: ExistingCorrectionReceiptLine["receipts"] = itemReceipts.map((receipt) => {
      const received = getInboundStockQuantity({ status: receipt.status, receivedQuantity: receipt.receivedQuantity });
      const [effective] = effectiveReceivedQuantities(
        [{ receiptLineId: receipt.id, purchaseItemId: item.id, receivedQty: received }],
        itemMovements.filter((movement) => movement.receiptLineId === receipt.id),
      );
      return { receiptLineId: receipt.id, receivedQty: effective.receivedQty };
    });
    const addedMovements = itemMovements.filter((movement) => movement.receiptLineId === null);
    if (addedMovements.length) {
      const [effective] = effectiveReceivedQuantities([], addedMovements);
      sources.push({ receiptLineId: null, receivedQty: effective.receivedQty });
    }
    const sum = sources.reduce((total, source) => total + source.receivedQty, 0);
    if (Math.abs(sum - (totals.get(item.id) ?? 0)) > 1e-9) throw new Error("Jumlah penerimaan berubah. Muat ulang dan coba lagi.");
    return { requestItemId: item.shoppingRequestItemId, purchaseItemId: item.id, productId: item.productId, receipts: sources };
  });
}
