import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), findMany: vi.fn(), create: vi.fn() }));
vi.mock('@/lib/rbac/guard', () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock('@pos/db', () => ({ db: { customExpenseCategory: { findMany: mocks.findMany, create: mocks.create } } }));

describe('kategori pengeluaran', () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.permission.mockResolvedValue({ id: 'user-1', storeId: 'store-1' }); mocks.authError.mockReturnValue(null); mocks.findMany.mockResolvedValue([{ id: 'cat-1', name: 'Parkir' }]); mocks.create.mockResolvedValue({ id: 'cat-1', name: 'Parkir Kantor' }); });
  it('hanya menampilkan kategori toko pengguna', async () => {
    const { GET } = await import('../route');
    const response = await GET();
    expect(response.status).toBe(200); expect((await response.json()).data).toEqual([{ id: 'cat-1', name: 'Parkir' }]);
    expect(mocks.findMany.mock.calls[0][0].where).toEqual({ storeId: 'store-1' });
  });
  it('menyimpan nama rapi dan kunci normalisasi di toko pengguna', async () => {
    const { POST } = await import('../route');
    const response = await POST(new Request('http://localhost/api/finance/expense-categories', { method: 'POST', body: JSON.stringify({ name: '  Parkir   Kantor  ' }) }));
    expect(response.status).toBe(201);
    expect(mocks.create.mock.calls[0][0].data).toEqual({ storeId: 'store-1', name: 'Parkir Kantor', normalizedName: 'parkir kantor' });
  });
  it('menolak nama kategori bawaan dan duplikat dalam toko', async () => {
    const { POST } = await import('../route');
    const make = (name: string) => new Request('http://localhost/api/finance/expense-categories', { method: 'POST', body: JSON.stringify({ name }) });
    expect((await POST(make('  LAINNYA '))).status).toBe(409);
    mocks.create.mockRejectedValue({ code: 'P2002' });
    expect((await POST(make('Parkir'))).status).toBe(409);
  });
  it('menolak membaca atau membuat kategori ketika toko belum tersedia', async () => {
    const { GET, POST } = await import('../route'); mocks.permission.mockResolvedValue({ id: 'user-1', storeId: null });
    expect((await GET()).status).toBe(403);
    expect((await POST(new Request('http://localhost/api/finance/expense-categories', { method: 'POST', body: JSON.stringify({ name: 'Parkir' }) }))).status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
  });
});
