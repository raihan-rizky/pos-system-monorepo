import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn(), authorize: vi.fn() }));
vi.mock('@pos/db', () => ({ db: { $transaction: mocks.transaction } }));
vi.mock('@/lib/rbac/guard', () => ({ requireRole: async () => ({ id: 'user', storeId: 'store', role: 'OWNER' }), authorizeInTransaction: mocks.authorize, handleAuthError: () => null }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { POST } from '../[id]/payments/route';
const context = { params: Promise.resolve({ id: 'debt' }) };
const request = (version: string | undefined = '0') => new Request('http://localhost/api/finance/supplier-payables/debt/payments?resolve=1', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'b14f880a-fb50-43bc-a2aa-4733c8811dad', 'X-Payment-User': 'user', 'X-Payment-Store': 'store' }, body: JSON.stringify({ amount: '300', paidAt: '2026-10-10', expectedBalance: '1000', expectedLedgerVersion: version, resource: 'MANUAL' }) });
const debt = { amount: '1000', debtDate: '2026-10-01', dueDate: null, goodsPurchaseId: 'purchase', giroHistoryVerifiedAt: new Date(), ledgerVersion: '1' };
describe('payment recovery after a debt changes type', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockImplementation(async (_tx, _user, requirements) => requirements.resources.every((grant: { resource: string }) => grant.resource === 'expense.payable'));
    mocks.execute.mockResolvedValue(1);
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: (parts: TemplateStringsArray, ...values: unknown[]) => parts.join(' ').includes('pg_advisory_xact_lock') ? Promise.resolve([]) : mocks.query(parts, ...values), $executeRaw: mocks.execute }));
    mocks.query.mockResolvedValueOnce([debt]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ storeId: 'store', userId: 'user', payableId: 'debt', resource: 'MANUAL', version: '0', fingerprint: JSON.stringify(['debt', '300.00', '2026-10-10', '1000.00', '0']) }]);
  });
  it('allows the original manual permission to resolve an unsaved, stale request without creating a payment', async () => {
    const result = await POST(request(), context);
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({ code: 'BalanceChanged' });
    expect(mocks.query).toHaveBeenCalledTimes(3);
  });
  it('keeps a request unresolved when the version has not advanced', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([{ ...debt, ledgerVersion: '0' }]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ storeId: 'store', userId: 'user', payableId: 'debt', resource: 'MANUAL', version: '0', fingerprint: JSON.stringify(['debt', '300.00', '2026-10-10', '1000.00', '0']) }]);
    const result = await POST(request(), context);
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({ code: 'Conflict' });
    expect(mocks.query).toHaveBeenCalledTimes(3);
  });
  it('rejects status recovery if original permissions were revoked', async () => {
    mocks.authorize.mockResolvedValue(false);
    expect((await POST(request(), context)).status).toBe(403);
  });

  it('cancels an absent scope without exposing debt history', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([debt]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await POST(request(), context);
    expect(result.status).toBe(409);
    expect(await result.json()).toMatchObject({ code: 'BalanceChanged' });
    expect(mocks.execute).toHaveBeenCalledOnce();
  });
});
