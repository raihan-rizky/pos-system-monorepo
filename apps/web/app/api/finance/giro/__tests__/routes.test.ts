import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), page: vi.fn(), authError: vi.fn(), query: vi.fn(), execute: vi.fn(), transaction: vi.fn(),
}));
vi.mock('@pos/db', () => ({ db: { $queryRaw: mocks.query, $transaction: mocks.transaction } }));
vi.mock('@/lib/rbac/guard', () => ({ requirePermission: mocks.permission, canAuthenticatedUserAccessPage: mocks.page, authorizeInTransaction: async (_tx: unknown, actor: { id: string; storeId: string; role?: string }, requirements: { resources: { resource: string; action: string }[]; page?: string }) => {
  try { if (requirements.page && !await mocks.page()) return false; for (const grant of requirements.resources) { const current = await mocks.permission(grant.resource, grant.action); if (current.id !== actor.id || current.storeId !== actor.storeId || current.role !== actor.role) return false; } return true; } catch { return false; }
}, handleAuthError: mocks.authError }));
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
    mocks.page.mockResolvedValue(true);
    mocks.authError.mockReturnValue(null);
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: mocks.query, $executeRaw: mocks.execute }));
    mocks.execute.mockResolvedValue(1);
  });
  afterEach(() => vi.useRealTimers());

  it('tidak membaca hutang manual ketika hanya izin baca giro yang diberikan', async () => {
    const denied = new Error('payables-denied');
    mocks.permission.mockImplementation(async resource => {
      if (resource === 'expense.payable') throw denied;
      return { id: 'user-1', storeId: 'store-1' };
    });
    mocks.authError.mockImplementation(error => error === denied ? new Response(null, { status: 403 }) : null);
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'private-debt', supplierName: 'Rahasia', amount: '100', payments: [] }]);
    const response = await GET(new Request('http://localhost/api/finance/giro'));
    expect(response.status).toBe(200);
    expect((await response.json()).manualPayables).toEqual([]);
    expect(mocks.query).toHaveBeenCalledTimes(1);
  });
  it('tidak membaca giro dan hutang manual tanpa akses halaman Keuangan', async () => {
    mocks.page.mockResolvedValue(false);
    expect((await GET(new Request('http://localhost/api/finance/giro'))).status).toBe(403);
    expect(mocks.query).not.toHaveBeenCalled();
  });
  it('memerlukan izin koreksi hutang dan pembayaran untuk menghubungkan hutang manual ke giro', async () => {
    const denied = new Error('manual-denied');
    mocks.permission.mockImplementation(async resource => {
      if (resource === 'expense.payable.manual.payment') throw denied;
      return { id: 'user-1', storeId: 'store-1' };
    });
    mocks.authError.mockImplementation(error => error === denied ? new Response(null, { status: 403 }) : null);
    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'manual-1', amount: '100000.00', debtDate: '2026-10-10', goodsPurchaseId: null, historyVerifiedAt: null }]);
    const response = await POST(review({ ...input, payableId: 'manual-1', expectedPayments: [] }), context);
    expect(response.status).toBe(403);
    expect(mocks.permission).toHaveBeenCalledWith('expense.payable.manual', 'update');
    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('includes stable payment IDs on both giro and manual debt histories', async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    expect((await GET(new Request('http://localhost/api/finance/giro'))).status).toBe(200);
    for (const call of mocks.query.mock.calls) {
      expect((call[0] as TemplateStringsArray).join(' ')).toContain('\'id\', pay."id"');
    }
  });

  it('menghitung saldo pembelian terkoreksi dari seluruh pembayaran efektif, bukan hanya alokasi Giro', async () => {
    mocks.query.mockResolvedValueOnce([
      { ...purchase, goodsPurchaseId: 'purchase-1', payableId: 'linked-1', historyVerifiedAt: new Date(), correctionId: 'c1', amount: '3988656', payableAmount: '8936156', effectivePayments: [{ id: 'p1', amount: '8936156', paidAt: '2026-10-20' }], payments: [] },
      { ...purchase, goodsPurchaseId: 'purchase-2', payableId: 'linked-2', historyVerifiedAt: new Date(), correctionId: 'c2', amount: '3988656', payableAmount: '8936156', effectivePayments: [{ id: 'p2', amount: '4947500', paidAt: '2026-10-20' }], payments: [] },
    ]).mockResolvedValueOnce([]);
    const response = await GET(new Request('http://localhost/api/finance/giro'));
    expect((await response.json()).items).toEqual(expect.arrayContaining([
      expect.objectContaining({ goodsPurchaseId: 'purchase-1', amount: 3988656, status: 'PAID', remaining: 0 }),
      expect.objectContaining({ goodsPurchaseId: 'purchase-2', amount: 3988656, status: 'PARTIAL', remaining: 3988656 }),
    ]));
  });


  it('menyajikan riwayat yang dipakai menghitung sisa pembelian dan memisahkan catatan mendatang', async () => {
    const transfer = { id: 'transfer-1', amount: '412.72', paidAt: '2026-10-27', method: 'TRANSFER' };
    const future = { id: 'giro-1', amount: '20.00', paidAt: '2026-12-05', method: 'GIRO' };
    mocks.query.mockResolvedValueOnce([{
      ...purchase, shoppingRequestId: 'request-1', amount: '458.17', payableAmount: '458.17',
      historyVerifiedAt: new Date(), correctionId: 'c1', effectivePayments: [transfer, future], payments: [future],
    }]).mockResolvedValueOnce([]);
    const response = await GET(new Request('http://localhost/api/finance/giro'));
    expect((await response.json()).items[0]).toMatchObject({
      shoppingRequestId: 'request-1', balanceTotal: 458.17, totalPaid: 412.72,
      purchasePayments: [{ ...transfer, amount: 412.72 }], futurePayments: [{ ...future, amount: 20 }],
      remaining: 45.45, availableToPay: 25.45,
    });
    const query = (mocks.query.mock.calls[0][0] as TemplateStringsArray).join(' ');
    expect(query).toContain('a."method"::text');
    expect(query).toContain('source."method"');
  });

  it('mempertahankan pembayaran campuran sebagai satu catatan dengan nominal Transfer yang tepat', async () => {
    mocks.query.mockResolvedValueOnce([{
      ...purchase, historyVerifiedAt: new Date(), correctionId: 'c1', payableAmount: '100000.00',
      effectivePayments: [{ id: 'mixed', amount: '412.72', paidAt: '2026-10-27', method: 'MIXED', transferAmount: '300.50' }], payments: [],
    }]).mockResolvedValueOnce([]);
    const response = await GET(new Request('http://localhost/api/finance/giro'));
    expect((await response.json()).items[0].purchasePayments).toEqual([
      { id: 'mixed', amount: 412.72, paidAt: '2026-10-27', method: 'MIXED', transferAmount: 300.50 },
    ]);
    const query = (mocks.query.mock.calls[0][0] as TemplateStringsArray).join(' ');
    expect(query).toContain('GROUP BY source."id", source."paidAt"');
    expect(query).not.toContain('GROUP BY source."id", source."paidAt", source."method"');
  });

  it('selects both notes for review', async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await GET(new Request('http://localhost/api/finance/giro'));
    expect((mocks.query.mock.calls[0][0] as TemplateStringsArray).join(' ')).toContain('d."note" AS "payableNote"');
    expect((mocks.query.mock.calls[1][0] as TemplateStringsArray).join(' ')).toContain('d."note"');
  });

  it('mengurangi saldo giro dengan kredit pemasok dan mempertahankan riwayat kas', async () => {
    const payments = [{ id: 'payment-1', amount: '30000.00', paidAt: '2026-10-20' }];
    mocks.query.mockResolvedValueOnce([
      { ...purchase, goodsPurchaseId: purchase.id, payableId: 'linked', historyVerifiedAt: new Date(), payments, credited: '70000.00' },
    ]).mockResolvedValueOnce([]);
    const result = await (await GET(new Request('http://localhost/api/finance/giro'))).json();
    expect(result.items[0]).toMatchObject({ status: 'PAID', remaining: 0, paid: 30000, creditApplied: 70000, payments: [{ ...payments[0], amount: 30000 }] });
    expect(mocks.query.mock.calls[0][0].join(' ')).toContain('finance_cancel."paymentId" IS NULL');
  });

  it('membaca dan merekonsiliasi giro dari pembelian yang sebelumnya disetujui', async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await GET(new Request('http://localhost/api/finance/giro'));
    const listSql = (mocks.query.mock.calls[0][0] as TemplateStringsArray).join(' ');
    expect(listSql).toContain('g."statusBeforeCancellation" = \'APPROVED\'');
    expect(listSql).toContain('other."statusBeforeCancellation" = \'APPROVED\'');
    mocks.query.mockReset().mockResolvedValueOnce([]);
    await POST(review(input), context);
    const reconcileSql = (mocks.query.mock.calls[0][0] as TemplateStringsArray).join(' ');
    expect(reconcileSql).toContain('g."statusBeforeCancellation" = \'APPROVED\'');
    expect(reconcileSql).toContain('other."statusBeforeCancellation" = \'APPROVED\'');
  });

  it('lists legacy unknown and verified partial giros with unlinked manual debts from the current store', async () => {
    mocks.query.mockResolvedValueOnce([
      { ...purchase, goodsPurchaseId: purchase.id, payableId: null, historyVerifiedAt: null, payments: [] },
      { ...purchase, goodsPurchaseId: 'purchase-2', payableId: 'linked-2', payableDebtDate: '2026-10-01', historyVerifiedAt: new Date(), payments: [{ amount: '30000.00', paidAt: '2026-10-20' }] },
    ]).mockResolvedValueOnce([
      { id: 'manual-1', supplierName: 'Pemasok', amount: '100000.00', debtDate: '2026-10-10', dueDate: null, payments: [{ id: 'p-manual', amount: '10000.00', paidAt: '2026-10-15', origin: 'MANUAL' }] },
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
    expect(mocks.permission).toHaveBeenCalledWith("expense.giro", "read");
    expect(mocks.query.mock.calls.every(call => call.includes('store-1'))).toBe(true);
    expect(mocks.query.mock.calls.some(call => call.includes('other'))).toBe(false);
  });
  it('shows an overdue manual debt as settled even before its automatic payment is persisted', async () => {
    mocks.query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'manual-due', supplierName: 'Pemasok', amount: '1000.00', debtDate: '2026-10-01', dueDate: '2026-10-20', note: null,
      payments: [{ id: 'p1', amount: '400', paidAt: '2026-10-10', origin: 'MANUAL' }] }]);
    const response = await GET(new Request('http://localhost/api/finance/giro'));
    expect((await response.json()).manualPayables[0]).toMatchObject({ paid: 1000, payments: [
      { id: 'p1', amount: 400 }, { id: 'auto:manual-due', amount: 600, paidAt: '2026-10-20', origin: 'AUTO' },
    ] });
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
    expect(mocks.execute).toHaveBeenCalledTimes(3);
    expect(mocks.permission).toHaveBeenCalledWith("expense.giro", "update");
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
    expect(mocks.execute).toHaveBeenCalledTimes(3);
    expect(mocks.query.mock.calls[2].join(' ')).toContain('FOR UPDATE');
    expect(mocks.query.mock.calls[2]).toContain('store-1');
  });

  it('does not convert a manual debt with a transfer allocation into a giro', async () => {
    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'manual-1', amount: '100000.00', debtDate: '2026-10-10', goodsPurchaseId: null, historyVerifiedAt: null }])
      .mockResolvedValueOnce([{ amount: '20000.00', paidAt: '2026-10-15', allocated: true }]);
    const response = await POST(review({ ...input, payableId: 'manual-1', expectedPayments: [{ amount: '20000', paidAt: '2026-10-15' }] }), context);
    expect(response.status).toBe(409);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it('verifies an already linked unknown giro and preserves its previous payments', async () => {
    mocks.query.mockResolvedValueOnce([purchase])
      .mockResolvedValueOnce([{ id: 'linked-1', amount: '100000.00', debtDate: '2026-10-10', goodsPurchaseId: 'purchase-1', historyVerifiedAt: null }])
      .mockResolvedValueOnce([{ amount: '20000.00', paidAt: '2026-10-15' }]);
    const response = await POST(review({ ...input, payableId: 'linked-1', expectedPayments: [{ amount: '20000.00', paidAt: '2026-10-15' }] }), context);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ payableId: 'linked-1' });
    expect(mocks.execute).toHaveBeenCalledTimes(3);
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
