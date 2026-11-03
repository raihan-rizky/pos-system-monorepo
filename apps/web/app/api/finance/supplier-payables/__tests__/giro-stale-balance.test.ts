import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), query: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock('@pos/db', () => ({ db: { $transaction: mocks.transaction } }));
vi.mock('@/lib/rbac/guard', () => ({ requireRole: async () => ({ id: 'user-1', storeId: 'store-1' }), requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { POST } from '../[id]/payments/route';

const key = 'b14f880a-fb50-43bc-a2aa-4733c8811dad';
const debt = { amount: '1000.00', debtDate: '2026-10-01', goodsPurchaseId: 'purchase-1', giroHistoryVerifiedAt: new Date('2026-10-05T00:00:00Z') };
const context = { params: Promise.resolve({ id: 'debt-1' }) };
const request = (expectedBalance?: unknown) => new Request('http://localhost/api/finance/supplier-payables/debt-1/payments', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
  body: JSON.stringify({ amount: '300', paidAt: '2026-10-10', expectedBalance }),
});

describe('expected balance for giro payments', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ id: 'user-1', storeId: 'store-1' });
    mocks.authError.mockReturnValue(null);
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: mocks.query, $executeRaw: mocks.execute }));
    mocks.execute.mockResolvedValue(1);
    mocks.query.mockResolvedValue([{ id: 'payment-1' }]).mockResolvedValueOnce([debt]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ paid: '200.00' }]);
  });

  it.each([undefined, '', '0', '-1', '800.001', 'NaN', true])('rejects a missing or invalid expected balance %s for a new giro payment', async expected => {
    expect((await POST(request(expected), context)).status).toBe(422);
    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects a stale balance before insert even when the payment still fits', async () => {
    const response = await POST(request('1000'), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'BalanceChanged' });
    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('compares balances in cents and permits an exact current balance', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ paid: '200.01' }]).mockResolvedValueOnce([{ id: 'payment-1' }]);
    const response = await POST(request('799.99'), context);
    expect(response.status).toBe(201);
    expect(mocks.query).toHaveBeenCalledTimes(4);
  });

  it('returns success for the same previously saved request before checking its now-zero balance', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ payableId: 'debt-1', amount: '300.00', paidAt: '2026-10-10', requestExpectedBalance: '1000.00' }]);
    const response = await POST(request('1000'), context);
    expect(response.status).toBe(201);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it('rejects a replay when only the expected balance changed', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ payableId: 'debt-1', amount: '300.00', paidAt: '2026-10-10', requestExpectedBalance: '1000.00' }]);
    const response = await POST(request('800'), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'Conflict' });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it('compares expected balances in cents when replayed', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ payableId: 'debt-1', amount: '300.00', paidAt: '2026-10-10', requestExpectedBalance: '1000.00' }]);
    expect((await POST(request('1000'), context)).status).toBe(201);
  });

  it('accepts old saved requests only when the retry also has no expected balance', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ payableId: 'debt-1', amount: '300.00', paidAt: '2026-10-10', requestExpectedBalance: null }]);
    expect((await POST(request(), context)).status).toBe(201);
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ payableId: 'debt-1', amount: '300.00', paidAt: '2026-10-10', requestExpectedBalance: null }]);
    expect((await POST(request('1000'), context)).status).toBe(409);
  });
});
