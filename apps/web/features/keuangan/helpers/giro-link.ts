import { jakartaToday, parseAmount, validDate } from "./supplier-payable-input";

export type LinkPayment = { id?: string; amount: number; paidAt: string };
export type LinkGiro = { amount: number; debtDate: string | null; payableDebtDate?: string | null; payments: LinkPayment[] };
export type LinkManual = { amount: number; debtDate: string; payments: LinkPayment[] };
export type LinkGiroRecord = LinkGiro & { goodsPurchaseId: string; number: string; supplierName: string; dueDate: string | null; payableId: string | null; payableNote?: string | null; schedule?: { id: string; amount: number; dueDate: string; note: string | null }[]; status: "UNKNOWN" | "UNPAID" | "PARTIAL" | "PAID"; historyIssue?: boolean };
export type LinkManualRecord = LinkManual & { id: string; supplierName: string; dueDate: string | null; note?: string | null };
export type DuplicatePayment = { giroPaymentId: string; manualPaymentId: string };

export const sameLinkPayment = (a: LinkPayment, b: LinkPayment) => a.paidAt === b.paidAt && Math.round(a.amount * 100) === Math.round(b.amount * 100);

/** Build a preview only from choices made explicitly by the user. */
export function planGiroLink(giro: LinkGiro, manual: LinkManual, choices: Record<string, string>) {
  let issue: string | null = null;
  const giroDate = giro.payableDebtDate ?? giro.debtDate;
  const amount = parseAmount(giro.amount);
  const manualAmount = parseAmount(manual.amount);
  const all = [...giro.payments, ...manual.payments];
  const ids = all.map(payment => payment.id);
  const today = jakartaToday();
  if (!amount || !manualAmount || Math.round(amount * 100) !== Math.round(manualAmount * 100)) issue = "Nominal kedua hutang harus sama.";
  else if (!validDate(giroDate) || !validDate(manual.debtDate) || giroDate > today || manual.debtDate > today
    || giro.payments.some(payment => !parseAmount(payment.amount) || !validDate(payment.paidAt) || payment.paidAt < (giroDate ?? "") || payment.paidAt > today)
    || manual.payments.some(payment => !parseAmount(payment.amount) || !validDate(payment.paidAt) || payment.paidAt < manual.debtDate || payment.paidAt > today)) issue = "Tanggal atau nominal riwayat pembayaran tidak sesuai. Periksa kedua catatan.";
  else if (ids.some(id => !id) || new Set(ids).size !== ids.length) issue = "Identitas pembayaran belum lengkap. Muat ulang data dan coba lagi.";

  const duplicatePayments: DuplicatePayment[] = [];
  const usedGiro = new Set<string>();
  const usedManual = new Set<string>();
  for (const payment of manual.payments) {
    if (!payment.id) continue;
    const candidates = giro.payments.filter(row => row.id && sameLinkPayment(row, payment));
    if (!candidates.length) continue;
    const choice = choices[payment.id];
    if (!choice) { issue ??= "Pilih apakah setiap pembayaran yang cocok sama atau berbeda."; continue; }
    if (choice === "different") continue;
    const match = candidates.find(row => row.id === choice);
    if (!match?.id || usedGiro.has(match.id)) { issue ??= "Setiap pembayaran giro hanya dapat dipasangkan sekali."; continue; }
    duplicatePayments.push({ giroPaymentId: match.id, manualPaymentId: payment.id });
    usedGiro.add(match.id); usedManual.add(payment.id);
  }
  const paidCents = all.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0)
    - manual.payments.filter(payment => payment.id && usedManual.has(payment.id)).reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0);
  const remainingCents = Math.round((amount ?? 0) * 100) - paidCents;
  if (!Number.isSafeInteger(paidCents) || remainingCents < 0) issue ??= "Total pembayaran gabungan melebihi nominal hutang.";
  const requiresDistinctConfirmation = manual.payments.some(manualPayment => !usedManual.has(manualPayment.id ?? "") && giro.payments.some(giroPayment => sameLinkPayment(giroPayment, manualPayment)));
  return { valid: issue === null, issue, duplicatePayments, requiresDistinctConfirmation, paid: paidCents / 100, remaining: Math.max(0, remainingCents) / 100 };
}

export class GiroLinkChangedError extends Error {}

export async function postGiroLink(giro: LinkGiroRecord, manual: LinkManualRecord, choices: Record<string, string>, historiesConfirmed: boolean, distinctConfirmed: boolean, fetcher: typeof fetch = fetch): Promise<void> {
  const plan = planGiroLink(giro, manual, choices);
  if (!giro.payableId || !plan.valid || !historiesConfirmed || (plan.requiresDistinctConfirmation && !distinctConfirmed)) throw new Error(plan.issue ?? "Periksa dan konfirmasi kedua riwayat sebelum menghubungkan hutang.");
  const response = await fetcher(`/api/finance/giro/${encodeURIComponent(giro.goodsPurchaseId)}/link-manual`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      payableId: manual.id, expectedGiroPayableId: giro.payableId,
      expectedGiro: { amount: giro.amount, debtDate: giro.debtDate, payableDebtDate: giro.payableDebtDate ?? null, payableNote: giro.payableNote ?? null, dueDate: giro.dueDate, supplierName: giro.supplierName },
      expectedManual: { amount: manual.amount, debtDate: manual.debtDate, dueDate: manual.dueDate, supplierName: manual.supplierName, note: manual.note ?? null },
      expectedGiroPayments: giro.payments, expectedManualPayments: manual.payments,
      historiesConfirmed: true, duplicatePayments: plan.duplicatePayments,
      matchingPaymentsConfirmedDistinct: plan.requiresDistinctConfirmation && distinctConfirmed,
    }),
  });
  const body = await response.json().catch(() => null) as { message?: string } | null;
  if (!response.ok) {
    const message = body?.message || "Hutang belum dapat dihubungkan. Silakan coba lagi.";
    if (response.status === 409 || response.status === 404) throw new GiroLinkChangedError(message);
    throw new Error(message);
  }
}
