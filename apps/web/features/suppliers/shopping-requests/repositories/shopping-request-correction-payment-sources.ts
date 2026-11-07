import { planCorrectionPayments, type CorrectionPaymentSource } from "../helpers/shopping-request-correction";

function keyed(sources: CorrectionPaymentSource[]): Map<string, CorrectionPaymentSource> {
  const result = new Map<string, CorrectionPaymentSource>();
  const normalized = planCorrectionPayments(sources, sources.map((source) => ({
    paymentId: source.paymentId,
    sourceKind: source.sourceKind,
    amount: source.amount,
    method: source.sourceKind === "PAYABLE_PAYMENT" ? "GIRO" : "TRANSFER",
  })), []).sources;
  for (const source of normalized) {
    if (!source.paymentId || !["TRANSFER_EXPENSE", "PAYABLE_PAYMENT"].includes(source.sourceKind)) {
      throw new Error("Sumber pembayaran tidak valid.");
    }
    const key = JSON.stringify([source.sourceKind, source.paymentId]);
    if (result.has(key)) throw new Error("Sumber pembayaran ganda tidak diperbolehkan.");
    result.set(key, source);
  }
  return result;
}

/**
 * The audit snapshot is the effective history after the most recent correction.
 * Its presence, even as an empty array, distinguishes corrected purchases from
 * legacy purchases whose expense still represents the original transfer.
 */
export function resolveCorrectionPaymentSources(input: {
  previous: CorrectionPaymentSource[] | null;
  current: CorrectionPaymentSource[];
  trustedTransferIds?: string[];
}): CorrectionPaymentSource[] {
  const current = keyed(input.current);
  if (input.previous === null) return [...current.values()];

  const previous = keyed(input.previous);
  for (const key of previous.keys()) {
    if (!current.has(key)) {
      throw new Error("Sumber pembayaran sebelumnya tidak tersedia. Periksa riwayat pembayaran secara manual.");
    }
  }
  const result = [...previous.values()];
  for (const [key, source] of current) {
    if (!previous.has(key) && (source.sourceKind === "PAYABLE_PAYMENT" || input.trustedTransferIds?.includes(source.paymentId))) result.push(source);
  }
  return result;
}
