import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), query: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock('@pos/db', () => ({ db: { $transaction: mocks.transaction } }));
vi.mock('@/lib/rbac/guard', () => ({ requireRole: async () => ({ id: 'user-1', storeId: 'store-1' }), requirePermission: mocks.permission, authorizeInTransaction: async () => true, handleAuthError: mocks.authError }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { POST } from '../[id]/payments/route';

const key = 'b14f880a-fb50-43bc-a2aa-4733c8811dad';
const debt = { amount: '1000.00', debtDate: '2026-10-01', goodsPurchaseId: 'purchase-1', ledgerVersion: '0', giroHistoryVerifiedAt: new Date('2026-10-05T00:00:00Z') };
const context = { params: Promise.resolve({ id: 'debt-1' }) };
const request = (expectedBalance?: unknown, expectedLedgerVersion?: string) => new Request('http://localhost/api/finance/supplier-payables/debt-1/payments', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
  body: JSON.stringify({ amount: '300', paidAt: '2026-10-10', expectedBalance, expectedLedgerVersion }),
});

describe('expected balance for giro payments', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ id: 'user-1', storeId: 'store-1' });
    mocks.authError.mockReturnValue(null);
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join(' ');
      if (sql.includes('pg_advisory_xact_lock') || sql.includes('FROM "pos_payable_payment_attempts"')) return Promise.resolve([]);
      if (sql.startsWith('SELECT "id" FROM "pos_goods_purchase_payments"') || sql.startsWith('SELECT "id" FROM "pos_expenses"')) return Promise.resolve([]);
      return mocks.query(parts, ...values);
    }, $executeRaw: (parts: TemplateStringsArray, ...values: unknown[]) => parts.join(' ').includes('LOCK TABLE "pos_goods_purchases"') ? Promise.resolve(0) : mocks.execute(parts, ...values) }));
    mocks.execute.mockResolvedValue(1);
    mocks.query.mockResolvedValue([{ id: 'payment-1' }]).mockResolvedValueOnce([debt]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ paid: '200.00' }]);
  });

  it.each([undefined, '', '0', '-1', '800.001', 'NaN', true])('rejects a missing or invalid expected balance %s for a new giro payment', async expected => {
    expect((await POST(request(expected), context)).status).toBe(422);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects a stale balance before insert even when the payment still fits', async () => {
    const response = await POST(request('1000', '0'), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'BalanceChanged' });
    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(mocks.execute).toHaveBeenCalled();
  });

  it('compares balances in cents and permits an exact current balance', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ paid: '200.01' }]).mockResolvedValueOnce([{ id: 'payment-1' }]);
    const response = await POST(request('799.99', '0'), context);
    expect(response.status).toBe(201);
    expect(mocks.query).toHaveBeenCalledTimes(4);
  });

  it('subtracts supplier credit before accepting a new cash payment', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ paid: '200.00', credited: '550.00' }]);
    expect((await POST(request('250', '0'), context)).status).toBe(422);
    expect(mocks.query).toHaveBeenCalledTimes(3);
  });

  it('blocks a new payment after the purchase was cancelled in finance', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ paid: '200.00', financeCancelled: true }]);
    expect((await POST(request('800', '0'), context)).status).toBe(409);
    expect(mocks.query).toHaveBeenCalledTimes(3);
  });

  it('returns success for the same previously saved request before checking its now-zero balance', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ createdById: 'user-1', payableId: 'debt-1', amount: '300.00', paidAt: '2026-10-10', requestExpectedBalance: '1000.00' }]);
    const response = await POST(request('1000'), context);
    expect(response.status).toBe(201);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it('rejects a replay when only the expected balance changed', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ createdById: 'user-1', payableId: 'debt-1', amount: '300.00', paidAt: '2026-10-10', requestExpectedBalance: '1000.00' }]);
    const response = await POST(request('800'), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'Conflict' });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it('compares expected balances in cents when replayed', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ createdById: 'user-1', payableId: 'debt-1', amount: '300.00', paidAt: '2026-10-10', requestExpectedBalance: '1000.00' }]);
    expect((await POST(request('1000'), context)).status).toBe(201);
  });

  it('accepts old saved requests only when the retry also has no expected balance', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ createdById: 'user-1', payableId: 'debt-1', amount: '300.00', paidAt: '2026-10-10', requestExpectedBalance: null }]);
    expect((await POST(request(), context)).status).toBe(201);
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ createdById: 'user-1', payableId: 'debt-1', amount: '300.00', paidAt: '2026-10-10', requestExpectedBalance: null }]);
    expect((await POST(request('1000'), context)).status).toBe(409);
  });
});
