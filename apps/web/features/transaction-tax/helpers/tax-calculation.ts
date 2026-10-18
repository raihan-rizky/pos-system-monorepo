export type TaxMethod = "STANDARD" | "DPP_NILAI_LAIN";

export function calculateTransactionTax(input: {
  subtotal: number;
  discount?: number;
  taxRate: number;
  taxMethod: TaxMethod;
}) {
  if (!Number.isFinite(input.taxRate) || input.taxRate < 0 || input.taxRate > 100 ||
      Math.abs(input.taxRate * 100 - Math.round(input.taxRate * 100)) > 1e-8) {
    throw new Error("Isi persentase pajak 0–100 dengan maksimal dua angka desimal.");
  }
  if (!Number.isFinite(input.subtotal) || !Number.isFinite(input.discount ?? 0)) {
    throw new Error("Jumlah transaksi tidak valid.");
  }
  const netAmount = Math.round(Math.max(0, input.subtotal - (input.discount ?? 0)) * 100) / 100;
  const basis = input.taxMethod === "DPP_NILAI_LAIN" ? netAmount * 11 / 12 : netAmount;
  // Integer fractions keep half-rupiah rounding exact for decimal rates and DPP.
  const numerator = BigInt(Math.round(netAmount * 100)) * BigInt(Math.round(input.taxRate * 100)) * BigInt(input.taxMethod === "DPP_NILAI_LAIN" ? 11 : 1);
  const denominator = BigInt(1000000) * BigInt(input.taxMethod === "DPP_NILAI_LAIN" ? 12 : 1);
  const tax = Number((numerator + denominator / BigInt(2)) / denominator);
  return { netAmount, dpp: Math.round(basis), tax, total: Math.round((netAmount + tax) * 100) / 100 };
}

export function calculateTaxPaymentState(input: {
  status: string; paymentMethod: string; amountPaid: number; change: number; total: number; previousTotal?: number;
}) {
  // Change was already handed back on the previous receipt.
  const amountPaid = Math.round(Math.max(0, input.amountPaid - input.change) * 100) / 100;
  const provisional = input.status === "DRAFT" || input.status === "PENDING_APPROVAL";
  const remaining = provisional ? 0 : Math.round(Math.max(0, input.total - amountPaid) * 100) / 100;
  const status = provisional || input.paymentMethod === "TEMPO" ? input.status : remaining > 0 ? "DP" : "COMPLETED";
  if (input.previousTotal === input.total) return { status, amountPaid: input.amountPaid, change: input.change, remaining };
  return { status, amountPaid, change: provisional ? 0 : Math.round(Math.max(0, amountPaid - input.total) * 100) / 100, remaining };
}

export function getTransactionTaxMethod(transaction: { taxRate?: unknown; taxMethod?: string | null; status: string }): TaxMethod {
  if (transaction.taxMethod === "DPP_NILAI_LAIN") return "DPP_NILAI_LAIN";
  if (transaction.taxRate != null) return "STANDARD";
  return transaction.status === "DRAFT" ? "DPP_NILAI_LAIN" : "STANDARD";
}

export function getTransactionTaxRate(transaction: { subtotal?: unknown; discount?: unknown; tax?: unknown; taxRate?: unknown; taxMethod?: string | null; status: string }): number {
  if (transaction.taxRate != null) return Number(transaction.taxRate);
  const net = Math.max(0, Number(transaction.subtotal ?? 0) - Number(transaction.discount ?? 0));
  const basis = getTransactionTaxMethod(transaction) === "DPP_NILAI_LAIN" ? net * 11 / 12 : net;
  return basis > 0 ? Math.round(Number(transaction.tax ?? 0) / basis * 10000) / 100 : 0;
}

export function formatTaxRate(rate: number): string {
  return `${rate.toLocaleString("id-ID", { maximumFractionDigits: 2 })}%`;
}
