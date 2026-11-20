import { validDate } from "./supplier-payable-input";

export type ExpensePaymentToSettle = {
  id: string;
  amountCents: number;
  paidAt: string;
};

type SettlementDetails = {
  paymentId: string;
  amountCents: number;
  reference: string;
};

export type ExpensePaymentDisposition = SettlementDetails & (
  | { kind: "refund"; date: string }
  | { kind: "credit"; supplierId: string }
  | { kind: "entryError" }
);

export function planExpensePaymentSettlement(
  payments: readonly ExpensePaymentToSettle[],
  dispositions: readonly ExpensePaymentDisposition[],
  today: string,
) {
  const paymentById = new Map(payments.map(payment => [payment.id, payment]));
  const remaining = new Map(payments.map(payment => [payment.id, payment.amountCents]));
  const invalid = new Map<string, string>();
  const references = new Set<string>();
  const totals = { refund: 0, credit: 0, entryError: 0 };

  for (const disposition of dispositions) {
    const { paymentId, amountCents } = disposition;
    const payment = paymentById.get(paymentId);
    const available = remaining.get(paymentId) ?? 0;
    const reference = disposition.reference.trim();
    const referenceKey = JSON.stringify([paymentId, disposition.kind, reference]);
    if (!payment) {
      invalid.set(paymentId, "Pembayaran ini tidak terkait dengan transaksi yang dipilih.");
      continue;
    }
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > available) {
      invalid.set(paymentId, "Nominal penyelesaian melebihi sisa pembayaran atau tidak valid.");
      continue;
    }
    if (!reference || references.has(referenceKey)) {
      invalid.set(paymentId, "Isi referensi penyelesaian yang berbeda untuk setiap catatan.");
      continue;
    }
    if (disposition.kind === "refund" &&
        (!validDate(disposition.date) || disposition.date < payment.paidAt || disposition.date > today)) {
      invalid.set(paymentId, "Tanggal dana diterima harus di antara tanggal pembayaran dan hari ini.");
      continue;
    }
    if (disposition.kind === "credit" && !disposition.supplierId.trim()) {
      invalid.set(paymentId, "Pilih pemasok yang mengonfirmasi kredit.");
      continue;
    }
    references.add(referenceKey);
    remaining.set(paymentId, available - amountCents);
    totals[disposition.kind] += amountCents;
  }

  const blockers = Array.from(invalid, ([paymentId, message]) => ({
    paymentId, remainingCents: remaining.get(paymentId) ?? 0, message,
  }));
  for (const [paymentId, remainingCents] of remaining) {
    if (remainingCents > 0 && !invalid.has(paymentId)) {
      blockers.push({ paymentId, remainingCents, message: "Selesaikan pembayaran yang masih tercatat." });
    }
  }
  return {
    blockers,
    settledCents: totals.refund + totals.credit + totals.entryError,
    refundedCents: totals.refund,
    creditCents: totals.credit,
    entryErrorCents: totals.entryError,
  };
}
