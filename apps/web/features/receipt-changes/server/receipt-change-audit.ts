import type { Prisma } from "@pos/db";
import type { ReceiptChangeSnapshot } from "../types";

type Actor = { id: string; name?: string | null; role?: string | null };

// IDs inside the printing document identify editor rows; they are not receipt content.
function comparable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "id" && key !== "columnWidths")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, comparable(item)]),
    );
  }
  return value;
}

function equal(left: unknown, right: unknown) {
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

export function shouldRecordReceiptChange(actor: Actor, status: string) {
  return actor.role === "SALES" && (status === "COMPLETED" || status === "DP");
}

export async function captureReceiptSnapshot(
  tx: Prisma.TransactionClient,
  storeId: string,
  transactionId: string,
): Promise<ReceiptChangeSnapshot> {
  const row = await tx.transaction.findFirstOrThrow({
    where: { id: transactionId, storeId },
    include: {
      items: { include: { product: { select: { unit: true } }, printingService: { select: { unit: true } } } },
      payments: true,
      debtPaymentLogs: true,
      printingReceipt: { select: { number: true, subcategory: true, document: true } },
    },
  });

  const items = row.items.map((item) => ({
    productId: item.productId,
    productName: item.productName,
    documentName: item.documentName,
    quantity: item.quantity,
    unit: item.product?.unit || item.printingService?.unit || item.rawMaterialUnit || "pcs",
    unitPrice: Number(item.unitPrice),
    appliedUnitPrice: Number(item.appliedUnitPrice ?? item.unitPrice),
    originalUnitPrice: item.originalUnitPrice === null ? null : Number(item.originalUnitPrice),
    discount: Number(item.discount),
    subtotal: Number(item.subtotal),
    material: item.material,
    size: item.size,
    serviceNote: item.serviceNote,
    rawMaterialProductId: item.rawMaterialProductId,
    rawMaterialQuantity: item.rawMaterialQuantity,
    rawMaterialUnit: item.rawMaterialUnit,
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const payments = row.payments.map((payment) => ({
    method: payment.method,
    amount: Number(payment.amount),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const debtPayments = row.debtPaymentLogs.map((payment) => ({
    method: payment.paymentMethod,
    amount: Number(payment.amount),
  })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));

  return {
    invoiceNumber: row.invoiceNumber,
    invoiceDate: row.invoiceDate.toISOString(),
    customerId: row.customerId,
    customerName: row.customerName,
    salespersonId: row.salespersonId,
    salesName: row.salesName,
    note: row.note,
    status: row.status,
    paymentMethod: row.paymentMethod,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount),
    tax: Number(row.tax),
    taxRate: row.taxRate === null ? null : Number(row.taxRate),
    taxMethod: row.taxMethod,
    total: Number(row.total),
    amountPaid: Number(row.amountPaid),
    change: Number(row.change),
    payments,
    debtPayments,
    items,
    printingReceipt: row.printingReceipt,
  };
}

function changedSections(before: ReceiptChangeSnapshot, after: ReceiptChangeSnapshot) {
  const sections: Array<[string, unknown, unknown]> = [
    ["nomor nota", before.invoiceNumber, after.invoiceNumber],
    ["tanggal nota", before.invoiceDate, after.invoiceDate],
    ["pelanggan", [before.customerId, before.customerName], [after.customerId, after.customerName]],
    ["sales", [before.salespersonId, before.salesName], [after.salespersonId, after.salesName]],
    ["produk", before.items, after.items],
    ["pajak", [before.tax, before.taxRate, before.taxMethod], [after.tax, after.taxRate, after.taxMethod]],
    ["jumlah", [before.subtotal, before.discount, before.total], [after.subtotal, after.discount, after.total]],
    ["pembayaran", [before.status, before.paymentMethod, before.amountPaid, before.change, before.payments, before.debtPayments], [after.status, after.paymentMethod, after.amountPaid, after.change, after.payments, after.debtPayments]],
    ["catatan", before.note, after.note],
    ["dokumen percetakan", before.printingReceipt, after.printingReceipt],
  ];
  return sections.filter(([, left, right]) => !equal(left, right)).map(([label]) => label);
}

export async function recordReceiptChange(
  tx: Prisma.TransactionClient,
  input: { storeId: string; transactionId: string; actor: Actor; before: ReceiptChangeSnapshot },
) {
  if (!shouldRecordReceiptChange(input.actor, input.before.status)) return null;
  const after = await captureReceiptSnapshot(tx, input.storeId, input.transactionId);
  const sections = changedSections(input.before, after);
  if (sections.length === 0) return null;

  const actorName = input.actor.name?.trim() || "Sales";
  const entry = await tx.transactionReceiptChange.create({
    data: {
      storeId: input.storeId,
      transactionId: input.transactionId,
      invoiceNumber: input.before.invoiceNumber,
      actorId: input.actor.id,
      actorName,
      before: input.before as unknown as Prisma.InputJsonValue,
      after: after as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  });

  const owners = await tx.user.findMany({
    where: {
      role: "OWNER",
      isActive: true,
      ...(input.storeId === "store-main"
        ? { OR: [{ storeId: input.storeId }, { storeId: null }] }
        : { storeId: input.storeId }),
    },
    select: { id: true },
  });
  if (owners.length > 0) {
    const number = input.before.invoiceNumber || input.transactionId;
    const summary = sections.slice(0, 4).join(", ") + (sections.length > 4 ? ", dan lainnya" : "");
    await tx.notification.createMany({
      data: owners.map(({ id }) => ({
        userId: id,
        storeId: input.storeId,
        eventName: "transaction.receipt_changed_by_sales",
        title: "Nota diubah oleh Sales",
        body: `${actorName} mengubah nota ${number}: ${summary}.`,
        url: `/history/receipt-changes/${encodeURIComponent(input.transactionId)}?change=${encodeURIComponent(entry.id)}`,
        tag: entry.id,
      })),
      skipDuplicates: true,
    });
  }
  return entry;
}
