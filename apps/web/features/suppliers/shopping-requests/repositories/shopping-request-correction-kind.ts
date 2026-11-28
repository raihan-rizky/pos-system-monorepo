import { Prisma } from "@pos/db";
import { normalizeCorrectionUnit } from "../helpers/shopping-request-correction";
import type { ShoppingRequestCorrectionInput } from "../types/shopping-request-correction";
import type { ShoppingRequestCorrectionEditor } from "./shopping-request-correction-editor";

/** Compare only fields that can change a purchase or its receipts. */
export function isPaymentOnlyCorrection(
  editor: ShoppingRequestCorrectionEditor,
  data: ShoppingRequestCorrectionInput,
): boolean {
  const header = (value: ShoppingRequestCorrectionInput["header"]) => [
    value.name, value.number, value.businessDate, value.supplierId, value.requestedByName, value.note,
  ];
  const items = (rows: ShoppingRequestCorrectionInput["items"]) => rows.map(item => JSON.stringify([
    item.clientLineKey, item.requestItemId, item.purchaseItemId, item.productId, normalizeCorrectionUnit(item.unit),
    item.requestedQty, item.approvedQty, item.orderedQty, new Prisma.Decimal(item.unitPrice).toFixed(2),
    item.receipts.map(receipt => [receipt.receiptLineId, receipt.receivedQty]).sort(
      (left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)),
    ),
  ])).sort();
  return data.catalog.length === 0 &&
    JSON.stringify(header(editor.header)) === JSON.stringify(header(data.header)) &&
    JSON.stringify(items(editor.items)) === JSON.stringify(items(data.items));
}

export function hasPaymentChanges(
  current: ShoppingRequestCorrectionEditor["payment"],
  next: ShoppingRequestCorrectionInput["payment"],
): boolean {
  if (next.corrections.length) return true;
  const schedule = (rows: NonNullable<ShoppingRequestCorrectionInput["payment"]["schedule"]>) =>
    rows.map(row => JSON.stringify([
      row.method, new Prisma.Decimal(row.amount).toFixed(2), row.dueDate, row.note?.trim() || null,
    ])).sort();
  const allocations = (rows: ShoppingRequestCorrectionInput["payment"]["allocations"]) =>
    rows.filter(row => !new Prisma.Decimal(row.amount).isZero()).map(row => JSON.stringify([
      row.sourceKind, row.paymentId, row.method, new Prisma.Decimal(row.amount).toFixed(2),
    ])).sort();
  if (JSON.stringify(allocations(current.allocations)) !== JSON.stringify(allocations(next.allocations))) return true;
  if (next.schedule) return JSON.stringify(schedule(current.schedule ?? [])) !== JSON.stringify(schedule(next.schedule));
  return current.method !== next.method || current.dueDate !== next.dueDate;
}
