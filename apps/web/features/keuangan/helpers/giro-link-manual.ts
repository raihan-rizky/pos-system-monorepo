import { jakartaToday, parseAmount, validDate } from './supplier-payable-input';

type ExpectedPayment = { id: string; amount: number; paidAt: string };
type StoredPayment = { id: string; amount: string | number; paidAt: string; requestScope: string | null };
type ExpectedDebt = { amount: number; debtDate: string | null; dueDate: string | null; supplierName: string };
type DuplicatePayment = { giroPaymentId: string; manualPaymentId: string };

export type GiroLinkInput = {
  payableId: string;
  expectedGiroPayableId: string;
  expectedGiro: ExpectedDebt & { payableDebtDate: string | null; payableNote: string | null };
  expectedManual: ExpectedDebt & { note: string | null };
  expectedGiroPayments: ExpectedPayment[];
  expectedManualPayments: ExpectedPayment[];
  duplicatePayments: DuplicatePayment[];
  historiesConfirmed: true;
  matchingPaymentsConfirmedDistinct: boolean;
};

const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const validId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value;
const validOptionalDate = (value: unknown): value is string | null => value === null || validDate(value);
const validNote = (value: unknown): value is string | null => value === null || (typeof value === 'string' && value.length <= 1000000);

function parseDebt(value: unknown): ExpectedDebt | null {
  if (!isObject(value)) return null;
  const amount = parseAmount(value.amount);
  if (!amount || !validOptionalDate(value.debtDate) || !validOptionalDate(value.dueDate)
    || typeof value.supplierName !== 'string' || !value.supplierName.trim() || value.supplierName.length > 200) return null;
  return { amount, debtDate: value.debtDate, dueDate: value.dueDate, supplierName: value.supplierName };
}

function parsePayments(value: unknown, today: string): ExpectedPayment[] | null {
  if (!Array.isArray(value) || value.length > 10000) return null;
  const seen = new Set<string>();
  const result: ExpectedPayment[] = [];
  for (const item of value) {
    if (!isObject(item) || !validId(item.id) || seen.has(item.id)) return null;
    const amount = parseAmount(item.amount);
    if (!amount || !validDate(item.paidAt) || item.paidAt > today) return null;
    seen.add(item.id);
    result.push({ id: item.id, amount, paidAt: item.paidAt });
  }
  return result;
}

export function parseGiroLinkManual(input: unknown, today = jakartaToday()): GiroLinkInput | null {
  if (!isObject(input) || !validDate(today) || input.historiesConfirmed !== true
    || !validId(input.payableId) || !validId(input.expectedGiroPayableId) || !isObject(input.expectedGiro) || !isObject(input.expectedManual)) return null;
  const giro = parseDebt(input.expectedGiro);
  const manual = parseDebt(input.expectedManual);
  const giroPayments = parsePayments(input.expectedGiroPayments, today);
  const manualPayments = parsePayments(input.expectedManualPayments, today);
  if (!giro || !manual || !validOptionalDate(input.expectedGiro.payableDebtDate)
    || !validNote(input.expectedGiro.payableNote) || !validNote(input.expectedManual.note) || !giroPayments || !manualPayments
    || !Array.isArray(input.duplicatePayments) || input.duplicatePayments.length > Math.min(giroPayments.length, manualPayments.length)
    || (input.matchingPaymentsConfirmedDistinct !== undefined && typeof input.matchingPaymentsConfirmedDistinct !== 'boolean')) return null;
  const duplicatePayments: DuplicatePayment[] = [];
  const giroIds = new Set<string>();
  const manualIds = new Set<string>();
  for (const pair of input.duplicatePayments) {
    if (!isObject(pair) || !validId(pair.giroPaymentId) || !validId(pair.manualPaymentId)
      || giroIds.has(pair.giroPaymentId) || manualIds.has(pair.manualPaymentId)) return null;
    giroIds.add(pair.giroPaymentId);
    manualIds.add(pair.manualPaymentId);
    duplicatePayments.push({ giroPaymentId: pair.giroPaymentId, manualPaymentId: pair.manualPaymentId });
  }
  return {
    payableId: input.payableId, expectedGiroPayableId: input.expectedGiroPayableId,
    expectedGiro: { ...giro, payableDebtDate: input.expectedGiro.payableDebtDate, payableNote: input.expectedGiro.payableNote },
    expectedManual: { ...manual, note: input.expectedManual.note },
    expectedGiroPayments: giroPayments, expectedManualPayments: manualPayments, duplicatePayments,
    historiesConfirmed: true, matchingPaymentsConfirmedDistinct: input.matchingPaymentsConfirmedDistinct === true,
  };
}

type LinkState = { amount: string | number; giroDebtDate: string; manualDebtDate: string; giroPayments: StoredPayment[]; manualPayments: StoredPayment[] };
type PlanInput = Pick<GiroLinkInput, 'expectedGiroPayments' | 'expectedManualPayments' | 'duplicatePayments' | 'matchingPaymentsConfirmedDistinct'>;
type Plan = { error: 'invalid' | 'history-changed' | 'potential-duplicate' | 'protected-payment' }
  | { debtDate: string; remainingCents: number; duplicateManualIds: string[] };

function samePayments(stored: StoredPayment[], expected: ExpectedPayment[]): boolean {
  if (stored.length !== expected.length) return false;
  const byId = new Map(stored.map(payment => [payment.id, payment]));
  const ids = new Set<string>();
  return byId.size === stored.length && expected.every(payment => {
    const found = byId.get(payment.id);
    if (!found || ids.has(payment.id)) return false;
    ids.add(payment.id);
    return found.paidAt === payment.paidAt && Math.round(Number(found.amount) * 100) === Math.round(payment.amount * 100);
  });
}

export function planGiroLink(state: LinkState, input: PlanInput, today: string): Plan {
  const amount = parseAmount(state.amount);
  if (!amount || !validDate(today) || !validDate(state.giroDebtDate) || !validDate(state.manualDebtDate)
    || state.giroDebtDate > today || state.manualDebtDate > today) return { error: 'invalid' };
  if (!samePayments(state.giroPayments, input.expectedGiroPayments) || !samePayments(state.manualPayments, input.expectedManualPayments)) return { error: 'history-changed' };
  for (const [payments, debtDate] of [[state.giroPayments, state.giroDebtDate], [state.manualPayments, state.manualDebtDate]] as const) {
    if (payments.some(payment => !parseAmount(payment.amount) || !validDate(payment.paidAt) || payment.paidAt < debtDate || payment.paidAt > today)) return { error: 'invalid' };
  }
  const giroById = new Map(state.giroPayments.map(payment => [payment.id, payment]));
  const manualById = new Map(state.manualPayments.map(payment => [payment.id, payment]));
  const selectedGiro = new Set<string>();
  const selectedManual = new Set<string>();
  for (const pair of input.duplicatePayments) {
    const giro = giroById.get(pair.giroPaymentId);
    const manual = manualById.get(pair.manualPaymentId);
    if (!giro || !manual || selectedGiro.has(giro.id) || selectedManual.has(manual.id) || giro.paidAt !== manual.paidAt
      || Math.round(Number(giro.amount) * 100) !== Math.round(Number(manual.amount) * 100)) return { error: 'invalid' };
    if (manual.requestScope !== null) return { error: 'protected-payment' };
    selectedGiro.add(giro.id);
    selectedManual.add(manual.id);
  }
  const remainingManual = state.manualPayments.filter(payment => !selectedManual.has(payment.id));
  const signatures = new Set(state.giroPayments.map(payment => `${payment.paidAt}:${Math.round(Number(payment.amount) * 100)}`));
  if (!input.matchingPaymentsConfirmedDistinct && remainingManual.some(payment => signatures.has(`${payment.paidAt}:${Math.round(Number(payment.amount) * 100)}`))) return { error: 'potential-duplicate' };
  const paidCents = [...state.giroPayments, ...remainingManual].reduce((sum, payment) => sum + Math.round(Number(payment.amount) * 100), 0);
  const remainingCents = Math.round(amount * 100) - paidCents;
  if (!Number.isSafeInteger(paidCents) || remainingCents < 0) return { error: 'invalid' };
  return { debtDate: state.giroDebtDate < state.manualDebtDate ? state.giroDebtDate : state.manualDebtDate, remainingCents, duplicateManualIds: [...selectedManual] };
}
