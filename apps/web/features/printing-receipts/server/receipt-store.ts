import { db, Prisma } from "@pos/db";
import type { Transaction } from "@/hooks/useTransactions";
import { buildPaginationMeta, type PaginationParams } from "@/lib/api/responses";
import {
  createEmptyPrintingReceiptDocument, parsePrintingReceiptDocument, parsePrintingReceiptNumber,
  parsePrintingSubcategory, PrintingReceiptValidationError,
} from "../domain";
import type { PrintingReceipt, PrintingReceiptDocument, PrintingSubcategory } from "../types";

export class PrintingReceiptStorageError extends Error {
  constructor(public readonly status: 404 | 409, message: string) {
    super(message);
    this.name = "PrintingReceiptStorageError";
  }
}

const include = {
  transaction: { include: {
    cashier: { select: { name: true } }, salesperson: { select: { name: true } },
    payments: { select: { amount: true, method: true } },
    debtPaymentLogs: { select: { id: true, amount: true, paymentMethod: true, createdAt: true }, orderBy: { createdAt: "desc" as const } },
    items: { include: { product: { select: { unit: true, imageUrl: true, category: { select: { name: true } } } }, printingService: { select: { unit: true } } } },
  } },
} satisfies Prisma.PrintingReceiptInclude;
type ReceiptRow = Prisma.PrintingReceiptGetPayload<{ include: typeof include }>;
type Tx = Prisma.TransactionClient;

function serializeTransaction(transaction: NonNullable<ReceiptRow["transaction"]>): Transaction {
  return {
    ...transaction,
    transactionCategory: transaction.transactionCategory === "ATK" || transaction.transactionCategory === "PERCETAKAN"
      ? transaction.transactionCategory : null,
    printingSubcategory: transaction.printingSubcategory ? parsePrintingSubcategory(transaction.printingSubcategory) : null,
    subtotal: Number(transaction.subtotal), discount: Number(transaction.discount), tax: Number(transaction.tax),
    taxRate: transaction.taxRate === null || transaction.taxRate === undefined ? null : Number(transaction.taxRate),
    taxMethod: transaction.taxMethod === "DPP_NILAI_LAIN" ? "DPP_NILAI_LAIN" : "STANDARD",
    total: Number(transaction.total), amountPaid: Number(transaction.amountPaid), change: Number(transaction.change),
    invoiceDate: transaction.invoiceDate.toISOString(), createdAt: transaction.createdAt.toISOString(),
    payments: transaction.payments.map(payment => ({ ...payment, amount: Number(payment.amount) })),
    debtPaymentLogs: transaction.debtPaymentLogs.map(payment => ({ ...payment, amount: Number(payment.amount), createdAt: payment.createdAt.toISOString() })),
    items: transaction.items.map(item => ({
      ...item, unitPrice: Number(item.unitPrice), discount: Number(item.discount), subtotal: Number(item.subtotal),
      pricingValue: item.pricingValue === null ? null : Number(item.pricingValue),
      pricingDiscountPercent: item.pricingDiscountPercent === null ? null : Number(item.pricingDiscountPercent),
      originalUnitPrice: item.originalUnitPrice === null ? null : Number(item.originalUnitPrice),
      appliedUnitPrice: item.appliedUnitPrice === null ? null : Number(item.appliedUnitPrice),
    })),
  };
}

function serializeReceipt(row: ReceiptRow): PrintingReceipt {
  const document = parsePrintingReceiptDocument(row.document);
  return {
    id: row.id, storeId: row.storeId, subcategory: parsePrintingSubcategory(row.subcategory), number: row.number,
    revision: row.revision, document: { ...document, title: document.title || row.number }, transactionId: row.transactionId,
    transaction: row.transaction ? serializeTransaction(row.transaction) : null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

function notFound(): never { throw new PrintingReceiptStorageError(404, "Nota tidak ditemukan di toko ini."); }
function conflict(): never { throw new PrintingReceiptStorageError(409, "Nota sudah berubah atau diproses. Muat ulang nota sebelum melanjutkan."); }
function numberConflict(): never { throw new PrintingReceiptStorageError(409, "Nomor nota sudah digunakan. Pilih nomor yang lain."); }

function isUniqueConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

async function assertNumberAvailable(tx: Tx, number: string, receiptId?: string) {
  const existingReceipt = await tx.printingReceipt.findUnique({ where: { number }, select: { id: true } });
  if (existingReceipt && existingReceipt.id !== receiptId) numberConflict();
  const existingInvoice = await tx.transaction.findUnique({ where: { invoiceNumber: number }, select: { id: true } });
  if (existingInvoice) numberConflict();
}

async function assertDocumentReferences(tx: Tx, storeId: string, document: PrintingReceiptDocument) {
  if (document.customerId) {
    const customer = await tx.customer.findFirst({ where: { id: document.customerId, storeId }, select: { id: true } });
    if (!customer) throw new PrintingReceiptValidationError("Pelanggan tidak ditemukan di toko ini. Pilih ulang pelanggan.");
  }
  const links = document.lines.flatMap(line => line.stockLink ? [line.stockLink] : []);
  const ids = [...new Set(links.map(link => link.productId))];
  if (!ids.length) return;
  const products = await tx.product.findMany({ where: { id: { in: ids }, storeId, isActive: true }, select: { id: true, unit: true } });
  const byId = new Map(products.map(product => [product.id, product]));
  for (const link of links) {
    const product = byId.get(link.productId);
    if (!product) throw new PrintingReceiptValidationError("Bahan stok tidak tersedia di toko ini. Pilih ulang bahan stok.");
    if (link.unit.trim().toLowerCase() !== product.unit.trim().toLowerCase()) {
      throw new PrintingReceiptValidationError(`Satuan bahan stok harus ${product.unit}. Pilih ulang bahan stok.`);
    }
  }
}

export async function listPrintingReceipts(storeId: string, input: PaginationParams & { subcategory: PrintingSubcategory; search: string }) {
  const where: Prisma.PrintingReceiptWhereInput = { storeId, subcategory: input.subcategory };
  if (input.search) where.OR = [
    { number: { contains: input.search, mode: "insensitive" } },
    { document: { path: ["title"], string_contains: input.search, mode: "insensitive" } },
    { document: { path: ["customerName"], string_contains: input.search, mode: "insensitive" } },
    { document: { path: ["customerPhone"], string_contains: input.search } },
  ];
  const [rows, total] = await Promise.all([
    db.printingReceipt.findMany({ where, include, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], skip: input.skip, take: input.limit }),
    db.printingReceipt.count({ where }),
  ]);
  return { data: rows.map(serializeReceipt), pagination: buildPaginationMeta(total, input.page, input.limit) };
}

export async function getPrintingReceipt(storeId: string, id: string): Promise<PrintingReceipt> {
  const row = await db.printingReceipt.findFirst({ where: { id, storeId }, include });
  if (!row) notFound();
  return serializeReceipt(row);
}

const prefixes: Record<PrintingSubcategory, string> = { SPANDUK: "SP", PERCETAKAN: "CT", PLAT: "PL", STEMPEL: "ST", PRINT: "PR" };

export async function createPrintingReceipt(storeId: string, createdById: string, subcategory: PrintingSubcategory): Promise<PrintingReceipt> {
  const document = createEmptyPrintingReceiptDocument();
  const day = document.date.replaceAll("-", "");
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const row = await db.$transaction(async tx => {
        for (let collision = 0; collision < 100; collision++) {
          const counter = await tx.printingReceiptCounter.upsert({ where: { key: day }, create: { key: day, value: 1 }, update: { value: { increment: 1 } } });
          const number = `NT-${prefixes[subcategory]}-${day}-${String(counter.value).padStart(6, "0")}`;
          try { await assertNumberAvailable(tx, number); }
          catch (error) { if (error instanceof PrintingReceiptStorageError && error.status === 409) continue; throw error; }
          return tx.printingReceipt.create({ data: { storeId, createdById, subcategory, number, document: { ...document, title: number } as unknown as Prisma.InputJsonObject }, include });
        }
        throw new PrintingReceiptStorageError(409, "Nomor nota belum dapat dialokasikan. Silakan coba lagi.");
      });
      return serializeReceipt(row);
    } catch (error) {
      if (!isUniqueConflict(error)) throw error;
      if (attempt === 3) numberConflict();
    }
  }
  return numberConflict();
}

export async function savePrintingReceipt(storeId: string, id: string, input: { revision: number; number: string; document: PrintingReceiptDocument }): Promise<PrintingReceipt> {
  const number = parsePrintingReceiptNumber(input.number);
  const document = parsePrintingReceiptDocument(input.document);
  try {
    return await db.$transaction(async tx => {
      const current = await tx.printingReceipt.findFirst({ where: { id, storeId }, include });
      if (!current) notFound();
      if (current.revision !== input.revision || current.transactionId) conflict();
      const previousTitle = parsePrintingReceiptDocument(current.document).title || current.number;
      const title = document.title ?? previousTitle;
      const savedDocument = { ...document, title: !title || title === current.number ? number : title };
      await assertNumberAvailable(tx, number, id);
      await assertDocumentReferences(tx, storeId, document);
      const updated = await tx.printingReceipt.updateMany({
        where: { id, storeId, revision: input.revision, transactionId: null },
        data: { number, document: savedDocument as unknown as Prisma.InputJsonObject, revision: { increment: 1 } },
      });
      if (!updated.count) conflict();
      const row = await tx.printingReceipt.findFirst({ where: { id, storeId }, include });
      if (!row) notFound();
      return serializeReceipt(row);
    });
  } catch (error) { if (isUniqueConflict(error)) numberConflict(); throw error; }
}

export async function deletePrintingReceipt(storeId: string, id: string, revision: number): Promise<void> {
  await db.$transaction(async tx => {
    const current = await tx.printingReceipt.findFirst({ where: { id, storeId }, select: { revision: true, transactionId: true } });
    if (!current) notFound();
    if (current.revision !== revision || current.transactionId) conflict();
    const deleted = await tx.printingReceipt.deleteMany({ where: { id, storeId, revision, transactionId: null } });
    if (!deleted.count) conflict();
  });
}
