import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn() }));
vi.mock('@pos/db', () => ({ db: { $transaction: mocks.transaction } }));
vi.mock('@/lib/rbac/guard', () => ({ requireRole: async () => ({ id: 'user-1', storeId: 'store-1' }), authorizeInTransaction: async () => true, handleAuthError: () => null }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { POST } from '../[id]/payments/route';

const key = 'b14f880a-fb50-43bc-a2aa-4733c8811dad';
const context = { params: Promise.resolve({ id: 'debt-1' }) };
const request = (version?: unknown) => new Request('http://localhost/api/finance/supplier-payables/debt-1/payments', {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
  body: JSON.stringify({ amount: '300.00', paidAt: '2026-10-10', expectedBalance: '1000.00', expectedLedgerVersion: version }),
});
const debt = { amount: '1300.00', debtDate: '2026-10-01', dueDate: null, goodsPurchaseId: 'purchase-1', giroHistoryVerifiedAt: new Date(), ledgerVersion: '2' };

describe('persistent payment ledger version', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: (parts: TemplateStringsArray, ...values: unknown[]) => {
      const sql = parts.join(' ');
      if (sql.includes('pg_advisory_xact_lock') || sql.includes('FROM "pos_payable_payment_attempts"')) return Promise.resolve([]);
      if (sql.startsWith('SELECT "id" FROM "pos_goods_purchase_payments"') || sql.startsWith('SELECT "id" FROM "pos_expenses"')) return Promise.resolve([]);
      return mocks.query(parts, ...values);
    }, $executeRaw: async () => 0 }));
    mocks.query.mockResolvedValue([{ id: 'payment-1' }]).mockResolvedValueOnce([debt]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ paid: '300.00', corrected: false }]);
  });

  it('rejects an old snapshot even when payment and correction restored the same balance', async () => {
    const response = await POST(request('0'), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'BalanceChanged' });
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it('rejects a new payment without a server ledger version', async () => {
    const response = await POST(request(), context);
    expect(response.status).toBe(422);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it.each([null, 0, '', '00', '-1', '1.0', '123456789012345678901'])('rejects invalid version %s for a new request', async version => {
    expect((await POST(request(version), context)).status).toBe(422);
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it('allows a legacy idempotent replay without a ledger version', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ createdById: 'user-1', payableId: 'debt-1', amount: '300.00', paidAt: '2026-10-10', requestExpectedBalance: '1000.00', requestLedgerVersion: null }]);
    expect((await POST(request(), context)).status).toBe(201);
  });

  it('rejects an idempotent retry with a different ledger version', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([{ createdById: 'user-1', payableId: 'debt-1', amount: '300.00', paidAt: '2026-10-10', requestExpectedBalance: '1000.00', requestLedgerVersion: '0' }]);
    expect((await POST(request('1'), context)).status).toBe(409);
  });
});
