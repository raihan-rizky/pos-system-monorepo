import { createHash } from "node:crypto";
import { db, type Prisma } from "@pos/db";
import { applyProcessedMaterialCorrections } from "./processed-stock-correction";
import { StockMutationConflictError } from "@/features/product-stock-groups/stock-group-lock";
import { resolveInvoiceDateTime } from "@/features/invoice-date/helpers/invoice-date-core";
import type { Role } from "@/lib/rbac/permissions";
import { getPrintingReceiptCheckoutLines, parsePrintingReceiptDocument, parsePrintingReceiptNumber, PrintingReceiptValidationError } from "../domain";
import { planProcessedPrintingReceiptEdit, type ProcessedPrintingReceiptInput, type ProcessedPrintingReceiptReview } from "../processed-edit";
import { getPrintingReceipt, PrintingReceiptStorageError } from "./receipt-store";
import { parsePrintingReceiptRevision } from "./route-support";

type Tx = Prisma.TransactionClient;
type Actor = { id: string; name?: string | null; role?: Role };
const conflict = () => new PrintingReceiptStorageError(409, "Nota, pembayaran, atau bahan sudah berubah. Muat ulang dan tinjau kembali perubahan.");
const productSelect = { id: true, name: true, unit: true, isActive: true, stockGroupId: true, unitMultiplierToBase: true, conversionNeedsReview: true, costPrice: true } as const;

async function prepare(tx: Tx, storeId: string, id: string, raw: ProcessedPrintingReceiptInput) {
  const input = { revision: parsePrintingReceiptRevision(raw.revision), number: parsePrintingReceiptNumber(raw.number), document: parsePrintingReceiptDocument(raw.document) };
  const hint = await tx.printingReceipt.findFirst({ where: { id, storeId }, select: { transactionId: true } });
  if (!hint) throw new PrintingReceiptStorageError(404, "Nota tidak ditemukan di toko ini.");
  if (!hint.transactionId) throw conflict();
  const owner = await tx.transaction.findFirst({ where: { id: hint.transactionId, storeId }, select: { customerId: true } });
  // Match payment and reversal lock order to avoid a customer/invoice deadlock.
  if (owner?.customerId) await tx.$queryRawUnsafe('SELECT "id" FROM "pos_customers" WHERE "id" = $1 AND "storeId" = $2 FOR UPDATE', owner.customerId, storeId);
  const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>('SELECT "id" FROM "pos_transactions" WHERE "id" = $1 AND "storeId" = $2 FOR UPDATE', hint.transactionId, storeId);
  if (!locked.length) throw conflict();
  await tx.$queryRawUnsafe('SELECT "id" FROM "pos_printing_receipts" WHERE "id" = $1 AND "storeId" = $2 FOR UPDATE', id, storeId);
  const current = await tx.printingReceipt.findFirst({ where: { id, storeId } });
  const transaction = await tx.transaction.findFirst({ where: { id: hint.transactionId, storeId }, include: { items: { orderBy: { id: "asc" } }, payments: { orderBy: { id: "asc" } }, debtPaymentLogs: { orderBy: { id: "asc" } } } });
  if (!current || !transaction || current.transactionId !== transaction.id || current.revision !== input.revision || transaction.customerId !== owner?.customerId) throw conflict();
  if (input.number !== current.number || transaction.invoiceNumber !== current.number) throw new PrintingReceiptValidationError("Nomor nota diproses harus tetap sama dengan nomor transaksi.");
  if (input.document.customerId !== transaction.customerId) throw new PrintingReceiptValidationError("Pelanggan nota diproses tidak dapat diganti agar riwayat pembayaran dan piutang tetap sesuai.");
  if (transaction.stockManagedBySuratJalan || transaction.stockDeductionSource !== "TRANSACTION" || transaction.items.some(item => item.productId || item.printingServiceId || Number(item.discount) !== 0)) {
    throw new PrintingReceiptValidationError("Transaksi ini memiliki pengaturan stok atau harga khusus. Periksa melalui halaman transaksi terlebih dahulu.");
  }
  if (input.document.customerId) {
    const customer = await tx.customer.findFirst({ where: { id: input.document.customerId, storeId }, select: { id: true } });
    if (!customer) throw new PrintingReceiptValidationError("Pelanggan tidak ditemukan di toko ini.");
  }
  const plan = planProcessedPrintingReceiptEdit(transaction, input.document);
  const ids = plan.materials.map(item => item.productId);
  const products = ids.length ? await tx.product.findMany({ where: { id: { in: ids }, storeId }, select: productSelect, orderBy: { id: "asc" } }) : [];
  const byId = new Map(products.map(product => [product.id, product]));
  for (const material of plan.materials) {
    const product = byId.get(material.productId);
    if (!product || product.conversionNeedsReview || (material.after > 0 && !product.isActive)) throw new PrintingReceiptValidationError("Bahan stok tidak tersedia atau konversinya perlu diperiksa. Pilih ulang bahan stok.");
    if (material.before > 0 && material.unit.trim().toLowerCase() !== product.unit.trim().toLowerCase()) throw conflict();
  }
  for (const line of plan.lines) {
    if (line.stockLink && line.stockLink.unit.trim().toLowerCase() !== byId.get(line.stockLink.productId)?.unit.trim().toLowerCase()) throw new PrintingReceiptValidationError("Satuan bahan stok sudah berubah. Pilih ulang bahan stok.");
  }
  const journal = await tx.inventoryLog.findMany({ where: { OR: [{ transactionId: transaction.id }, { sourceTransactionRef: transaction.id }] }, orderBy: { id: "asc" } });
  if (transaction.status !== "PENDING_APPROVAL") {
    for (const material of plan.materials.filter(row => row.before > 0)) {
      const product = byId.get(material.productId)!;
      const rows = journal.filter(row => row.productId === product.id);
      const multiplier = product.stockGroupId ? Number(product.unitMultiplierToBase) : 1;
      if (!rows.length || !Number.isFinite(multiplier) || multiplier <= 0 || rows.some(row => row.status !== "APPROVED" || row.stockBaseDelta === null || row.stockGroupIdSnapshot !== product.stockGroupId || row.unitMultiplierSnapshot === null || Math.abs(Number(row.unitMultiplierSnapshot) - multiplier) > 1e-10 * Math.max(1, multiplier)) || Math.abs(rows.reduce((sum, row) => sum + Number(row.stockBaseDelta), 0) + material.before * multiplier) > 1e-7) throw conflict();
    }
  }
  const reviewToken = createHash("sha256").update(JSON.stringify({ storeId, id, input, current, transaction, products, journal })).digest("hex");
  const review: ProcessedPrintingReceiptReview = { reviewToken, before: plan.before, after: plan.after, materials: plan.materials.map(row => ({ ...row, name: byId.get(row.productId)!.name, unit: byId.get(row.productId)!.unit })) };
  return { input, current, transaction, products, plan, review };
}

function normalizeDatabaseError(error: unknown): never {
  if (error instanceof StockMutationConflictError) throw conflict();
  if (error && typeof error === "object" && "code" in error && (error.code === "P2034" || error.code === "P2002")) throw conflict();
  if (error instanceof Error && ["INSUFFICIENT_STOCK", "PRODUCT_NOT_FOUND", "CONVERSION_NEEDS_REVIEW"].includes(error.message)) throw new PrintingReceiptValidationError("Stok bahan tidak mencukupi atau sudah berubah. Periksa kembali bahan stok.");
  throw error;
}

export async function reviewProcessedPrintingReceipt(storeId: string, id: string, input: ProcessedPrintingReceiptInput): Promise<ProcessedPrintingReceiptReview> {
  try { return await db.$transaction(async tx => (await prepare(tx, storeId, id, input)).review, { isolationLevel: "Serializable" }); }
  catch (error) { return normalizeDatabaseError(error); }
}

export async function saveProcessedPrintingReceipt(storeId: string, id: string, raw: ProcessedPrintingReceiptInput & { acknowledged: boolean; reviewToken: string }, actor: Actor) {
  if (raw.acknowledged !== true || typeof raw.reviewToken !== "string" || !raw.reviewToken) throw new PrintingReceiptValidationError("Setujui dampak perubahan dan tinjau nota sebelum menyimpan.");
  try {
    await db.$transaction(async tx => {
      const { input, current, transaction, products, plan, review } = await prepare(tx, storeId, id, raw);
      if (review.reviewToken !== raw.reviewToken) throw conflict();
      const receiptWrite = await tx.printingReceipt.updateMany({ where: { id, storeId, revision: input.revision, transactionId: transaction.id }, data: { document: input.document as unknown as Prisma.InputJsonObject, revision: { increment: 1 } } });
      if (receiptWrite.count !== 1) throw conflict();
      const invoiceDate = resolveInvoiceDateTime({ mode: "edit", date: input.document.date, previousInvoiceDate: transaction.invoiceDate, now: new Date() });
      const transactionWrite = await tx.transaction.updateMany({ where: { id: transaction.id, storeId, status: transaction.status, total: transaction.total, amountPaid: transaction.amountPaid, change: transaction.change, customerId: transaction.customerId }, data: { subtotal: plan.after.subtotal, tax: plan.tax, taxRate: plan.taxRate, taxMethod: plan.taxMethod, total: plan.after.total, status: plan.after.status as "DP" | "COMPLETED" | "PENDING_APPROVAL", customerName: input.document.customerName || null, note: input.document.note || null, invoiceDate,
        // The cash change has already left the drawer. Keep payment history intact,
        // and normalize the invoice balance used by existing debt/payment screens.
        ...(plan.after.total !== plan.before.total ? { amountPaid: plan.after.paid, change: 0 } : {}),
      } });
      if (transactionWrite.count !== 1) throw conflict();
      const debtDelta = Math.round((plan.after.debt - plan.before.debt) * 100) / 100;
      if (transaction.customerId && debtDelta !== 0) {
        const customerWrite = await tx.customer.updateMany({ where: { id: transaction.customerId, storeId, ...(debtDelta < 0 ? { totalDebt: { gte: -debtDelta } } : {}) }, data: { totalDebt: { increment: debtDelta } } });
        if (customerWrite.count !== 1) throw conflict();
      }
      if (invoiceDate.getTime() !== transaction.invoiceDate.getTime()) await tx.invoiceDateChangeLog.create({ data: { transactionId: transaction.id, storeId, oldInvoiceDate: transaction.invoiceDate, newInvoiceDate: invoiceDate, oldDocumentNumber: current.number, newDocumentNumber: current.number, reason: "Koreksi manual nota percetakan diproses", actorId: actor.id, actorName: actor.name || "Pengguna", actorRole: actor.role || "OWNER" } });
      if (transaction.status !== "PENDING_APPROVAL") {
        const deltas = plan.materials.filter(row => row.before !== row.after).map(row => ({ productId: row.productId, delta: row.before - row.after }));
        const movements = await applyProcessedMaterialCorrections(tx, { storeId, products, deltas });
        // Each correction is new signed evidence. Original journal rows remain immutable,
        // so void/refund can reverse the net outstanding usage using the existing service.
        if (movements.length) await tx.inventoryLog.createMany({ data: movements.map(movement => {
          const quantity = Math.abs(deltas.find(row => row.productId === movement.productId)!.delta);
          const product = products.find(row => row.id === movement.productId)!;
          return { productId: movement.productId, type: movement.baseDelta > 0 ? "IN" as const : "OUT" as const, reason: "USAGE" as const, status: "APPROVED" as const, quantity, unitCost: product.costPrice, createdBy: actor.id, person: actor.name || null, note: `Koreksi nota ${current.number} revisi ${input.revision + 1}`, transactionId: transaction.id, sourceTransactionRef: transaction.id, stockGroupIdSnapshot: movement.stockGroupId, unitMultiplierSnapshot: movement.stockGroupId ? Math.abs(movement.baseDelta) / quantity : 1, stockBaseDelta: movement.baseDelta };
        }) });
      }
      const previousLines = getPrintingReceiptCheckoutLines(parsePrintingReceiptDocument(current.document));
      if (JSON.stringify(previousLines) !== JSON.stringify(plan.lines)) {
        const unmatched = [...transaction.items];
        const previousCosts = new Map<string, { productId: string | null; unitCost: Prisma.Decimal | null }>();
        for (const line of previousLines) {
          const match = unmatched.findIndex(item => item.productName === line.name && (item.material || "") === line.material && item.quantity === line.quantity && Number(item.unitPrice) === line.price && item.rawMaterialProductId === (line.stockLink?.productId ?? null) && item.rawMaterialQuantity === (line.stockLink?.quantity ?? null) && item.rawMaterialUnit === (line.stockLink?.unit ?? null));
          if (match < 0) continue;
          const [item] = unmatched.splice(match, 1);
          previousCosts.set(line.id, { productId: item.rawMaterialProductId, unitCost: item.unitCost });
        }
        await tx.transactionItem.deleteMany({ where: { transactionId: transaction.id } });
        await tx.transactionItem.createMany({ data: plan.lines.map(line => {
          const previous = previousCosts.get(line.id);
          const productId = line.stockLink?.productId ?? null;
          const unitCost = previous && previous.productId === productId ? previous.unitCost : products.find(row => row.id === productId)?.costPrice ?? null;
          return { transactionId: transaction.id, productName: line.name, documentName: line.name, material: line.material || null, quantity: line.quantity, unitPrice: line.price, subtotal: Math.round(line.quantity * line.price * 100) / 100, discount: 0, productId: null, printingServiceId: null, rawMaterialProductId: productId, rawMaterialQuantity: line.stockLink?.quantity ?? null, rawMaterialUnit: line.stockLink?.unit ?? null, unitCost };
        }) });
      }
    }, { isolationLevel: "Serializable" });
    return await getPrintingReceipt(storeId, id);
  } catch (error) { return normalizeDatabaseError(error); }
}
