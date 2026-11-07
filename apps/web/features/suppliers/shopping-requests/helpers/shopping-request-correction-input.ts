import { z } from "zod";
import type { ShoppingRequestCorrectionInput } from "../types/shopping-request-correction";

const id = z.string().trim().min(1).max(200);
const quantity = z.number().finite().nonnegative();
const money = z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/, "Nominal tidak valid.");
const date = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Tanggal tidak valid.");

const schema = z.object({
  idempotencyKey: id,
  expectedVersion: id,
  expectedPreviewVersion: id.optional(),
  reason: z.string().trim().min(1, "Alasan koreksi wajib diisi.").max(1000),
  header: z.object({
    name: z.string().trim().min(1).max(200),
    number: z.string().trim().min(1).max(100),
    businessDate: date,
    supplierId: id.nullable(),
    requestedByName: z.string().trim().max(200).nullable(),
    note: z.string().trim().max(5000).nullable(),
  }),
  items: z.array(z.object({
    clientLineKey: id,
    requestItemId: id.nullable(),
    purchaseItemId: id.nullable(),
    productId: id,
    unit: z.string().trim().min(1).max(100).nullable(),
    requestedQty: quantity,
    approvedQty: quantity.nullable(),
    orderedQty: quantity,
    unitPrice: money,
    receipts: z.array(z.object({ receiptLineId: id.nullable(), receivedQty: quantity })),
  })).min(1, "Daftar harus memiliki minimal satu barang."),
  payment: z.object({
    schedule: z.array(z.object({ method: z.enum(["TRANSFER", "GIRO"]), amount: money, dueDate: date.nullable(), note: z.string().trim().max(1000).nullable() })).min(1).max(100).optional(),
    method: z.enum(["TRANSFER", "GIRO"]).nullable(),
    dueDate: date.nullable(),
    allocations: z.array(z.object({ paymentId: id, sourceKind: z.enum(["TRANSFER_EXPENSE", "PAYABLE_PAYMENT"]), method: z.enum(["TRANSFER", "GIRO"]), amount: money })),
    corrections: z.array(z.object({ paymentId: id, sourceKind: z.enum(["TRANSFER_EXPENSE", "PAYABLE_PAYMENT"]), amount: money, paidAt: date })),
  }),
  catalog: z.array(z.object({
    productId: id,
    costPrice: money.nullable(),
    salePrice: money.nullable(),
    expectedUpdatedAt: z.string().refine((value) => Number.isFinite(Date.parse(value)), "Versi harga tidak valid."),
  })),
}).superRefine((value, context) => {
  const keys = new Set<string>();
  const products = new Set<string>();
  const requestItems = new Set<string>();
  const purchaseItems = new Set<string>();
  const receipts = new Set<string>();
  const duplicate = (set: Set<string>, value: string, path: (string | number)[]) => {
    if (set.has(value)) context.addIssue({ code: "custom", path, message: "Data yang sama tidak boleh dimasukkan dua kali." });
    set.add(value);
  };

  value.items.forEach((item, index) => {
    duplicate(keys, item.clientLineKey, ["items", index, "clientLineKey"]);
    duplicate(products, item.productId, ["items", index, "productId"]);
    if (item.requestItemId) duplicate(requestItems, item.requestItemId, ["items", index, "requestItemId"]);
    if (item.purchaseItemId) duplicate(purchaseItems, item.purchaseItemId, ["items", index, "purchaseItemId"]);
    let newReceipts = 0;
    let received = 0;
    for (const receipt of item.receipts) {
      if (receipt.receiptLineId) duplicate(receipts, receipt.receiptLineId, ["items", index, "receipts"]);
      else newReceipts += 1;
      received += receipt.receivedQty;
    }
    if (newReceipts > 1) context.addIssue({ code: "custom", path: ["items", index, "receipts"], message: "Jumlah penerimaan baru hanya boleh diisi sekali per barang." });
    const tolerance = Math.min(1e-9, Number.EPSILON * 8 * Math.max(1, received, item.orderedQty));
    if (!Number.isFinite(received) || received - item.orderedQty > tolerance) {
      context.addIssue({ code: "custom", path: ["items", index, "receipts"], message: "Jumlah diterima tidak boleh melebihi jumlah dipesan." });
    }
  });

  const allocations = new Set<string>();
  value.payment.allocations.forEach((payment, index) => duplicate(allocations, JSON.stringify([payment.sourceKind, payment.paymentId, payment.method]), ["payment", "allocations", index, "paymentId"]));
  const corrections = new Set<string>();
  value.payment.corrections.forEach((payment, index) => duplicate(corrections, JSON.stringify([payment.sourceKind, payment.paymentId]), ["payment", "corrections", index, "paymentId"]));
  const catalogProducts = new Set<string>();
  value.catalog.forEach((product, index) => duplicate(catalogProducts, product.productId, ["catalog", index, "productId"]));
});

export function parseShoppingRequestCorrection(value: unknown): ShoppingRequestCorrectionInput {
  return schema.parse(value);
}
