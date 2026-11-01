import { createHash } from "node:crypto";
import { db, type Prisma } from "@pos/db";

import { calculateBackdatedRecognition } from "../helpers/backdated-purchase-accounting";
import type { BackdatedPaymentInput, BackdatedPurchaseInput } from "../helpers/backdated-purchase-input";

export type BackdatedPurchaseActor = { id: string; storeId: string; name?: string | null };

export class BackdatedPurchaseError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "BackdatedPurchaseError";
  }
}

const purchaseInclude = {
  payments: { orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }, { id: "asc" }] },
} satisfies Prisma.BackdatedPurchaseInclude;

type PurchaseRow = Prisma.BackdatedPurchaseGetPayload<{ include: typeof purchaseInclude }>;
type PaymentRow = PurchaseRow["payments"][number];
type Transaction = Prisma.TransactionClient;

function centsFromDecimal(value: { toString(): string } | string): number {
  const text = value.toString();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error("Nominal tersimpan tidak valid.");
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Nominal tersimpan terlalu besar.");
  return cents;
}

function decimalFromCents(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function calendarDate(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function expenseDate(date: string): Date {
  return new Date(`${date}T00:00:00+07:00`);
}

function recognition(row: PurchaseRow) {
  return calculateBackdatedRecognition({
    amountCents: centsFromDecimal(row.amount),
    dueDate: dateKey(row.dueDate),
    payments: row.payments.map((payment) => ({
      id: payment.id,
      amountCents: centsFromDecimal(payment.amount),
      paidAt: dateKey(payment.paidAt),
    })),
  });
}

export function backdatedPurchaseView(row: PurchaseRow) {
  const totals = recognition(row);
  return {
    id: row.id,
    purchaseDate: dateKey(row.purchaseDate),
    paymentMethod: row.paymentMethod,
    dueDate: dateKey(row.dueDate),
    reference: row.reference,
    amountCents: centsFromDecimal(row.amount),
    paidCents: totals.paidCents,
    remainingCents: totals.remainingCents,
    paymentStatus: totals.paidCents === 0 ? "UNPAID" as const : totals.remainingCents === 0 ? "PAID" as const : "PARTIAL" as const,
    createdAt: row.createdAt.toISOString(),
    payments: row.payments.map((payment) => ({
      id: payment.id,
      amountCents: centsFromDecimal(payment.amount),
      paidAt: dateKey(payment.paidAt),
      createdAt: payment.createdAt.toISOString(),
    })),
  };
}

function requestFingerprint(input: BackdatedPurchaseInput): string {
  const payments = [...input.payments].sort((a, b) => a.requestId.localeCompare(b.requestId));
  return createHash("sha256").update(JSON.stringify({ ...input, payments })).digest("hex");
}

async function syncPaymentExpense(tx: Transaction, row: PurchaseRow, payment: PaymentRow) {
  if (dateKey(payment.paidAt) > dateKey(row.dueDate)) return;
  const amount = decimalFromCents(centsFromDecimal(payment.amount));
  const occurredAt = expenseDate(dateKey(payment.paidAt));
  await tx.expense.upsert({
    where: { backdatedPurchasePaymentId: payment.id },
    create: {
      storeId: row.storeId,
      recordedById: payment.createdById,
      applicantName: "Belanja Terdahulu",
      category: "SUPPLIES",
      description: `Pembayaran belanja terdahulu ${row.reference}`,
      amount,
      changeAmount: 0,
      occurredAt,
      backdatedPurchasePaymentId: payment.id,
    },
    update: { amount, occurredAt, deletedAt: null },
  });
}

async function syncDueExpense(tx: Transaction, row: PurchaseRow) {
  const dueCents = recognition(row).dueCents;
  if (dueCents === 0) {
    await tx.expense.updateMany({
      where: { backdatedPurchaseDueId: row.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return;
  }
  const amount = decimalFromCents(dueCents);
  const occurredAt = expenseDate(dateKey(row.dueDate));
  await tx.expense.upsert({
    where: { backdatedPurchaseDueId: row.id },
    create: {
      storeId: row.storeId,
      recordedById: row.createdById,
      applicantName: "Belanja Terdahulu",
      category: "SUPPLIES",
      description: `Jatuh tempo belanja terdahulu ${row.reference}`,
      amount,
      changeAmount: 0,
      occurredAt,
      backdatedPurchaseDueId: row.id,
    },
    update: { amount, occurredAt, deletedAt: null },
  });
}

export async function createBackdatedPurchase(input: BackdatedPurchaseInput, actor: BackdatedPurchaseActor) {
  return db.$transaction(async (tx) => {
    const stores = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "pos_stores" WHERE "id" = ${actor.storeId} FOR UPDATE
    `;
    if (!stores.length) throw new BackdatedPurchaseError("Toko tidak ditemukan.", 404);
    const fingerprint = requestFingerprint(input);
    const existing = await tx.backdatedPurchase.findUnique({
      where: { storeId_requestId: { storeId: actor.storeId, requestId: input.requestId } },
      include: purchaseInclude,
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        throw new BackdatedPurchaseError("Permintaan sudah digunakan. Muat ulang formulir.", 409);
      }
      return backdatedPurchaseView(existing);
    }
    const created = await tx.backdatedPurchase.create({
      data: {
        storeId: actor.storeId,
        purchaseDate: calendarDate(input.purchaseDate),
        paymentMethod: input.paymentMethod,
        dueDate: calendarDate(input.dueDate),
        reference: input.reference,
        amount: decimalFromCents(input.amountCents),
        requestId: input.requestId,
        requestFingerprint: fingerprint,
        createdById: actor.id,
        createdByName: actor.name ?? null,
        payments: {
          create: input.payments.map((payment) => ({
            requestId: payment.requestId,
            amount: decimalFromCents(payment.amountCents),
            paidAt: calendarDate(payment.paidAt),
            createdById: actor.id,
          })),
        },
      },
      include: purchaseInclude,
    });
    for (const payment of created.payments) await syncPaymentExpense(tx, created, payment);
    await syncDueExpense(tx, created);
    return backdatedPurchaseView(created);
  }, { timeout: 15_000 });
}

export async function getBackdatedPurchase(id: string, actor: BackdatedPurchaseActor) {
  const row = await db.backdatedPurchase.findFirst({ where: { id, storeId: actor.storeId }, include: purchaseInclude });
  if (!row) throw new BackdatedPurchaseError("Belanja terdahulu tidak ditemukan.", 404);
  return backdatedPurchaseView(row);
}

export async function addBackdatedPurchasePayment(
  id: string,
  input: BackdatedPaymentInput,
  actor: BackdatedPurchaseActor,
) {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "pos_backdated_purchases"
      WHERE "id" = ${id} AND "storeId" = ${actor.storeId} FOR UPDATE
    `;
    if (!locked.length) throw new BackdatedPurchaseError("Belanja terdahulu tidak ditemukan.", 404);
    const row = await tx.backdatedPurchase.findFirst({ where: { id, storeId: actor.storeId }, include: purchaseInclude });
    if (!row) throw new BackdatedPurchaseError("Belanja terdahulu tidak ditemukan.", 404);
    const existing = row.payments.find((payment) => payment.requestId === input.requestId);
    if (existing) {
      if (centsFromDecimal(existing.amount) !== input.amountCents || dateKey(existing.paidAt) !== input.paidAt) {
        throw new BackdatedPurchaseError("Permintaan pembayaran sudah digunakan. Muat ulang formulir.", 409);
      }
      return backdatedPurchaseView(row);
    }
    if (input.amountCents > recognition(row).remainingCents) {
      throw new BackdatedPurchaseError("Pembayaran tidak boleh melebihi sisa tagihan.", 422);
    }
    const payment = await tx.backdatedPurchasePayment.create({
      data: {
        purchaseId: row.id,
        requestId: input.requestId,
        amount: decimalFromCents(input.amountCents),
        paidAt: calendarDate(input.paidAt),
        createdById: actor.id,
      },
    });
    const updated: PurchaseRow = { ...row, payments: [...row.payments, payment] };
    await syncPaymentExpense(tx, updated, payment);
    await syncDueExpense(tx, updated);
    return backdatedPurchaseView(updated);
  }, { timeout: 15_000 });
}
