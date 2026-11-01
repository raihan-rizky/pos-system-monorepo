import { describe, expect, it } from 'vitest';
import { parseGiroLinkManual, planGiroLink } from '../giro-link-manual';

const today = '2026-11-02';
const giroPayment = { id: 'g-1', amount: '30000.00', paidAt: '2026-10-20', requestScope: '["store","key"]' };
const duplicate = { id: 'm-1', amount: '30000.00', paidAt: '2026-10-20', requestScope: null };
const other = { id: 'm-2', amount: '10000.00', paidAt: '2026-10-15', requestScope: null };
const expected = (payment: { id: string; amount: string; paidAt: string }) => ({ id: payment.id, amount: Number(payment.amount), paidAt: payment.paidAt });
const state = { amount: '100000.00', giroDebtDate: '2026-10-10', manualDebtDate: '2026-10-01', giroPayments: [giroPayment], manualPayments: [duplicate, other] };
const input = {
  payableId: 'manual-1', expectedGiroPayableId: 'giro-1', historiesConfirmed: true,
  expectedGiro: { amount: 100000, debtDate: '2026-10-10', payableDebtDate: '2026-10-10', dueDate: '2026-11-20', supplierName: 'Pemasok', payableNote: null },
  expectedManual: { amount: 100000, debtDate: '2026-10-01', dueDate: null, supplierName: 'Pemasok', note: null },
  expectedGiroPayments: [expected(giroPayment)], expectedManualPayments: [expected(duplicate), expected(other)],
  duplicatePayments: [] as { giroPaymentId: string; manualPaymentId: string }[], matchingPaymentsConfirmedDistinct: false,
};

describe('explicit manual giro linking', () => {
  it('requires explicit confirmation and a valid snapshot of both debts and all payment IDs', () => {
    expect(parseGiroLinkManual(input, today)).not.toBeNull();
    expect(parseGiroLinkManual({ ...input, historiesConfirmed: false }, today)).toBeNull();
    expect(parseGiroLinkManual({ ...input, expectedGiro: undefined }, today)).toBeNull();
    expect(parseGiroLinkManual({ ...input, expectedManualPayments: [expected(other), expected(other)] }, today)).toBeNull();
    expect(parseGiroLinkManual({ ...input, expectedManual: { ...input.expectedManual, note: 42 } }, today)).toBeNull();
    expect(parseGiroLinkManual({ ...input, expectedGiro: { ...input.expectedGiro, payableNote: 'Catatan' } }, today)?.expectedGiro.payableNote).toBe('Catatan');
  });

  it('requires separate confirmation for matching payments not explicitly paired', () => {
    expect(planGiroLink(state, input, today)).toEqual({ error: 'potential-duplicate' });
    expect(planGiroLink(state, { ...input, matchingPaymentsConfirmedDistinct: true }, today)).toMatchObject({ remainingCents: 3000000, debtDate: '2026-10-01', duplicateManualIds: [] });
  });

  it('deduplicates only an explicitly selected matching pair and keeps earlier debt date', () => {
    const result = planGiroLink(state, { ...input, duplicatePayments: [{ giroPaymentId: 'g-1', manualPaymentId: 'm-1' }] }, today);
    expect(result).toMatchObject({ debtDate: '2026-10-01', remainingCents: 6000000, duplicateManualIds: ['m-1'] });
  });

  it('rejects changed payment identity, foreign pairs, reused IDs, or unequal dates and amounts', () => {
    expect(planGiroLink(state, { ...input, expectedManualPayments: [{ ...expected(duplicate), id: 'changed' }, expected(other)] }, today)).toEqual({ error: 'history-changed' });
    expect(planGiroLink(state, { ...input, duplicatePayments: [{ giroPaymentId: 'foreign', manualPaymentId: 'm-1' }] }, today)).toEqual({ error: 'invalid' });
    expect(planGiroLink(state, { ...input, duplicatePayments: [{ giroPaymentId: 'g-1', manualPaymentId: 'm-2' }] }, today)).toEqual({ error: 'invalid' });
    expect(planGiroLink(state, { ...input, duplicatePayments: [{ giroPaymentId: 'g-1', manualPaymentId: 'm-1' }, { giroPaymentId: 'g-1', manualPaymentId: 'm-1' }] }, today)).toEqual({ error: 'invalid' });
  });

  it('never deletes an idempotent payment or accepts an overpayment', () => {
    const protectedState = { ...state, manualPayments: [{ ...duplicate, requestScope: 'previous-key' }, other] };
    expect(planGiroLink(protectedState, { ...input, duplicatePayments: [{ giroPaymentId: 'g-1', manualPaymentId: 'm-1' }] }, today)).toEqual({ error: 'protected-payment' });
    expect(planGiroLink({ ...state, amount: '50000.00' }, { ...input, matchingPaymentsConfirmedDistinct: true }, today)).toEqual({ error: 'invalid' });
  });

  it('rejects payments that predate their source debt or occur in the future', () => {
    expect(planGiroLink({ ...state, giroDebtDate: '2026-10-21' }, input, today)).toEqual({ error: 'invalid' });
    expect(planGiroLink({ ...state, manualDebtDate: '2026-10-16' }, input, today)).toEqual({ error: 'invalid' });
  });
});
