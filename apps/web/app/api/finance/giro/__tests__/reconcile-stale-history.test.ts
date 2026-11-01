import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), query: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock('@pos/db', () => ({ db: { $transaction: mocks.transaction } }));
vi.mock('@/lib/rbac/guard', () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { POST } from '../[goodsPurchaseId]/reconcile/route';

const purchase = { id: 'purchase-1', number: 'PB-1', supplierName: 'Pemasok', amount: '100000.00', debtDate: '2026-10-10', dueDate: '2026-11-20' };
const debt = { id: 'manual-1', amount: '100000.00', debtDate: '2026-10-01', goodsPurchaseId: null, historyVerifiedAt: null };
const context = { params: Promise.resolve({ goodsPurchaseId: 'purchase-1' }) };
const request = (expectedPayments?: unknown) => new Request('http://localhost/api/finance/giro/purchase-1/reconcile', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ historyComplete: true, payableId: 'manual-1', payments: [{ amount: 30000, paidAt: '2026-10-20' }], expectedPayments }),
});

describe('reconcile checks the history displayed to the user', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ id: 'user-1', storeId: 'store-1' });
    mocks.authError.mockReturnValue(null);
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: mocks.query, $executeRaw: mocks.execute }));
    mocks.execute.mockResolvedValue(1);
    mocks.query.mockResolvedValue([]).mockResolvedValueOnce([purchase]).mockResolvedValueOnce([]).mockResolvedValueOnce([debt]);
  });

  it('rejects when a payment was added after an empty history was displayed', async () => {
    mocks.query.mockResolvedValueOnce([{ amount: '30000.00', paidAt: '2026-10-20' }]);
    const response = await POST(request([]), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'HistoryChanged' });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('requires an explicit snapshot for an existing payable', async () => {
    mocks.query.mockResolvedValueOnce([]);
    expect((await POST(request(), context)).status).toBe(422);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('requires a snapshot for a linked unverified payable even without an explicit payable ID', async () => {
    mocks.query.mockReset().mockResolvedValueOnce([purchase]).mockResolvedValueOnce([{ ...debt, goodsPurchaseId: purchase.id }]).mockResolvedValueOnce([]);
    const response = await POST(new Request('http://localhost/api/finance/giro/purchase-1/reconcile', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ historyComplete: true, payments: [] }),
    }), context);
    expect(response.status).toBe(422);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('accepts the same history in any order while preserving duplicate entries', async () => {
    mocks.query.mockResolvedValueOnce([
      { amount: '10000.00', paidAt: '2026-10-15' }, { amount: '10000.00', paidAt: '2026-10-15' }, { amount: '5000.00', paidAt: '2026-10-12' },
    ]);
    const response = await POST(request([
      { amount: '5000', paidAt: '2026-10-12' }, { amount: '10000', paidAt: '2026-10-15' }, { amount: '10000.00', paidAt: '2026-10-15' },
    ]), context);
    expect(response.status).toBe(201);
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('detects a same-total history with different payment dates', async () => {
    mocks.query.mockResolvedValueOnce([{ amount: '30000.00', paidAt: '2026-10-19' }]);
    const response = await POST(request([{ amount: '30000', paidAt: '2026-10-18' }]), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'HistoryChanged' });
  });

  it('detects changes in the number of payments even when date and total are unchanged', async () => {
    mocks.query.mockResolvedValueOnce([{ amount: '30000.00', paidAt: '2026-10-19' }]);
    const response = await POST(request([{ amount: 15000, paidAt: '2026-10-19' }, { amount: 15000, paidAt: '2026-10-19' }]), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'HistoryChanged' });
  });

  it('rejects an invalid snapshot', async () => {
    expect((await POST(request([{ amount: 'nope', paidAt: '2026-10-19' }]), context)).status).toBe(422);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
