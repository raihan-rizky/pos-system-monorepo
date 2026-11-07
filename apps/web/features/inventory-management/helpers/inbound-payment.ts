import type { InboundPaymentInput } from "../types/inventory-management";

type LegacyInboundPayment = {
  method: "TRANSFER" | "GIRO";
  dueDate?: string | null;
};

function toCents(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 9_999_999_999.99 ||
    Math.abs(value * 100 - Math.round(value * 100)) > 0.0001) {
    throw new Error("Nominal pembayaran harus valid, maksimal dua angka desimal dan Rp9.999.999.999,99.");
  }
  return Math.round(value * 100);
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateInboundPayments(
  totalAmount: number,
  payments: InboundPaymentInput[],
  options: { allowZeroTotalLegacy?: boolean } = {},
): { totalAmount: number; payments: InboundPaymentInput[] } {
  if (!payments.length || payments.length > 50) throw new Error("Isi minimal satu pembayaran dan maksimal 50 pembayaran.");
  const expectedCents = toCents(totalAmount);
  const normalized = payments.map((payment) => {
    if (payment.method !== "GIRO" && payment.method !== "TRANSFER") throw new Error("Metode pembayaran harus Transfer atau Giro.");
    const amountCents = toCents(payment.amount);
    if (amountCents <= 0 && !(options.allowZeroTotalLegacy && expectedCents === 0 && payments.length === 1)) {
      throw new Error("Nominal pembayaran harus lebih dari 0.");
    }
    if (payment.method === "GIRO") {
      if (!payment.dueDate || !isIsoDate(payment.dueDate)) {
        throw new Error("Giro wajib memiliki tanggal jatuh tempo yang valid.");
      }
    } else if (payment.dueDate) {
      throw new Error("Transfer tidak boleh memiliki tanggal jatuh tempo.");
    }
    return {
      method: payment.method,
      amount: amountCents / 100,
      dueDate: payment.method === "GIRO" ? payment.dueDate : null,
      note: payment.note?.trim() || null,
    } satisfies InboundPaymentInput;
  });
  const actualCents = normalized.reduce((sum, payment) => sum + toCents(payment.amount), 0);
  if (actualCents !== expectedCents) {
    throw new Error("Total pembayaran harus sama dengan total Pembelian Barang.");
  }
  return { totalAmount: expectedCents / 100, payments: normalized };
}

export function sameInboundPayments(left: InboundPaymentInput[], right: InboundPaymentInput[]): boolean {
  const signature = (rows: InboundPaymentInput[]) => JSON.stringify(rows.map(row =>
    [row.method, toCents(row.amount), row.dueDate || null, row.note?.trim() || null],
  ).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  return signature(left) === signature(right);
}

export function inboundPaymentSummary(payments: InboundPaymentInput[]): {
  paymentMethod: "TRANSFER" | "GIRO" | null; paymentDueDate: string | null;
} {
  const method = payments.length && payments.every(row => row.method === payments[0].method) ? payments[0].method : null;
  return { paymentMethod: method || null, paymentDueDate: method === "GIRO"
    ? payments.map(row => row.dueDate!).sort()[0] : null };
}

export function normalizeInboundPayments(input: {
  totalAmount: number;
  payments?: InboundPaymentInput[] | null;
  legacy: LegacyInboundPayment | null;
}): { source: "current" | "legacy"; payments: InboundPaymentInput[] } {
  if (input.payments?.length) {
    return { source: "current", payments: validateInboundPayments(input.totalAmount, input.payments, { allowZeroTotalLegacy: true }).payments };
  }
  if (!input.legacy) throw new Error("Metode pembayaran belum diisi pada Pembelian Barang.");
  const legacy = validateInboundPayments(input.totalAmount, [{
    method: input.legacy.method,
    amount: input.totalAmount,
    dueDate: input.legacy.dueDate ?? null,
    note: null,
  }], { allowZeroTotalLegacy: true });
  return { source: "legacy", payments: legacy.payments };
}
