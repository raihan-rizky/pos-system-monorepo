import type { Prisma } from "@pos/db";
import { createHash } from "node:crypto";
import { z } from "zod";
import { lockStockMutationRows } from "@/features/product-stock-groups/stock-group-lock";
import { buildUnvoidPlan } from "./transaction-unvoid-plan";

const storedNumber = z.union([z.number(), z.string().min(1)]).transform(Number).pipe(z.number().finite());
const transactionSnapshot = z.object({ transaction: z.object({
  invoiceNumber: z.string().nullable(), draftNumber: z.string().nullable(),
  paymentMethod: z.string(), total: storedNumber, amountPaid: storedNumber,
}), items: z.array(z.unknown()), payments: z.array(z.unknown()), debtPaymentLogs: z.array(z.unknown()),
stockJournal: z.array(z.object({ id: z.string().min(1) }).passthrough()),
legacyStockEvidence: z.array(z.object({ id: z.string().min(1), productId: z.string(), type: z.string(), reason: z.string().nullable(), quantity: z.number(), note: z.string().nullable() }).passthrough()) });

function canonicalRecords(value: unknown[]) {
  const canonicalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonicalize);
    if (item !== null && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalize(entry)]));
    }
    return item;
  };
  return JSON.stringify(value.map((item) => JSON.stringify(canonicalize(item))).sort());
}

export interface UnvoidInput {
  storeId: string;
  transactionId: string;
  actor: { id: string; role: string; name: string | null };
}

export async function previewTransactionUnvoid(tx: Prisma.TransactionClient, input: UnvoidInput) {
  if (input.actor.role !== "OWNER") throw new Error("Hanya owner yang dapat memulihkan transaksi.");
  const transaction = await tx.transaction.findFirst({
    where: { id: input.transactionId, storeId: input.storeId },
    select: { id: true, status: true, customerId: true, invoiceNumber: true, draftNumber: true,
      total: true, amountPaid: true, paymentMethod: true, items: true, payments: true, debtPaymentLogs: true },
  });
  if (!transaction || transaction.status !== "VOIDED") throw new Error("Transaksi void tidak ditemukan.");
  const audit = await tx.transactionLifecycleAudit.findFirst({
    where: { storeId: input.storeId, transactionId: input.transactionId },
    orderBy: { sequence: "desc" },
    select: { id: true, action: true, snapshot: true, createdAt: true },
  });
  if (!audit || audit.action !== "VOID") throw new Error("Audit void tidak ditemukan atau tidak konsisten.");
  const plan = buildUnvoidPlan(transaction.id, audit.snapshot);
  if (plan.customerId !== transaction.customerId) throw new Error("Data pelanggan telah berubah. Transaksi perlu diperiksa.");
  const original = transactionSnapshot.safeParse(audit.snapshot);
  if (!original.success || original.data.transaction.invoiceNumber !== transaction.invoiceNumber ||
      original.data.transaction.draftNumber !== transaction.draftNumber ||
      original.data.transaction.paymentMethod !== transaction.paymentMethod ||
      original.data.transaction.total !== Number(transaction.total) ||
      original.data.transaction.amountPaid !== Number(transaction.amountPaid) ||
      canonicalRecords(original.data.items) !== canonicalRecords(JSON.parse(JSON.stringify(transaction.items))) ||
      canonicalRecords(original.data.payments) !== canonicalRecords(JSON.parse(JSON.stringify(transaction.payments))) ||
      canonicalRecords(original.data.debtPaymentLogs) !== canonicalRecords(JSON.parse(JSON.stringify(transaction.debtPaymentLogs)))) {
    throw new Error("Data transaksi telah berubah. Transaksi perlu diperiksa.");
  }
  if (plan.financialReversal) {
    const total = Math.max(0, original.data.transaction.total);
    const paid = Math.min(total, Math.max(0, original.data.transaction.amountPaid));
    const debt = plan.previousStatus === "DP" || original.data.transaction.paymentMethod === "TEMPO" ? Math.max(0, total - paid) : 0;
    if (plan.financialReversal.amountPaid !== paid || plan.financialReversal.debtRemoved !== debt) {
      throw new Error("Audit void tidak konsisten. Transaksi perlu diperiksa.");
    }
  }
  const priorJournal = original.data.stockJournal;
  const legacy = original.data.legacyStockEvidence;
  const legacyById = new Map(legacy.map((row) => [row.id, row]));
  let currentLegacy: Array<{ id: string; productId: string; type: string; reason: string | null; unitCost: Prisma.Decimal | null }> = [];
  if (legacy.length) {
    const ids = legacy.map((row) => row.id);
    const rows = await tx.inventoryLog.findMany({
      where: { id: { in: ids }, product: { storeId: input.storeId } },
      select: { id: true, productId: true, type: true, reason: true, quantity: true, note: true, status: true,
        transactionId: true, sourceTransactionRef: true, suratJalanId: true, stockGroupIdSnapshot: true,
        unitMultiplierSnapshot: true, stockBaseDelta: true, unitCost: true },
    });
    currentLegacy = rows;
    const legacyProjection = rows.map((row) => {
      const expected = legacyById.get(row.id);
      const plain = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
      return Object.fromEntries(Object.keys(expected ?? {}).map((key) => [key, plain[key]]));
    });
    if (new Set(ids).size !== ids.length || rows.some((row) =>
        row.status !== "APPROVED" || row.sourceTransactionRef !== input.transactionId ||
        row.stockGroupIdSnapshot !== null || row.unitMultiplierSnapshot !== 1 ||
        !Number.isFinite(row.quantity) || row.quantity <= 0 ||
        (row.type !== "IN" && row.type !== "OUT") ||
        row.stockBaseDelta !== (row.type === "OUT" ? -row.quantity : row.quantity) ||
        (!priorJournal.some((prior) => prior.id === row.id) && (row.transactionId !== null || row.suratJalanId !== null))) ||
        canonicalRecords(legacy) !== canonicalRecords(legacyProjection)) {
      throw new Error("Riwayat stok telah berubah. Transaksi perlu diperiksa.");
    }
  }
  const shipmentSnapshot = z.array(z.object({ id: z.string().min(1) }).passthrough()).safeParse((audit.snapshot as { suratJalan?: unknown }).suratJalan);
  if (!shipmentSnapshot.success) throw new Error("Riwayat stok telah berubah. Transaksi perlu diperiksa.");
  const journal = await tx.inventoryLog.findMany({
    where: { product: { storeId: input.storeId }, OR: [
      { transactionId: input.transactionId }, { sourceTransactionRef: input.transactionId },
      { suratJalanId: { in: shipmentSnapshot.data.map((row) => row.id) } },
    ] },
    select: { id: true, productId: true, type: true, reason: true, quantity: true, note: true,
      transactionId: true, sourceTransactionRef: true, suratJalanId: true, stockGroupIdSnapshot: true,
      unitMultiplierSnapshot: true, stockBaseDelta: true, status: true, unitCost: true },
  });
  const priorIds = new Set(priorJournal.map((row) => row.id));
  const currentPrior = journal.filter((row) => priorIds.has(row.id));
  const newRows = journal.filter((row) => !priorIds.has(row.id) && !legacyById.has(row.id));
  const normalizedPrior = priorJournal.map((row) => {
    const evidence = legacyById.get(row.id);
    return evidence ? { ...row, sourceTransactionRef: input.transactionId, stockGroupIdSnapshot: null,
      unitMultiplierSnapshot: 1, stockBaseDelta: evidence.type === "OUT" ? -evidence.quantity : evidence.quantity } : row;
  });
  const expectedReturns = plan.stockReturns.map((item) => JSON.stringify([item.productId, item.stockGroupIdSnapshot, item.baseDelta])).sort();
  const actualReturns = newRows.map((row) => JSON.stringify([row.productId, row.stockGroupIdSnapshot, row.stockBaseDelta])).sort();
  const currentPriorProjection = currentPrior.map((row) => {
    const expected = normalizedPrior.find((prior) => prior.id === row.id);
    const plain = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
    return Object.fromEntries(Object.keys(expected ?? {}).map((key) => [key, plain[key]]));
  });
  if (priorIds.size !== priorJournal.length || canonicalRecords(normalizedPrior) !== canonicalRecords(currentPriorProjection) ||
      JSON.stringify(expectedReturns) !== JSON.stringify(actualReturns) || newRows.some((row) =>
        row.type !== "IN" || row.reason !== "SALE_RETURN" || row.status !== "APPROVED" ||
        row.quantity !== row.stockBaseDelta || row.unitMultiplierSnapshot !== 1 || row.suratJalanId !== null ||
        row.transactionId !== input.transactionId || row.sourceTransactionRef !== input.transactionId ||
        row.note !== `Void transaksi ${transaction.invoiceNumber ?? input.transactionId}`)) {
    throw new Error("Riwayat stok telah berubah. Transaksi perlu diperiksa.");
  }

  const products = await tx.product.findMany({
    where: { storeId: input.storeId, id: { in: plan.stockReturns.map((item) => item.productId) } },
    select: { id: true, name: true, unit: true, stock: true, stockGroupId: true, unitMultiplierToBase: true, conversionNeedsReview: true },
  });
  const groups = await tx.productStockGroup.findMany({
    where: { storeId: input.storeId, id: { in: plan.stockReturns.flatMap((item) => item.stockGroupIdSnapshot ? [item.stockGroupIdSnapshot] : []) } },
    select: { id: true, baseStock: true, baseUnit: true },
  });
  const shipments = await tx.suratJalan.findMany({
    where: { storeId: input.storeId, transactionId: transaction.id, id: { in: plan.shipments.map((item) => item.id) } },
    include: { items: true },
  });
  const required = new Map<string, number>();
  const stock = plan.stockReturns.map((item) => {
    const product = products.find((row) => row.id === item.productId);
    if (!product || product.stockGroupId !== item.stockGroupIdSnapshot) throw new Error("Data stok telah berubah. Transaksi perlu diperiksa.");
    const group = item.stockGroupIdSnapshot ? groups.find((row) => row.id === item.stockGroupIdSnapshot) : null;
    if (item.stockGroupIdSnapshot && !group) throw new Error("Kelompok stok tidak ditemukan.");
    const multiplier = group ? Number(product.unitMultiplierToBase) : 1;
    const sourceRows = currentPrior.filter((row) => row.productId === item.productId && row.stockGroupIdSnapshot === item.stockGroupIdSnapshot && row.type === "OUT" && row.reason !== "TRANSACTION_RESTORE");
    const legacyRows = item.stockGroupIdSnapshot === null ? currentLegacy.filter((row) => row.productId === item.productId && row.type === "OUT") : [];
    const reasons = new Set([...sourceRows.map((row) => row.reason), ...legacyRows.map((row) => row.reason)]);
    const reason = [...reasons][0];
    if (product.conversionNeedsReview || !Number.isFinite(multiplier) || multiplier <= 0 || reasons.size !== 1 ||
        (reason !== "SALE" && reason !== "USAGE") ||
        (group && sourceRows.some((row) => row.unitMultiplierSnapshot !== multiplier))) {
      throw new Error("Asal atau satuan stok perlu diperiksa sebelum transaksi dipulihkan.");
    }
    const costs = new Set([...sourceRows, ...legacyRows].map((row) => row.unitCost == null ? null : Number(row.unitCost)));
    const unitCost = [...costs][0] ?? null;
    if (costs.size !== 1 || (unitCost !== null && (!Number.isFinite(unitCost) || unitCost < 0))) throw new Error("Asal atau satuan stok perlu diperiksa sebelum transaksi dipulihkan.");
    const key = item.stockGroupIdSnapshot ? `group:${item.stockGroupIdSnapshot}` : `product:${item.productId}`;
    required.set(key, (required.get(key) ?? 0) + item.baseDelta);
    return { productId: product.id, stockGroupId: item.stockGroupIdSnapshot, name: product.name, amount: item.baseDelta,
      unit: group?.baseUnit ?? product.unit, available: group?.baseStock ?? product.stock,
      movementReason: reason, unitMultiplier: multiplier, quantity: item.baseDelta / multiplier, unitCost };
  });
  if (stock.some((item) => !Number.isFinite(item.available) || item.available < (required.get(item.stockGroupId ? `group:${item.stockGroupId}` : `product:${item.productId}`) ?? 0))) {
    throw new Error("Stok tidak mencukupi untuk memulihkan transaksi.");
  }
  const restoredShipments = plan.shipments.map((item) => {
    const shipment = shipments.find((row) => row.id === item.id);
    const originalShipment = shipmentSnapshot.data.find((row) => row.id === item.id);
    const comparable = (value: unknown) => {
      const row = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
      delete row.status; delete row.cancelledAt; delete row.updatedAt;
      if (Array.isArray(row.items)) row.items = canonicalRecords(row.items);
      return canonicalRecords([row]);
    };
    const timeDifference = shipment?.cancelledAt ? shipment.updatedAt.getTime() - shipment.cancelledAt.getTime() : NaN;
    if (!shipment || !originalShipment || originalShipment.cancelledAt !== null || shipment.status !== "CANCELLED" || !Number.isFinite(timeDifference) ||
        timeDifference < 0 || timeDifference > 1000 || comparable(shipment) !== comparable(originalShipment)) {
      throw new Error("Surat jalan telah berubah. Transaksi perlu diperiksa.");
    }
    return { id: item.id, number: shipment.number, status: item.status };
  });
  const preview = { auditId: audit.id, invoiceNumber: transaction.invoiceNumber, previousStatus: plan.previousStatus,
    customerId: plan.customerId, financialReversal: plan.financialReversal, stock, shipments: restoredShipments };
  return { ...preview, previewToken: createHash("sha256").update(JSON.stringify(preview)).digest("hex") };
}

/** The caller must execute this function within a database transaction. */
export async function restoreTransactionUnvoid(tx: Prisma.TransactionClient, input: UnvoidInput & { previewToken: string }) {
  if (input.actor.role !== "OWNER") throw new Error("Hanya owner yang dapat memulihkan transaksi.");
  const owner = await tx.transaction.findFirst({ where: { id: input.transactionId, storeId: input.storeId }, select: { customerId: true } });
  if (owner?.customerId) {
    await tx.$queryRawUnsafe('SELECT "id" FROM "pos_customers" WHERE "id" = $1 AND "storeId" = $2 FOR UPDATE', owner.customerId, input.storeId);
  }
  const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
    'SELECT "id" FROM "pos_transactions" WHERE "id" = $1 AND "storeId" = $2 FOR UPDATE', input.transactionId, input.storeId,
  );
  if (locked.length !== 1) throw new Error("Transaksi void tidak ditemukan.");
  const initial = await previewTransactionUnvoid(tx, input);
  if (owner?.customerId !== initial.customerId) throw new Error("Data transaksi telah berubah. Tinjau kembali.");
  const locks = await lockStockMutationRows(tx, {
    storeId: input.storeId,
    stockGroupIds: initial.stock.flatMap((item) => item.stockGroupId ? [item.stockGroupId] : []),
    productIds: initial.stock.map((item) => item.productId),
  });
  if (locks.lockedProductIds.length !== locks.productIds.length || locks.lockedStockGroupIds.length !== locks.stockGroupIds.length) {
    throw new Error("Data stok telah berubah. Tinjau kembali.");
  }
  const current = await previewTransactionUnvoid(tx, input);
  if (current.previewToken !== input.previewToken) throw new Error("Data telah berubah. Tinjau kembali pratinjau.");

  for (const item of current.stock) {
    const changed = item.stockGroupId
      ? await tx.productStockGroup.updateMany({ where: { id: item.stockGroupId, storeId: input.storeId, baseStock: { gte: item.amount } }, data: { baseStock: { decrement: item.amount } } })
      : await tx.product.updateMany({ where: { id: item.productId, storeId: input.storeId, stockGroupId: null, stock: { gte: item.amount } }, data: { stock: { decrement: item.amount } } });
    if (changed.count !== 1) throw new Error("Stok telah berubah. Tinjau kembali pratinjau.");
  }
  if (current.stock.length) {
    await tx.inventoryLog.createMany({ data: current.stock.map((item) => ({
      productId: item.productId, type: "OUT", reason: "TRANSACTION_RESTORE" as const, quantity: item.quantity, unitCost: item.unitCost,
      note: `Pulihkan transaksi ${current.invoiceNumber ?? input.transactionId} (asal ${item.movementReason === "USAGE" ? "pemakaian bahan" : "penjualan"})`,
      createdBy: input.actor.id, person: input.actor.name, transactionId: input.transactionId,
      sourceTransactionRef: input.transactionId, stockGroupIdSnapshot: item.stockGroupId,
      unitMultiplierSnapshot: item.unitMultiplier, stockBaseDelta: -item.amount,
    })) });
  }
  if (current.financialReversal && current.customerId) {
    const { amountPaid, debtRemoved } = current.financialReversal;
    const changed = await tx.customer.updateMany({ where: { id: current.customerId, storeId: input.storeId },
      data: { totalOrders: { increment: 1 }, totalSpent: { increment: amountPaid }, totalDebt: { increment: debtRemoved } } });
    if (changed.count !== 1) throw new Error("Pelanggan tidak ditemukan. Transaksi perlu diperiksa.");
  }
  for (const shipment of current.shipments) {
    const changed = await tx.suratJalan.updateMany({ where: { id: shipment.id, transactionId: input.transactionId, storeId: input.storeId, status: "CANCELLED" },
      data: { status: shipment.status, cancelledAt: null } });
    if (changed.count !== 1) throw new Error("Surat jalan telah berubah. Tinjau kembali pratinjau.");
  }
  const updated = await tx.transaction.updateMany({ where: { id: input.transactionId, storeId: input.storeId, status: "VOIDED" }, data: { status: current.previousStatus } });
  if (updated.count !== 1) throw new Error("Status transaksi telah berubah. Tinjau kembali pratinjau.");
  await tx.transactionLifecycleAudit.create({ data: { storeId: input.storeId, transactionId: input.transactionId,
    invoiceNumber: current.invoiceNumber, action: "UNVOID", previousStatus: "VOIDED", actorId: input.actor.id,
    actorName: input.actor.name ?? "Pengguna tidak diketahui", actorRole: input.actor.role as any,
    snapshot: JSON.parse(JSON.stringify({ ...current, actor: input.actor })) } });
  return current;
}
