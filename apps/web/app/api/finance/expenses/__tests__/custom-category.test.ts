import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), category: vi.fn() }));
vi.mock('@/lib/rbac/guard', () => ({ requireRole: mocks.permission, requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock('@pos/db', () => ({ db: { expense: { findMany: mocks.findMany, count: mocks.count, create: mocks.create, findFirst: mocks.findFirst, update: mocks.update }, customExpenseCategory: { findFirst: mocks.category }, transaction: { findFirst: vi.fn() } } }));
vi.mock('@/lib/logger', () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { GET, POST } from '../route';
import { PATCH } from '../[id]/route';

const expense = { id: 'expense-1', applicantName: 'Ada', category: 'OTHER', customCategoryId: 'category-1', description: null, amount: 100, changeAmount: 0, occurredAt: new Date('2026-10-01T00:00:00Z'), createdAt: new Date('2026-10-01T00:00:00Z'), transactionId: null, attachmentUrl: null, hasMissingCostSnapshot: false, shoppingRequest: null, goodsPurchase: null, recordedBy: { id: 'user-1', name: 'Ada' } };
const input = { applicantName: 'Ada', category: 'OTHER', customCategoryId: 'category-1', amount: 100, changeAmount: 0, occurredAt: '2026-10-01' };
const request = (method: string, payload: object) => new Request('http://localhost/api/finance/expenses', { method, body: JSON.stringify(payload) });

describe('kategori pengeluaran khusus', () => {
  beforeEach(() => {
    vi.resetAllMocks(); mocks.permission.mockResolvedValue({ id: 'user-1', storeId: 'store-1' }); mocks.authError.mockReturnValue(null);
    mocks.findMany.mockResolvedValue([expense]); mocks.count.mockResolvedValue(1); mocks.category.mockResolvedValue({ id: 'category-1' });
    mocks.create.mockResolvedValue(expense); mocks.update.mockResolvedValue(expense);
    mocks.findFirst.mockResolvedValue({ id: 'expense-1', deletedAt: null, shoppingRequestId: null, goodsPurchaseId: null, customCategoryId: 'category-1' });
  });
  it('mencatat kategori toko sendiri dan mengembalikan kunci kategori', async () => {
    const response = await POST(request('POST', input));
    expect(response.status).toBe(201);
    expect(mocks.category).toHaveBeenCalledWith({ where: { id: 'category-1', storeId: 'store-1' }, select: { id: true } });
    expect(mocks.create.mock.calls[0][0].data).toMatchObject({ storeId: 'store-1', category: 'OTHER', customCategoryId: 'category-1' });
    expect((await response.json()).data.category).toBe('custom:category-1');
  });
  it('menolak kategori dari toko lain', async () => {
    mocks.category.mockResolvedValue(null);
    const response = await POST(request('POST', input));
    expect(response.status).toBe(422); expect(mocks.create).not.toHaveBeenCalled();
  });
  it('menolak kategori dari toko lain saat mengedit', async () => {
    mocks.category.mockResolvedValue(null);
    const response = await PATCH(request('PATCH', input), { params: Promise.resolve({ id: 'expense-1' }) });
    expect(response.status).toBe(422); expect(mocks.update).not.toHaveBeenCalled();
  });
  it('membatasi daftar kategori khusus ke toko pengguna dan menolak toko kosong', async () => {
    mocks.permission.mockResolvedValue({ id: 'user-1', storeId: null });
    expect((await GET(new Request('http://localhost/api/finance/expenses?month=2026-10&category=custom%3Acategory-1'))).status).toBe(403);
    expect((await POST(request('POST', input))).status).toBe(403);
    expect((await PATCH(request('PATCH', input), { params: Promise.resolve({ id: 'expense-1' }) })).status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it('menampilkan dan memfilter kategori khusus tanpa mencampur kategori Lainnya', async () => {
    const response = await GET(new Request('http://localhost/api/finance/expenses?month=2026-10&category=custom%3Acategory-1'));
    expect(response.status).toBe(200); expect((await response.json()).data[0].category).toBe('custom:category-1');
    expect(mocks.findMany.mock.calls[0][0].where).toMatchObject({ storeId: 'store-1', customCategoryId: 'category-1' });
    await GET(new Request('http://localhost/api/finance/expenses?month=2026-10&category=OTHER'));
    expect(mocks.findMany.mock.calls[1][0].where).toMatchObject({ storeId: 'store-1', category: 'OTHER', customCategoryId: null });
  });
  it('mempertahankan kategori khusus saat mengedit dan menghapusnya saat mengganti kategori bawaan', async () => {
    const context = { params: Promise.resolve({ id: 'expense-1' }) };
    const { customCategoryId: _omit, ...withoutCategory } = input;
    expect((await PATCH(request('PATCH', withoutCategory), context)).status).toBe(200);
    expect(mocks.update.mock.calls[0][0].data.customCategoryId).toBe('category-1');
    expect((await PATCH(request('PATCH', { ...withoutCategory, category: 'SUPPLIES' }), context)).status).toBe(200);
    expect(mocks.update.mock.calls[1][0].data.customCategoryId).toBeNull();
  });
  it('menolak menyematkan kategori khusus pada kategori bawaan', async () => {
    const response = await POST(request('POST', { ...input, category: 'SUPPLIES' }));
    expect(response.status).toBe(422); expect(mocks.create).not.toHaveBeenCalled();
  });
});
