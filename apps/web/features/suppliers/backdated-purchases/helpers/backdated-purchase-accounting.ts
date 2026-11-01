export type BackdatedRecognitionInput = {
  amountCents: number;
  dueDate: string;
  payments: ReadonlyArray<{
    id: string;
    amountCents: number;
    paidAt: string;
  }>;
};

export type BackdatedRecognition = {
  paidCents: number;
  remainingCents: number;
  dueCents: number;
  paymentExpenses: Array<{ paymentId: string; expenseCents: number }>;
};

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function calculateBackdatedRecognition({
  amountCents,
  dueDate,
  payments,
}: BackdatedRecognitionInput): BackdatedRecognition {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !isCalendarDate(dueDate)) {
    throw new Error("Nominal pembelian atau tanggal jatuh tempo tidak valid.");
  }

  let paidCents = 0;
  let paidByDueCents = 0;
  const paymentIds = new Set<string>();
  const paymentExpenses = payments.map((payment) => {
    if (
      !payment.id ||
      paymentIds.has(payment.id) ||
      !Number.isSafeInteger(payment.amountCents) ||
      payment.amountCents <= 0 ||
      !isCalendarDate(payment.paidAt)
    ) {
      throw new Error("Data pembayaran tidak valid.");
    }
    paymentIds.add(payment.id);
    paidCents += payment.amountCents;
    if (!Number.isSafeInteger(paidCents) || paidCents > amountCents) {
      throw new Error("Pembayaran tidak boleh melebihi sisa tagihan.");
    }
    const expenseCents = payment.paidAt <= dueDate ? payment.amountCents : 0;
    paidByDueCents += expenseCents;
    return { paymentId: payment.id, expenseCents };
  });

  return {
    paidCents,
    remainingCents: amountCents - paidCents,
    dueCents: amountCents - paidByDueCents,
    paymentExpenses,
  };
}
