export type ManualPayablePayment = {
  id: string;
  amountCents: number;
  paidAt: string;
  origin: "MANUAL" | "AUTO" | "CORRECTED_AUTO";
};

export type PayableLedgerInput = {
  payableId: string;
  amountCents: number;
  debtDate: string;
  dueDate: string | null;
  todayWib: string;
  payments: ManualPayablePayment[];
};

export type PayableLedgerProjection = {
  remainingCents: number;
  payments: ManualPayablePayment[];
};

/** A giro link must not remove a settlement that the user has not reviewed. */
export function hasUnreviewedAutomaticSettlement(debt: { amount: string | number; dueDate: string | null },
  payments: Array<{ amount: string | number; origin?: string }>, todayWib: string): boolean {
  if (payments.some(payment => payment.origin === "AUTO")) return true;
  const paid = payments.reduce((sum, payment) => sum + Math.round(Number(payment.amount) * 100), 0);
  return debt.dueDate !== null && debt.dueDate <= todayWib && paid < Math.round(Number(debt.amount) * 100);
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function projectPayableLedger(input: PayableLedgerInput): PayableLedgerProjection {
  const { payableId, amountCents, debtDate, dueDate, todayWib } = input;
  if (!payableId || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 999_999_999_999
    || !isCalendarDate(debtDate) || !isCalendarDate(todayWib)
    || (dueDate !== null && (!isCalendarDate(dueDate) || dueDate < debtDate))) {
    throw new Error("Data hutang tidak valid.");
  }
  if (debtDate > todayWib) {
    if (input.payments.length) throw new Error("Pembayaran hutang mendatang tidak valid.");
    return { remainingCents: 0, payments: [] };
  }

  const automaticId = `auto:${payableId}`;
  const ids = new Set<string>();
  let paidCents = 0;
  let automatic: ManualPayablePayment | undefined;
  const payments: PayableLedgerProjection["payments"] = [];
  for (const payment of input.payments) {
    if (!payment.id || (payment.id === automaticId && payment.origin !== "AUTO") || ids.has(payment.id)
      || !Number.isSafeInteger(payment.amountCents) || payment.amountCents <= 0
      || !isCalendarDate(payment.paidAt) || payment.paidAt < debtDate || payment.paidAt > todayWib
      || (payment.origin !== "MANUAL" && payment.origin !== "AUTO" && payment.origin !== "CORRECTED_AUTO")) {
      throw new Error("Data pembayaran hutang tidak valid.");
    }
    ids.add(payment.id);
    if (payment.origin === "AUTO") {
      if (automatic || dueDate === null || dueDate > todayWib) throw new Error("Pelunasan otomatis tidak valid.");
      automatic = payment;
      continue;
    }
    paidCents += payment.amountCents;
    if (!Number.isSafeInteger(paidCents) || paidCents > amountCents) {
      throw new Error("Jumlah pembayaran melebihi hutang.");
    }
    payments.push({ ...payment });
  }

  const outstanding = amountCents - paidCents;
  if (dueDate !== null && dueDate <= todayWib && outstanding > 0) {
    payments.push({ id: automatic?.id ?? automaticId, amountCents: outstanding, paidAt: dueDate, origin: "AUTO" });
  }
  payments.sort((a, b) => a.paidAt.localeCompare(b.paidAt) || a.id.localeCompare(b.id));
  return { remainingCents: dueDate !== null && dueDate <= todayWib ? 0 : outstanding, payments };
}
