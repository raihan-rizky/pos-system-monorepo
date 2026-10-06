import type { Prisma } from "@pos/db";
import { collectStockItems, planOutstandingReturns } from "../helpers/stock-lifecycle";

export type TransactionReversalAction = "VOID" | "DELETE";
export type TransactionReversalOutcome =
  | "APPLIED"
  | "ALREADY_VOIDED"
  | "NOT_FOUND";

export class TransactionReversalConflictError extends Error {
  readonly code = "STOCK_HISTORY_REVIEW_REQUIRED";

  constructor(message = "Riwayat stok perlu diperiksa sebelum transaksi dibatalkan atau dihapus.") {
    super(message);
    this.name = "TransactionReversalConflictError";
  }
}

export interface ReverseTransactionInput {
  storeId: string;
  transactionId: string;
  action: TransactionReversalAction;
  actor: { id: string; name: string | null; role: string };
}

type JournalRow = {
  id: string;
  productId: string;
  type: string;
  reason: string | null;
  note: string | null;
  quantity: number;
  stockGroupIdSnapshot: string | null;
  unitMultiplierSnapshot: number | null;
  stockBaseDelta: number | null;
  transactionId: string | null;
  sourceTransactionRef: string | null;
  suratJalanId: string | null;
  status: string;
};

const ACTIVE_STATUSES = new Set(["COMPLETED", "DP"]);
const NON_REVERSIBLE_STATUSES = new Set(["PENDING_APPROVAL", "DRAFT"]);
const REVIEW_MESSAGE = "Riwayat stok perlu diperiksa sebelum transaksi dibatalkan atau dihapus.";

function toFiniteNumber(value: unknown): number {
  const number = Number(value instanceof Object && "toString" in value ? value.toString() : value);
  if (!Number.isFinite(number)) throw new TransactionReversalConflictError();
  return number;
}

function toJsonSnapshot<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isStockProofStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status) || status === "VOIDED" || status === "REFUNDED";
}

export async function lockTransactionForStockMutation(
  tx: Prisma.TransactionClient,
  input: { storeId: string; transactionId: string },
): Promise<string | null> {
  const lockedRows = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "pos_transactions" WHERE "id" = $1 AND "storeId" = $2 FOR UPDATE',
    input.transactionId,
    input.storeId,
  );
  if (lockedRows.length === 0) return null;

  const transaction = await tx.transaction.findFirst({
    where: { id: input.transactionId, storeId: input.storeId },
    select: { status: true },
  });
  return transaction?.status ?? null;
}

function validateJournal(rows: JournalRow[]): void {
  for (const row of rows) {
    if (row.status !== "APPROVED") throw new TransactionReversalConflictError();
    if (row.stockBaseDelta === null || !Number.isFinite(row.stockBaseDelta)) {
      throw new TransactionReversalConflictError();
    }
    if (
      row.stockGroupIdSnapshot !== null &&
      (row.unitMultiplierSnapshot === null ||
        !Number.isFinite(row.unitMultiplierSnapshot) ||
        row.unitMultiplierSnapshot <= 0)
    ) {
      throw new TransactionReversalConflictError();
    }
  }
}

function legacyEvidenceKey(input: {
  productId: string;
  reason: string;
  note: string;
}): string {
  return JSON.stringify([input.productId, input.reason, input.note]);
}

function legacyStockDelta(row: JournalRow): number {
  const quantity = toFiniteNumber(row.quantity);
  if (quantity <= 0) throw new TransactionReversalConflictError();
  if (row.type === "OUT") return -quantity;
  if (row.type === "IN") return quantity;
  throw new TransactionReversalConflictError();
}

async function proveLegacyStockDeduction(
  tx: Prisma.TransactionClient,
  transaction: any,
  rows: JournalRow[],
  storeId: string,
): Promise<JournalRow[]> {
  const invoiceNumber = transaction.invoiceNumber;
  if (typeof invoiceNumber !== "string" || invoiceNumber.length === 0) {
    throw new TransactionReversalConflictError();
  }

  const expected = new Map<string, { productId: string; quantity: number }>();
  const addExpected = (
    productId: string | null | undefined,
    quantity: unknown,
    reason: "SALE" | "USAGE",
    note: string,
  ) => {
    if (!productId || quantity == null) return;
    const amount = toFiniteNumber(quantity);
    if (amount < 0) throw new TransactionReversalConflictError();
    if (amount === 0) return;
    const key = legacyEvidenceKey({ productId, reason, note });
    const total = (expected.get(key)?.quantity ?? 0) + amount;
    if (!Number.isFinite(total)) throw new TransactionReversalConflictError();
    expected.set(key, { productId, quantity: total });
  };

  for (const item of transaction.items) {
    if (item.productId) {
      addExpected(item.productId, item.quantity, "SALE", `Penjualan ${invoiceNumber}`);
    }
    if (item.rawMaterialProductId && item.rawMaterialQuantity != null) {
      const materialNote = [
        `Bahan layanan cetak ${item.productName}`,
        invoiceNumber,
        item.material ? `Material: ${item.material}` : null,
      ]
        .filter(Boolean)
        .join(" - ");
      addExpected(item.rawMaterialProductId, item.rawMaterialQuantity, "USAGE", materialNote);
    }
  }
  if (expected.size === 0) throw new TransactionReversalConflictError();

  const expectedProductIds = [...new Set([...expected.values()].map((entry) => entry.productId))];
  const products = await tx.product.findMany({
    where: { id: { in: expectedProductIds }, storeId },
    select: {
      id: true,
      stockGroupId: true,
      unitMultiplierToBase: true,
      conversionNeedsReview: true,
    },
  });
  if (
    products.length !== expectedProductIds.length ||
    products.some(
      (product: any) =>
        product.stockGroupId !== null ||
        product.conversionNeedsReview ||
        toFiniteNumber(product.unitMultiplierToBase) !== 1,
    )
  ) {
    throw new TransactionReversalConflictError();
  }

  const groupHistory = await tx.productStockGroupActivity.findMany({
    where: { productId: { in: expectedProductIds } },
    select: { id: true },
  });
  if (groupHistory.length > 0) throw new TransactionReversalConflictError();

  const actual = new Map<string, number>();
  const evidenceIds = new Set<string>();
  for (const row of rows) {
    const note = row.note;
    if (
      row.transactionId !== null ||
      row.sourceTransactionRef !== null ||
      row.suratJalanId !== null ||
      row.type !== "OUT" ||
      row.status !== "APPROVED" ||
      (row.reason !== "SALE" && row.reason !== "USAGE") ||
      typeof note !== "string" ||
      !note.includes(invoiceNumber)
    ) {
      throw new TransactionReversalConflictError();
    }
    if (
      row.stockGroupIdSnapshot !== null ||
      row.unitMultiplierSnapshot !== null ||
      row.stockBaseDelta !== null ||
      !row.id ||
      evidenceIds.has(row.id)
    ) {
      throw new TransactionReversalConflictError();
    }
    const key = legacyEvidenceKey({ productId: row.productId, reason: row.reason, note });
    const expectedRow = expected.get(key);
    if (!expectedRow) throw new TransactionReversalConflictError();
    const quantity = toFiniteNumber(row.quantity);
    if (quantity <= 0) throw new TransactionReversalConflictError();
    evidenceIds.add(row.id);
    actual.set(key, (actual.get(key) ?? 0) + quantity);
  }

  if (rows.length === 0 || actual.size !== expected.size) {
    throw new TransactionReversalConflictError();
  }
  for (const [key, expectedRow] of expected) {
    const actualQuantity = actual.get(key);
    if (
      actualQuantity == null ||
      Math.abs(actualQuantity - expectedRow.quantity) > 1e-8
    ) {
      throw new TransactionReversalConflictError();
    }
  }

  return rows;
}

async function proveLegacyShipmentStockDeduction(
  tx: Prisma.TransactionClient,
  transaction: any,
  rows: JournalRow[],
  storeId: string,
): Promise<JournalRow[]> {
  const shipments = (transaction.suratJalan ?? []).filter(
    (shipment: any) => shipment.status === "CONFIRMED",
  );
  if (shipments.length === 0 || rows.length === 0) {
    throw new TransactionReversalConflictError();
  }

  const expected = new Map<
    string,
    Array<{ itemId: string; productId: string; quantity: number; note: string }>
  >();
  for (const shipment of shipments) {
    if (typeof shipment.id !== "string" || typeof shipment.number !== "string") {
      throw new TransactionReversalConflictError();
    }
    const note = `Surat Jalan ${shipment.number} untuk invoice ${transaction.id}`;
    for (const item of shipment.items ?? []) {
      if (
        typeof item.id !== "string" ||
        typeof item.productId !== "string" ||
        !item.productId
      ) {
        throw new TransactionReversalConflictError();
      }
      const quantity = toFiniteNumber(item.quantity);
      if (quantity <= 0) throw new TransactionReversalConflictError();
      const key = JSON.stringify([shipment.id, item.productId, note]);
      const items = expected.get(key) ?? [];
      items.push({ itemId: item.id, productId: item.productId, quantity, note });
      expected.set(key, items);
    }
  }
  if (expected.size === 0) throw new TransactionReversalConflictError();

  const shipmentRows = rows.filter(
    (row) => row.type === "OUT" && row.reason === "SALE" && row.suratJalanId !== null,
  );
  const reversalRows = rows.filter(
    (row) => row.type === "IN" && row.reason === "SALE_RETURN" && row.suratJalanId === null,
  );
  if (
    shipmentRows.length === 0 ||
    reversalRows.length === 0 ||
    shipmentRows.length + reversalRows.length !== rows.length
  ) {
    throw new TransactionReversalConflictError();
  }

  const productIds = [...new Set([...expected.values()].flatMap((items) => items.map((item) => item.productId)))];
  const products = await tx.product.findMany({
    where: { id: { in: productIds }, storeId },
    select: {
      id: true,
      stockGroupId: true,
      unitMultiplierToBase: true,
      conversionNeedsReview: true,
    },
  });
  if (
    products.length !== productIds.length ||
    products.some(
      (product: any) =>
        product.stockGroupId !== null ||
        product.conversionNeedsReview ||
        toFiniteNumber(product.unitMultiplierToBase) !== 1,
    )
  ) {
    throw new TransactionReversalConflictError();
  }
  const groupHistory = await tx.productStockGroupActivity.findMany({
    where: { productId: { in: productIds } },
    select: { id: true },
  });
  if (groupHistory.length > 0) throw new TransactionReversalConflictError();

  const actual = new Map<string, JournalRow[]>();
  const rowIds = new Set<string>();
  for (const row of shipmentRows) {
    if (
      row.transactionId !== transaction.id ||
      row.sourceTransactionRef !== null ||
      row.type !== "OUT" ||
      row.reason !== "SALE" ||
      row.status !== "APPROVED" ||
      row.stockGroupIdSnapshot !== null ||
      row.unitMultiplierSnapshot !== null ||
      row.stockBaseDelta !== null ||
      !row.id ||
      rowIds.has(row.id) ||
      typeof row.suratJalanId !== "string" ||
      typeof row.note !== "string"
    ) {
      throw new TransactionReversalConflictError();
    }
    const key = JSON.stringify([row.suratJalanId, row.productId, row.note]);
    if (!expected.has(key)) throw new TransactionReversalConflictError();
    const quantity = toFiniteNumber(row.quantity);
    if (quantity <= 0) throw new TransactionReversalConflictError();
    rowIds.add(row.id);
    const matchedRows = actual.get(key) ?? [];
    matchedRows.push(row);
    actual.set(key, matchedRows);
  }

  if (actual.size !== expected.size) throw new TransactionReversalConflictError();
  for (const [key, expectedItems] of expected) {
    const actualRows = actual.get(key);
    if (!actualRows || actualRows.length !== expectedItems.length) {
      throw new TransactionReversalConflictError();
    }
    const expectedQuantities = expectedItems.map((item) => item.quantity).sort((a, b) => a - b);
    const actualQuantities = actualRows
      .map((row) => toFiniteNumber(row.quantity))
      .sort((a, b) => a - b);
    if (
      expectedQuantities.some(
        (quantity, index) => Math.abs(quantity - actualQuantities[index]) > 1e-8,
      )
    ) {
      throw new TransactionReversalConflictError();
    }
  }

  const reversalNotes = new Set(reversalRows.map((row) => row.note));
  if (reversalNotes.size !== 1) throw new TransactionReversalConflictError();
  const reversalNote = [...reversalNotes][0];
  const matchingShipment = shipments.find(
    (shipment: any) =>
      reversalNote === `Reversal invoice ${transaction.id} untuk Surat Jalan ${shipment.number}`,
  );
  if (!matchingShipment || typeof reversalNote !== "string") {
    throw new TransactionReversalConflictError();
  }
  const expectedReversal = new Map<string, number[]>();
  for (const item of transaction.items) {
    if (!item.productId) continue;
    const quantity = toFiniteNumber(item.quantity);
    if (quantity <= 0) throw new TransactionReversalConflictError();
    const quantities = expectedReversal.get(item.productId) ?? [];
    quantities.push(quantity);
    expectedReversal.set(item.productId, quantities);
  }
  const actualReversal = new Map<string, number[]>();
  for (const row of reversalRows) {
    if (
      row.transactionId !== transaction.id ||
      row.sourceTransactionRef !== null ||
      row.status !== "APPROVED" ||
      row.stockGroupIdSnapshot !== null ||
      row.unitMultiplierSnapshot !== null ||
      row.stockBaseDelta !== null ||
      row.note !== reversalNote ||
      !row.id ||
      rowIds.has(row.id)
    ) {
      throw new TransactionReversalConflictError();
    }
    const quantity = toFiniteNumber(row.quantity);
    if (quantity <= 0 || !expectedReversal.has(row.productId)) {
      throw new TransactionReversalConflictError();
    }
    rowIds.add(row.id);
    const quantities = actualReversal.get(row.productId) ?? [];
    quantities.push(quantity);
    actualReversal.set(row.productId, quantities);
  }
  if (actualReversal.size !== expectedReversal.size) {
    throw new TransactionReversalConflictError();
  }
  for (const [productId, quantities] of expectedReversal) {
    const actualQuantities = actualReversal.get(productId);
    if (!actualQuantities || actualQuantities.length !== quantities.length) {
      throw new TransactionReversalConflictError();
    }
    const sortedExpected = [...quantities].sort((a, b) => a - b);
    const sortedActual = [...actualQuantities].sort((a, b) => a - b);
    if (sortedExpected.some((quantity, index) => Math.abs(quantity - sortedActual[index]) > 1e-8)) {
      throw new TransactionReversalConflictError();
    }
  }

  return rows;
}

async function restoreStock(
  tx: Prisma.TransactionClient,
  input: ReverseTransactionInput,
  transaction: any,
  journal: JournalRow[],
  returns: ReturnType<typeof planOutstandingReturns>,
): Promise<Array<Record<string, unknown>>> {
  const logs: Array<Record<string, unknown>> = [];
  const stockResults: Array<Record<string, unknown>> = [];

  for (const item of returns) {
    const amount = item.baseDelta;
    if (!Number.isFinite(amount) || amount <= 0) throw new TransactionReversalConflictError();

    if (item.stockGroupIdSnapshot) {
      const result = await tx.productStockGroup.updateMany({
        where: { id: item.stockGroupIdSnapshot, storeId: input.storeId },
        data: { baseStock: { increment: amount } },
      });
      if (result.count !== 1) throw new TransactionReversalConflictError();
      const stockGroup = await tx.productStockGroup.findFirst({
        where: { id: item.stockGroupIdSnapshot, storeId: input.storeId },
        select: { baseStock: true },
      });
      if (!stockGroup) throw new TransactionReversalConflictError();
      const afterBaseStock = toFiniteNumber(stockGroup.baseStock);
      stockResults.push({
        productId: item.productId,
        stockGroupId: item.stockGroupIdSnapshot,
        baseDelta: amount,
        beforeBaseStock: afterBaseStock - amount,
        afterBaseStock,
      });
    } else {
      const result = await tx.product.updateMany({
        where: { id: item.productId, storeId: input.storeId, stockGroupId: null },
        data: { stock: { increment: amount } },
      });
      if (result.count !== 1) throw new TransactionReversalConflictError();
      const product = await tx.product.findFirst({
        where: { id: item.productId, storeId: input.storeId, stockGroupId: null },
        select: { stock: true },
      });
      if (!product) throw new TransactionReversalConflictError();
      const afterStock = toFiniteNumber(product.stock);
      stockResults.push({
        productId: item.productId,
        stockGroupId: null,
        baseDelta: amount,
        beforeStock: afterStock - amount,
        afterStock,
      });
    }

    const matchingItem = transaction.items.find(
      (candidate: any) =>
        candidate.productId === item.productId ||
        candidate.rawMaterialProductId === item.productId,
    );
    logs.push({
      productId: item.productId,
      type: "IN",
      reason: "SALE_RETURN",
      quantity: amount,
      unitCost: matchingItem?.unitCost ?? null,
      note: `${input.action === "VOID" ? "Void" : "Hapus"} transaksi ${transaction.invoiceNumber ?? transaction.id}`,
      createdBy: input.actor.id,
      person: input.actor.name,
      transactionId: transaction.id,
      sourceTransactionRef: transaction.id,
      stockGroupIdSnapshot: item.stockGroupIdSnapshot,
      unitMultiplierSnapshot: 1,
      stockBaseDelta: amount,
    });
  }

  if (logs.length > 0) await tx.inventoryLog.createMany({ data: logs as any });
  return stockResults;
}

async function reverseCustomerTotals(
  tx: Prisma.TransactionClient,
  input: ReverseTransactionInput,
  transaction: any,
): Promise<{ amountPaid: number; debtRemoved: number } | null> {
  if (!ACTIVE_STATUSES.has(transaction.status)) return null;

  const total = Math.max(0, toFiniteNumber(transaction.total));
  const amountPaid = Math.min(total, Math.max(0, toFiniteNumber(transaction.amountPaid)));
  const debtBearing = transaction.status === "DP" || transaction.paymentMethod === "TEMPO";
  const debtRemoved = debtBearing ? Math.max(0, total - amountPaid) : 0;
  if (!transaction.customerId) {
    if (debtRemoved > 0) {
      throw new TransactionReversalConflictError("Piutang transaksi perlu diperiksa.");
    }
    return null;
  }
  const data: Record<string, unknown> = {
    totalOrders: { decrement: 1 },
    ...(amountPaid > 0 ? { totalSpent: { decrement: amountPaid } } : {}),
    ...(debtRemoved > 0 ? { totalDebt: { decrement: debtRemoved } } : {}),
  };
  const where: Record<string, unknown> = {
    id: transaction.customerId,
    storeId: input.storeId,
    totalOrders: { gte: 1 },
    ...(amountPaid > 0 ? { totalSpent: { gte: amountPaid } } : {}),
    ...(debtRemoved > 0 ? { totalDebt: { gte: debtRemoved } } : {}),
  };
  const result = await tx.customer.updateMany({ where: where as any, data: data as any });
  if (result.count !== 1) {
    throw new TransactionReversalConflictError("Riwayat saldo pelanggan perlu diperiksa.");
  }
  return { amountPaid, debtRemoved };
}

/**
 * Reverses only stock movements proven by the transaction's signed inventory journal.
 * The parent row lock serializes this operation with other lifecycle and shipment writes.
 */
export async function reverseTransaction(
  tx: Prisma.TransactionClient,
  input: ReverseTransactionInput,
): Promise<TransactionReversalOutcome> {
  const owner = await tx.transaction.findFirst({
    where: { id: input.transactionId, storeId: input.storeId },
    select: { customerId: true },
  });
  if (owner?.customerId) {
    await tx.$queryRawUnsafe(
      'SELECT "id" FROM "pos_customers" WHERE "id" = $1 AND "storeId" = $2 FOR UPDATE',
      owner.customerId, input.storeId,
    );
  }
  const lockedStatus = await lockTransactionForStockMutation(tx, input);
  if (lockedStatus === null) return "NOT_FOUND";

  const transaction = await tx.transaction.findFirst({
    where: { id: input.transactionId, storeId: input.storeId },
    include: {
      items: true,
      payments: true,
      debtPaymentLogs: true,
      expenses: true,
      invoiceDateChangeLogs: true,
      productionActivityLogs: true,
      suratJalan: {
        select: {
          id: true,
          number: true,
          status: true,
          items: { select: { id: true, productId: true, quantity: true } },
        },
      },
    },
  });
  if (!transaction) return "NOT_FOUND";
  if (transaction.status !== lockedStatus) throw new TransactionReversalConflictError();

  const existingAudit = await tx.transactionLifecycleAudit.findFirst({
    where: {
      storeId: input.storeId,
      transactionId: transaction.id,
      action: input.action,
    },
    select: { id: true },
  });
  if (existingAudit) {
    if (input.action === "VOID" && transaction.status === "VOIDED") return "ALREADY_VOIDED";
    throw new TransactionReversalConflictError("Audit transaksi tidak konsisten. Perlu pemeriksaan manual.");
  }

  if (input.action === "VOID" && transaction.status === "REFUNDED") {
    throw new TransactionReversalConflictError("Transaksi yang sudah dikembalikan tidak dapat dibatalkan lagi.");
  }

  const shipments = transaction.suratJalan ?? [];
  if (input.action === "DELETE" && shipments.length > 0) {
    throw new TransactionReversalConflictError(
      "Transaksi masih terhubung ke Surat Jalan. Batalkan transaksi tanpa menghapus dokumennya.",
    );
  }
  if (input.action === "VOID" && shipments.some((shipment: any) => shipment.status === "PENDING")) {
    throw new TransactionReversalConflictError(
      "Selesaikan atau batalkan Surat Jalan yang masih menunggu sebelum membatalkan transaksi.",
    );
  }

  const shipmentIds = shipments.map((shipment: any) => shipment.id);
  const logFilters: Array<Record<string, unknown>> = [
    { transactionId: transaction.id },
    { sourceTransactionRef: transaction.id },
  ];
  if (shipmentIds.length > 0) logFilters.push({ suratJalanId: { in: shipmentIds } });
  const historyRows = (await tx.inventoryLog.findMany({
    where: {
      product: { storeId: input.storeId },
      OR: [
        ...logFilters,
        ...(transaction.invoiceNumber
          ? [
              {
                transactionId: null,
                sourceTransactionRef: null,
                suratJalanId: null,
                type: "OUT",
                reason: { in: ["SALE", "USAGE"] },
                status: "APPROVED",
                note: { contains: transaction.invoiceNumber },
              },
            ]
          : []),
      ],
    },
    orderBy: { createdAt: "asc" },
  })) as JournalRow[];
  const shipmentIdSet = new Set(shipmentIds);
  const journal = historyRows.filter(
    (row) =>
      row.transactionId === transaction.id ||
      row.sourceTransactionRef === transaction.id ||
      (row.suratJalanId !== null && shipmentIdSet.has(row.suratJalanId)),
  );
  const legacyCandidates = historyRows.filter(
    (row) =>
      row.transactionId === null &&
      row.sourceTransactionRef === null &&
      row.suratJalanId === null &&
      row.type === "OUT" &&
      (row.reason === "SALE" || row.reason === "USAGE") &&
      row.status === "APPROVED" &&
      typeof row.note === "string" &&
      typeof transaction.invoiceNumber === "string" &&
      row.note.includes(transaction.invoiceNumber),
  );

  let returns: ReturnType<typeof planOutstandingReturns> = [];
  let legacyEvidence: JournalRow[] = [];
  let proofRows = journal;
  const stockItems = collectStockItems(transaction.items);
  if (stockItems.length > 0 && isStockProofStatus(transaction.status)) {
    if (journal.length > 0) {
      if (
        transaction.stockDeductionSource === "SURAT_JALAN" &&
        journal.some((row) => row.stockBaseDelta === null)
      ) {
        const legacyShipmentRows = journal.filter((row) => row.stockBaseDelta === null);
        const signedRows = journal.filter((row) => row.stockBaseDelta !== null);
        if (signedRows.length > 0) {
          throw new TransactionReversalConflictError();
        }
        const invoiceEvidence = await proveLegacyStockDeduction(
          tx,
          transaction,
          legacyCandidates,
          input.storeId,
        );
        const shipmentEvidence = await proveLegacyShipmentStockDeduction(
          tx,
          transaction,
          legacyShipmentRows,
          input.storeId,
        );
        legacyEvidence = [...invoiceEvidence, ...shipmentEvidence];
        proofRows = [
          ...legacyEvidence.map((row) => ({
            ...row,
            stockGroupIdSnapshot: null,
            unitMultiplierSnapshot: 1,
            stockBaseDelta: legacyStockDelta(row),
          })),
        ];
      } else {
        if (legacyCandidates.length > 0) throw new TransactionReversalConflictError();
        validateJournal(journal);
      }
    } else if (transaction.stockDeductionSource !== "SURAT_JALAN" || shipments.length === 0) {
      legacyEvidence = await proveLegacyStockDeduction(
        tx,
        transaction,
        legacyCandidates,
        input.storeId,
      );
      proofRows = legacyEvidence.map((row) => ({
        ...row,
        stockGroupIdSnapshot: null,
        unitMultiplierSnapshot: 1,
        stockBaseDelta: -toFiniteNumber(row.quantity),
      }));
    }
    const journalProducts = new Set(proofRows.map((row) => row.productId));
    const expectedRawMaterials = transaction.items
      .map((item: any) => item.rawMaterialProductId)
      .filter((productId: string | null): productId is string => Boolean(productId));
    if (expectedRawMaterials.some((productId) => !journalProducts.has(productId))) {
      throw new TransactionReversalConflictError();
    }
    if (transaction.stockDeductionSource !== "SURAT_JALAN" || shipments.length === 0) {
      if (stockItems.some((item) => !journalProducts.has(item.productId))) {
        throw new TransactionReversalConflictError();
      }
    } else {
      const expectedShipmentProducts = shipments
        .filter((shipment: any) => shipment.status === "CONFIRMED")
        .flatMap((shipment: any) => shipment.items.map((item: any) => item.productId))
        .filter((productId: string | null): productId is string => Boolean(productId));
      if (expectedShipmentProducts.some((productId) => !journalProducts.has(productId))) {
        throw new TransactionReversalConflictError();
      }
    }
    try {
      returns = planOutstandingReturns(
        transaction.status,
        proofRows.map((row) => ({
          productId: row.productId,
          stockGroupIdSnapshot: row.stockGroupIdSnapshot,
          baseDelta: row.stockBaseDelta,
        })),
        true,
      );
    } catch {
      throw new TransactionReversalConflictError(REVIEW_MESSAGE);
    }
  }

  if (legacyEvidence.length > 0) {
    for (const row of legacyEvidence) {
      const result = await tx.inventoryLog.updateMany({
        where: {
          id: row.id,
          transactionId: row.transactionId,
          sourceTransactionRef: row.sourceTransactionRef,
        },
        data: {
          sourceTransactionRef: transaction.id,
          stockGroupIdSnapshot: null,
          unitMultiplierSnapshot: 1,
          stockBaseDelta: legacyStockDelta(row),
        },
      });
      if (result.count !== 1) throw new TransactionReversalConflictError();
    }
  }

  let stockResults: Array<Record<string, unknown>> = [];
  if (input.action === "VOID" && transaction.status !== "VOIDED" && NON_REVERSIBLE_STATUSES.has(transaction.status)) {
    // Drafts and unapproved transactions have no stock or financial contribution to reverse.
  } else {
    stockResults = await restoreStock(tx, input, transaction, journal, returns);
  }

  const financialSnapshot = ACTIVE_STATUSES.has(transaction.status)
    ? await reverseCustomerTotals(tx, input, transaction)
    : null;

  const snapshot = toJsonSnapshot({
    action: input.action,
    previousStatus: transaction.status,
    transaction: {
      id: transaction.id,
      invoiceNumber: transaction.invoiceNumber,
      customerId: transaction.customerId,
      paymentMethod: transaction.paymentMethod,
      total: transaction.total,
      amountPaid: transaction.amountPaid,
    },
    items: transaction.items,
    payments: transaction.payments,
    debtPaymentLogs: transaction.debtPaymentLogs,
    expenses: transaction.expenses,
    invoiceDateChangeLogs: transaction.invoiceDateChangeLogs,
    productionActivityLogs: transaction.productionActivityLogs,
    suratJalan: shipments,
    stockJournal: journal.map((row) => ({
      id: row.id,
      productId: row.productId,
      type: row.type,
      reason: row.reason,
      quantity: row.quantity,
      stockGroupIdSnapshot: row.stockGroupIdSnapshot,
      unitMultiplierSnapshot: row.unitMultiplierSnapshot,
      stockBaseDelta: row.stockBaseDelta,
      suratJalanId: row.suratJalanId,
    })),
    legacyStockEvidence: legacyEvidence.map((row) => ({
      id: row.id,
      productId: row.productId,
      type: row.type,
      reason: row.reason,
      quantity: row.quantity,
      note: row.note,
    })),
    stockReturns: returns,
    stockResults,
    financialReversal: financialSnapshot,
    actor: input.actor,
  });

  if (input.action === "VOID") {
    const result = await tx.transaction.updateMany({
      where: { id: transaction.id, storeId: input.storeId, status: transaction.status },
      data: { status: "VOIDED" },
    });
    if (result.count !== 1) throw new TransactionReversalConflictError();
  } else {
    if (journal.length > 0) {
      await tx.inventoryLog.updateMany({
        where: {
          OR: [
            { transactionId: transaction.id },
            { sourceTransactionRef: transaction.id },
            ...(shipmentIds.length > 0 ? [{ suratJalanId: { in: shipmentIds } }] : []),
          ],
        },
        data: { transactionId: null, sourceTransactionRef: transaction.id },
      });
    }
    const deletedItems = await tx.transactionItem.deleteMany({ where: { transactionId: transaction.id } });
    void deletedItems;
    const result = await tx.transaction.deleteMany({
      where: { id: transaction.id, storeId: input.storeId, status: transaction.status },
    });
    if (result.count !== 1) throw new TransactionReversalConflictError();
  }

  await tx.transactionLifecycleAudit.create({
    data: {
      storeId: input.storeId,
      transactionId: transaction.id,
      invoiceNumber: transaction.invoiceNumber,
      action: input.action,
      previousStatus: transaction.status,
      actorId: input.actor.id,
      actorName: input.actor.name ?? "Pengguna tidak diketahui",
      actorRole: input.actor.role,
      snapshot,
    } as any,
  });

  return "APPLIED";
}
