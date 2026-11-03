import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), query: vi.fn(), execute: vi.fn(), transaction: vi.fn() }));
vi.mock('@pos/db', () => ({ db: { $transaction: mocks.transaction } }));
vi.mock('@/lib/rbac/guard', () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));

import { POST } from '../[goodsPurchaseId]/link-manual/route';

const context = { params: Promise.resolve({ goodsPurchaseId: 'purchase-1' }) };
const body = {
  payableId: 'manual-1', expectedGiroPayableId: 'giro-1', historiesConfirmed: true,
  expectedGiro: { amount: 100000, debtDate: '2026-10-10', payableDebtDate: '2026-10-10', dueDate: '2026-11-20', supplierName: 'Pemasok', payableNote: null },
  expectedManual: { amount: 100000, debtDate: '2026-10-01', dueDate: null, supplierName: 'Pemasok', note: null },
  expectedGiroPayments: [{ id: 'g-1', amount: 30000, paidAt: '2026-10-20' }],
  expectedManualPayments: [{ id: 'm-1', amount: 30000, paidAt: '2026-10-20' }],
  duplicatePayments: [{ giroPaymentId: 'g-1', manualPaymentId: 'm-1' }], matchingPaymentsConfirmedDistinct: false,
};
const request = (value: unknown = body) => new Request('http://localhost/api/finance/giro/purchase-1/link-manual', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
});
const purchase = { id: 'purchase-1', supplierName: 'Pemasok', amount: '100000', debtDate: '2026-10-10', dueDate: '2026-11-20' };
const giro = { id: 'giro-1', supplierName: 'Pemasok', amount: '100000', debtDate: '2026-10-10', dueDate: '2026-11-20', note: null, goodsPurchaseId: 'purchase-1', historyVerifiedAt: new Date() };
const manual = { id: 'manual-1', supplierName: 'Pemasok', amount: '100000', debtDate: '2026-10-01', dueDate: null, note: null, goodsPurchaseId: null, historyVerifiedAt: null };
const payments = [
  { id: 'g-1', payableId: 'giro-1', amount: '30000', paidAt: '2026-10-20', requestScope: null },
  { id: 'm-1', payableId: 'manual-1', amount: '30000', paidAt: '2026-10-20', requestScope: null },
];
function mockHistory(overrides: { purchase?: object; debts?: object[]; references?: object[]; payments?: object[]; paymentReferences?: object[] } = {}) {
  mocks.query.mockResolvedValueOnce([overrides.purchase ?? purchase]);
  mocks.query.mockResolvedValueOnce([]); // audit replay
  mocks.query.mockResolvedValueOnce(overrides.debts ?? [giro, manual]);
  mocks.query.mockResolvedValueOnce(overrides.references ?? []); // unknown foreign keys
  mocks.query.mockResolvedValueOnce([]); // manual debt referenced by an existing audit
  mocks.query.mockResolvedValueOnce(overrides.payments ?? payments);
  mocks.query.mockResolvedValueOnce(overrides.paymentReferences ?? []); // foreign keys to payments
}

describe('linking a manual payable to an existing giro', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ id: 'user-1', storeId: 'store-1' });
    mocks.authError.mockReturnValue(null);
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: mocks.query, $executeRaw: mocks.execute }));
    mocks.execute.mockResolvedValue(1);
  });

  it('requires confirmation before accessing the database', async () => {
    const response = await POST(request({ ...body, historiesConfirmed: false }), context);
    expect(response.status).toBe(422);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('requires expense update permission and confines the purchase lookup to the user store', async () => {
    mocks.query.mockResolvedValueOnce([]);
    expect((await POST(request(), context)).status).toBe(404);
    expect(mocks.permission).toHaveBeenCalledWith("expense.giro", "update");
    expect(mocks.query.mock.calls[0]).toContain('store-1');
    expect(mocks.query.mock.calls[0].join(' ')).toContain('FOR UPDATE');
  });

  it('merges only explicitly chosen duplicates after recording an audit snapshot', async () => {
    mockHistory();
    const response = await POST(request(), context);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ payableId: 'giro-1' });
    const statements = mocks.execute.mock.calls.map(call => call[0].join(' '));
    expect(statements.some(sql => sql.includes('LOCK TABLE'))).toBe(true);
    const auditIndex = statements.findIndex(sql => sql.includes('INSERT INTO "pos_supplier_payable_manual_links"'));
    const deleteIndex = statements.findIndex(sql => sql.includes('DELETE FROM "pos_supplier_payable_payments"'));
    const moveIndex = statements.findIndex(sql => sql.includes('UPDATE "pos_supplier_payable_payments"'));
    expect(auditIndex).toBeGreaterThan(0);
    expect(deleteIndex).toBeGreaterThan(auditIndex);
    expect(moveIndex).toBeGreaterThan(deleteIndex);
  });

  it('rejects a stale displayed debt or payment history before modifying either ledger', async () => {
    mockHistory({ debts: [giro, { ...manual, supplierName: 'Baru' }] });
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('HistoryChanged');
    expect(mocks.execute).toHaveBeenCalledTimes(4);
  });

  it('rejects ambiguous matching payments without explicit confirmation', async () => {
    mockHistory();
    const response = await POST(request({ ...body, duplicatePayments: [] }), context);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('PotentialDuplicate');
    expect(mocks.execute).toHaveBeenCalledTimes(4);
  });

  it('rejects deleting a payment protected by an idempotency key', async () => {
    mockHistory({ payments: [payments[0], { ...payments[1], requestScope: 'protected-key' }] });
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('Conflict');
    expect(mocks.execute).toHaveBeenCalledTimes(4);
  });

  it('refuses a foreign key that could cascade-delete unknown data', async () => {
    mockHistory({ references: [{ constraint: 'extra_fk' }] });
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('Conflict');
    expect(mocks.execute).toHaveBeenCalledTimes(4);
  });

  it('refuses to delete a duplicate payment with unknown dependent data', async () => {
    mockHistory({ paymentReferences: [{ constraint: 'payment_child_fk' }] });
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('Conflict');
    expect(mocks.execute.mock.calls.map(call => call[0].join(' ')).some(sql => sql.includes('INSERT INTO'))).toBe(false);
  });

  it('returns the canonical giro ID for an exact replay after a successful link', async () => {
    mocks.query.mockResolvedValueOnce([purchase]);
    mocks.query.mockResolvedValueOnce([{ manualPayableId: 'manual-1', storeId: 'store-1', goodsPurchaseId: 'purchase-1', giroPayableId: 'giro-1', sameRequest: true }]);
    const response = await POST(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ payableId: 'giro-1' });
    expect(mocks.execute).toHaveBeenCalledTimes(4);
  });

  it('rejects a changed replay', async () => {
    mocks.query.mockResolvedValueOnce([purchase]);
    mocks.query.mockResolvedValueOnce([{ manualPayableId: 'manual-1', storeId: 'store-1', goodsPurchaseId: 'purchase-1', giroPayableId: 'giro-1', sameRequest: false }]);
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect(mocks.execute).toHaveBeenCalledTimes(4);
  });

  it('rejects a note changed during review', async () => {
    mockHistory({ debts: [giro, { ...manual, note: 'Catatan berubah' }] });
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('HistoryChanged');
  });

  it.each([
    { code: 'P2034' },
    { code: 'P2010', meta: { code: '40001' } },
    { code: 'P2010', meta: { code: '23001' } },
  ])('asks for a refresh after a concurrent database conflict %#', async error => {
    mocks.transaction.mockRejectedValueOnce(error);
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('HistoryChanged');
  });

  it('asks the user to retry when another writer holds a lock', async () => {
    mocks.transaction.mockRejectedValueOnce({ code: 'P2010', meta: { code: '55P03' } });
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'Conflict', message: expect.stringContaining('coba lagi') });
  });

  it('asks the user to retry when a statement exceeds its time limit', async () => {
    mocks.transaction.mockRejectedValueOnce({ code: 'P2010', meta: { code: '57014' } });
    const response = await POST(request(), context);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: 'Conflict', message: expect.stringContaining('coba lagi') });
  });
});
