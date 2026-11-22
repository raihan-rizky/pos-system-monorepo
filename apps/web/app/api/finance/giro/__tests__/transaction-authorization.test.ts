import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn(), authorize: vi.fn(), permission: vi.fn(), page: vi.fn() }));
vi.mock('@pos/db', () => ({ db: { $transaction: mocks.transaction } }));
vi.mock('@/lib/rbac/guard', () => ({ requirePermission: mocks.permission, canAuthenticatedUserAccessPage: mocks.page, authorizeInTransaction: mocks.authorize, handleAuthError: () => null }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { POST as reconcile } from '../[goodsPurchaseId]/reconcile/route';
import { POST as link } from '../[goodsPurchaseId]/link-manual/route';

const user = { id: 'user-1', storeId: 'store-1', role: 'OWNER' };
const purchase = { id: 'purchase-1', number: 'P1', supplierName: 'Pemasok', amount: '1000', debtDate: '2026-10-10', dueDate: null };
const manual = { id: 'manual-1', supplierName: 'Pemasok', amount: '1000', debtDate: '2026-10-10', dueDate: null, note: null, goodsPurchaseId: null, historyVerifiedAt: null };
const giro = { ...manual, id: 'giro-1', goodsPurchaseId: 'purchase-1', historyVerifiedAt: new Date() };
const context = { params: Promise.resolve({ goodsPurchaseId: 'purchase-1' }) };
const req = (body: unknown) => new Request('http://localhost/api', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const linkBody = { payableId: manual.id, expectedGiroPayableId: giro.id, historiesConfirmed: true,
  expectedGiro: { amount: 1000, debtDate: '2026-10-10', payableDebtDate: '2026-10-10', dueDate: null, supplierName: 'Pemasok', payableNote: null },
  expectedManual: { amount: 1000, debtDate: '2026-10-10', dueDate: null, supplierName: 'Pemasok', note: null },
  expectedGiroPayments: [], expectedManualPayments: [], duplicatePayments: [], matchingPaymentsConfirmedDistinct: false };

describe('authorization after giro domain locks', () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.permission.mockResolvedValue(user); mocks.page.mockResolvedValue(true); mocks.authorize.mockResolvedValue(false); mocks.execute.mockResolvedValue(1);
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: (parts: TemplateStringsArray, ...values: unknown[]) => {
      if (parts.join(' ').trimStart().startsWith('SELECT "id" FROM "pos_goods_purchases"')) return Promise.resolve([{ id: 'purchase-1' }]);
      return mocks.query(parts, ...values);
    }, $executeRaw: mocks.execute }));
  });
  it('rejects reconciliation when actor or grants change while waiting for purchase/debt locks', async () => {
    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([]).mockResolvedValueOnce([manual]).mockResolvedValueOnce([]);
    const response = await reconcile(req({ historyComplete: true, payableId: manual.id, expectedPayments: [], payments: [] }), context);
    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledOnce();
    expect(mocks.authorize.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.query.mock.invocationCallOrder[2]);
    expect(mocks.permission).toHaveBeenCalledTimes(1);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('rejects linking when actor or grants change while waiting for both debt and payment locks', async () => {
    mocks.query.mockResolvedValueOnce([purchase]).mockResolvedValueOnce([]).mockResolvedValueOnce([giro, manual]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const response = await link(req(linkBody), context);
    expect(response.status).toBe(403);
    expect(mocks.authorize).toHaveBeenCalledOnce();
    expect(mocks.authorize.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.query.mock.invocationCallOrder[6]);
    expect(mocks.execute.mock.calls.every(call => !(call[0] as TemplateStringsArray).join(' ').includes('INSERT INTO'))).toBe(true);
  });
});
