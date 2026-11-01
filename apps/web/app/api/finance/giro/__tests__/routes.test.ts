import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), authError: vi.fn(), query: vi.fn(), execute: vi.fn(), transaction: vi.fn(),
}));
vi.mock('@pos/db', () => ({ db: { $queryRaw: mocks.query, $transaction: mocks.transaction } }));
vi.mock('@/lib/rbac/guard', () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));

import { GET } from '../route';
import { POST } from '../[goodsPurchaseId]/reconcile/route';

const context = { params: Promise.resolve({ goodsPurchaseId: 'purchase-1' }) };
const purchase = { id: 'purchase-1', number: 'PB-1', supplierName: 'Pemasok', amount: '100000.00', debtDate: '2026-10-10', dueDate: '2026-11-20' };
const review = (body: unknown) => new Request('http://localhost/api/finance/giro/purchase-1/reconcile', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const input = { historyComplete: true, payments: [{ amount: '30000', paidAt: '2026-10-20' }] };

describe('giro endpoints', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T03:00:00Z'));
    mocks.permission.mockResolvedValue({ id: 'user-1', storeId: 'store-1' });
    mocks.authError.mockReturnValue(null);
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: mocks.query, $executeRaw: mocks.execute }));
    mocks.execute.mockResolvedValue(1);
  });
  afterEach(() => vi.useRealTimers());

  it('includes stable payment IDs on both giro and manual debt histories', async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect((await GET(new Request('http://localhost/api/finance/giro'))).status).toBe(200);
    for (const call of mocks.query.mock.calls) {
      expect((call[0] as TemplateStringsArray).join(' ')).toContain('\'id\', pay."id"');
    }
  });

  it('selects both notes for review', async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await GET(new Request('http://localhost/api/finance/giro'));
    expect((mocks.query.mock.calls[0][0] as TemplateStringsArray).join(' ')).toContain('d."note" AS "payableNote"');
    expect((mocks.query.mock.calls[1][0] as TemplateStringsArray).join(' ')).toContain('d."note"');
  });

  it('lists legacy unknown and verified partial giros with unlinked manual debts from the current store', async () => {
    mocks.query.mockResolvedValueOnce([
      { ...purchase, goodsPurchaseId: purchase.id, payableId: null, historyVerifiedAt: null, payments: [] },
      { ...purchase, goodsPurchaseId: 'purchase-2', payableId: 'linked-2', payableDebtDate: '2026-10-01', historyVerifiedAt: new Date(), payments: [{ amount: '30000.00', paidAt: '2026-10-20' }] },
    ]).mockResolvedValueOnce([
      { id: 'manual-1', supplierName: 'Pemasok', amount: '100000.00', debtDate: '2026-10-10', dueDate: null, payments: [{ amount: '10000.00', paidAt: '2026-10-15' }] },
    ]);
    const response = await GET(new Request('http://localhost/api/finance/giro?storeId=other'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toMatchObject({
      items: [
        { goodsPurchaseId: 'purchase-1', status: 'UNKNOWN', paid: null, remaining: null },
        { goodsPurchaseId: 'purchase-2', payableDebtDate: '2026-10-01', status: 'PARTIAL', paid: 30000, remaining: 70000 },
      ],
      manualPayables: [{ id: 'manual-1', amount: 100000, paid: 10000, payments: [{ amount: 10000, paidAt: '2026-10-15' }] }],
    });
    expect(mocks.permission).toHaveBeenCalledWith('expense', 'read');
    expect(mocks.query.mock.calls.every(call => call.includes('store-1'))).toBe(true);
    expect(mocks.query.mock.calls.some(call => call.includes('other'))).toBe(false);
  });

  it('keeps the list available and marks inconsistent payment history unknown', async () => {
    mocks.query.mockResolvedValueOnce([{ ...purchase, goodsPurchaseId: purchase.id, payableId: 'linked', historyVerifiedAt: new Date(), payments: [{ amount: '100000.01', paidAt: '2026-10-20' }] }])
      .mockResolvedValueOnce([]);
    const response = await GET(new Request('http://localhost/api/finance/giro'));
    expect(response.status).toBe(200);
    expect((await response.json()).items[0]).toMatchObject({ status: 'UNKNOWN', paid: null, remaining: null, historyIssue: true });
  });

  it('shows an ambiguous legacy purchase as unknown without presenting it as a certain debt', async () => {
    mocks.query.mockResolvedValueOnce([{ ...purchase, debtDate: null, goodsPurchaseId: purchase.id, payableId: null, historyVerifiedAt: null, payments: [] }]).mockResolvedValueOnce([]);
    const response = await GET(new Request('http://localhost/api/finance/giro'));
    expect(response.status).toBe(200);
    expect((await response.json()).items[0]).toMatchObject({ debtDate: null, status: 'UNKNOWN', historyIssue: true });
  });

  it('does not permit reviewing an ambiguous legacy purchase', async () => {
    mocks.query.mockImplementationOnce((query: TemplateStringsArray) => Promise.resolve(query.join(' ').includes('NOT EXISTS') ? [] : [purchase]));
    const response = await POST(review(input), context);
    expect(response.status).toBe(404);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('marks an expense whose amount differs from the purchase as unknown and prevents review', async () => {
    mocks.query.mockImplementationOnce((query: TemplateStringsArray) => Promise.resolve([
      { ...purchase, debtDate: query.join(' ').includes('x."amount" = g."totalAmount"') ? null : purchase.debtDate,
        goodsPurchaseId: purchase.id, payableId: null, historyVerifiedAt: null, payments: [] },
    ])).mockResolvedValueOnce([]);
    expect((await (await GET(new Request('http://localhost/api/finance/giro'))).json()).items[0])
      .toMatchObject({ debtDate: null, status: 'UNKNOWN', historyIssue: true });
    mocks.query.mockImplementationOnce((query: TemplateStringsArray) => Promise.resolve(
      query.join(' ').includes('x."amount" = g."totalAmount"') ? [] : [purchase],
    ));
    expect((await POST(review(input), context)).status).toBe(404);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('records a complete new history atomically and locks the purchase before linking it', async () => {
    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([]);
    const response = await POST(review(input), context);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ payableId: expect.any(String) });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.permission).toHaveBeenCalledWith('expense', 'update');
    expect(mocks.query.mock.calls[0].join(' ')).toContain('FOR UPDATE');
    expect(mocks.query.mock.calls[0]).toContain('store-1');
  });

  it('links an explicitly selected manual debt while preserving its recorded payments', async () => {
    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'manual-1', amount: '100000.00', debtDate: '2026-10-10', goodsPurchaseId: null, historyVerifiedAt: null }])
      .mockResolvedValueOnce([{ amount: '20000.00', paidAt: '2026-10-15' }]);
    const response = await POST(review({ ...input, payableId: 'manual-1', expectedPayments: [{ amount: '20000.00', paidAt: '2026-10-15' }] }), context);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ payableId: 'manual-1' });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[2].join(' ')).toContain('FOR UPDATE');
    expect(mocks.query.mock.calls[2]).toContain('store-1');
  });

  it('verifies an already linked unknown giro and preserves its previous payments', async () => {
    mocks.query.mockResolvedValueOnce([purchase])
      .mockResolvedValueOnce([{ id: 'linked-1', amount: '100000.00', debtDate: '2026-10-10', goodsPurchaseId: 'purchase-1', historyVerifiedAt: null }])
      .mockResolvedValueOnce([{ amount: '20000.00', paidAt: '2026-10-15' }]);
    const response = await POST(review({ ...input, payableId: 'linked-1', expectedPayments: [{ amount: '20000.00', paidAt: '2026-10-15' }] }), context);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ payableId: 'linked-1' });
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it('rejects a missing or cross-store purchase and missing or cross-store manual debt', async () => {
    mocks.query.mockResolvedValueOnce([]);
    expect((await POST(review(input), context)).status).toBe(404);
    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect((await POST(review({ ...input, payableId: 'other-store' }), context)).status).toBe(404);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects incompatible amounts and payments before the purchase date', async () => {
    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'manual-1', amount: '99999.00', debtDate: '2026-10-10', goodsPurchaseId: null, historyVerifiedAt: null }]);
    expect((await POST(review({ ...input, payableId: 'manual-1', expectedPayments: [] }), context)).status).toBe(422);
    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([]);
    expect((await POST(review({ historyComplete: true, payments: [{ amount: 1, paidAt: '2026-10-09' }] }), context)).status).toBe(422);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('preserves an earlier manual debt date and allows payments after that date', async () => {
    const manual = { id: 'manual-1', amount: '100000.00', debtDate: '2026-10-01', goodsPurchaseId: null, historyVerifiedAt: null };
    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([]).mockResolvedValueOnce([manual])
      .mockResolvedValueOnce([{ amount: '1.00', paidAt: '2026-10-09' }]);
    expect((await POST(review({ historyComplete: true, payableId: 'manual-1', expectedPayments: [{ amount: 1, paidAt: '2026-10-09' }], payments: [{ amount: 1, paidAt: '2026-10-02' }] }), context)).status).toBe(201);
    expect(mocks.execute.mock.calls[0].join(' ')).not.toContain('"debtDate" =');
  });

  it('rejects payments before an earlier manual debt date and combined payments exceeding its total', async () => {
    const manual = { id: 'manual-1', amount: '100000.00', debtDate: '2026-10-01', goodsPurchaseId: null, historyVerifiedAt: null };
    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([]).mockResolvedValueOnce([manual]);
    expect((await POST(review({ historyComplete: true, payableId: 'manual-1', payments: [{ amount: 1, paidAt: '2026-09-30' }] }), context)).status).toBe(422);
    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([]).mockResolvedValueOnce([manual])
      .mockResolvedValueOnce([{ amount: '70000.01', paidAt: '2026-10-11' }]);
    expect((await POST(review({ ...input, payableId: 'manual-1', expectedPayments: [{ amount: '70000.01', paidAt: '2026-10-11' }] }), context)).status).toBe(422);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects a manual debt dated after receipt instead of silently rewriting its historical date', async () => {
    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'manual-1', amount: '100000.00', debtDate: '2026-10-15', goodsPurchaseId: null, historyVerifiedAt: null }]);
    expect((await POST(review({ historyComplete: true, payableId: 'manual-1', payments: [] }), context)).status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('rejects an already verified giro or manual debt linked to a different purchase', async () => {
    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([{ id: 'verified', historyVerifiedAt: new Date() }]);
    expect((await POST(review(input), context)).status).toBe(409);
    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'manual-1', amount: '100000.00', debtDate: '2026-10-10', goodsPurchaseId: 'different', historyVerifiedAt: null }]);
    expect((await POST(review({ ...input, payableId: 'manual-1' }), context)).status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('requires explicit complete history and valid dated payments', async () => {
    expect((await POST(review({ historyComplete: false, payments: [] }), context)).status).toBe(422);
    expect((await POST(review({ historyComplete: true, payments: [{ amount: 1, paidAt: '2026-11-02' }] }), context)).status).toBe(422);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('enforces authorization without querying any giro data', async () => {
    mocks.permission.mockRejectedValueOnce(new Error('unauthorized'));
    mocks.authError.mockReturnValueOnce(new Response(null, { status: 403 }));
    expect((await GET(new Request('http://localhost/api/finance/giro'))).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
    mocks.permission.mockRejectedValueOnce(new Error('unauthorized'));
    mocks.authError.mockReturnValueOnce(new Response(null, { status: 403 }));
    expect((await POST(review(input), context)).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
