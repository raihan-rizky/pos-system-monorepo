import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), load: vi.fn(), authorize: vi.fn() }));
vi.mock('@pos/db', () => ({ db: { $transaction: mocks.transaction } }));
vi.mock('@/lib/rbac/guard', () => ({ requireRole: async () => ({ id: 'user', storeId: 'store', role: 'OWNER' }), authorizeInTransaction: mocks.authorize, handleAuthError: () => null }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock('@/features/suppliers/shopping-requests/repositories/shopping-request-correction-payment-state', () => ({ loadCorrectionPaymentState: mocks.load }));
import { POST } from '../[id]/payments/route';

describe('corrected mixed giro balance', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue(true);
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: (parts: TemplateStringsArray, ...values: unknown[]) => parts.join(' ').includes('pg_advisory_xact_lock') || parts.join(' ').includes('FROM "pos_payable_payment_attempts"') ? Promise.resolve([]) : mocks.query(parts, ...values), $executeRaw: async () => 0, goodsPurchasePayment: { count: async () => 1 } }));
    mocks.query.mockResolvedValueOnce([{ amount: '10000.00', debtDate: '2026-10-01', dueDate: null, goodsPurchaseId: 'purchase', shoppingRequestId: 'shopping', corrected: true, giroHistoryVerifiedAt: new Date(), ledgerVersion: '3' }])
      .mockResolvedValueOnce([]).mockImplementation(async (parts: TemplateStringsArray) => parts.join(' ').includes('COALESCE(SUM(p.') ? [{ paid: '0', credited: '500.00', corrected: true, purchaseMethod: null, scheduleCount: 2, giroAmount: '7000.00' }] : parts.join(' ').includes('INSERT INTO') ? [{ id: 'new-payment' }] : []);
    mocks.load.mockResolvedValue({ paid: '3000.00', sources: [{ amount: '3000.00', paidAt: '2026-10-10' }], byMethod: { TRANSFER: '2000.00', GIRO: '1000.00' } });
  });
  it('accepts the displayed corrected purchase balance after all payment methods and supplier credit', async () => {
    const request = new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'b14f880a-fb50-43bc-a2aa-4733c8811dad' }, body: JSON.stringify({ amount: '6500', paidAt: '2026-10-10', expectedBalance: '6500', expectedLedgerVersion: '6' }) });
    expect((await POST(request, { params: Promise.resolve({ id: 'giro' }) })).status).toBe(201);
    expect(mocks.query.mock.invocationCallOrder[3]).toBeLessThan(mocks.authorize.mock.invocationCallOrder[0]);
    expect(mocks.load.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.authorize.mock.invocationCallOrder[0]);
  });

  it.each([['6500', 201], ['6501', 422]])('handles a payment of %s when Rp3.000 is already recorded for a future date', async (amount, status) => {
    mocks.load.mockResolvedValue({ paid: '3000.00', sources: [{ amount: '3000.00', paidAt: '2099-12-05' }] });
    const request = new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'b14f880a-fb50-43bc-a2aa-4733c8811dad' }, body: JSON.stringify({ amount, paidAt: '2026-10-10', expectedBalance: '9500', expectedLedgerVersion: '6' }) });
    expect((await POST(request, { params: Promise.resolve({ id: 'giro' }) })).status).toBe(status);
  });

  it('does not invoke the mutating correction loader when authorization fails', async () => {
    mocks.authorize.mockResolvedValue(false);
    const request = new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'b14f880a-fb50-43bc-a2aa-4733c8811dad' }, body: JSON.stringify({ amount: '6000', paidAt: '2026-10-10', expectedBalance: '6000', expectedLedgerVersion: '6' }) });
    expect((await POST(request, { params: Promise.resolve({ id: 'giro' }) })).status).toBe(403);
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.query.mock.invocationCallOrder[3]).toBeLessThan(mocks.authorize.mock.invocationCallOrder[0]);
  });
});
