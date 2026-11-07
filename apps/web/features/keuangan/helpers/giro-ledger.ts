export type GiroPayment = { amount: number; paidAt: string };
export type GiroBalance =
  | { status: "UNKNOWN"; paid: null; remaining: null }
  | { status: "UNPAID" | "PARTIAL" | "PAID"; paid: number; remaining: number }
  | { status: "OVERPAID"; paid: number; remaining: 0; overpaid: number };

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function toCents(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.0001) {
    throw new Error("Nominal giro tidak valid.");
  }
  return Math.round(amount * 100);
}

export function summarizeGiro(amount: number, payments: GiroPayment[], verified: boolean, asOf: string, options?: { allowCorrection?: boolean }): GiroBalance {
  const total = options?.allowCorrection && amount === 0 ? 0 : toCents(amount);
  if (!validCalendarDate(asOf)) throw new Error("Tanggal laporan giro tidak valid.");
  if (!verified) return { status: "UNKNOWN", paid: null, remaining: null };

  let paid = 0;
  for (const payment of payments) {
    if (!validCalendarDate(payment.paidAt)) throw new Error("Tanggal pembayaran giro tidak valid.");
    const paymentCents = toCents(payment.amount);
    if (payment.paidAt <= asOf) paid += paymentCents;
  }
  if (paid > total) {
    if (!options?.allowCorrection) throw new Error("Pembayaran giro melebihi nominal hutang.");
    return { status: "OVERPAID", paid: paid / 100, remaining: 0, overpaid: (paid - total) / 100 };
  }
  return {
    status: paid === total ? "PAID" : paid === 0 ? "UNPAID" : "PARTIAL",
    paid: paid / 100,
    remaining: (total - paid) / 100,
  };
}
