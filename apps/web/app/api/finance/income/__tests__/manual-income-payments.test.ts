import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from '../route';
import { PATCH } from '../[id]/route';

const mocks = vi.hoisted(() => ({ guard: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn() }));
vi.mock('@/lib/rbac/guard', () => ({ requirePermission: mocks.guard, handleAuthError: (error: unknown) => error instanceof Error && error.message === 'denied' ? new Response(null, { status: 403 }) : null }));
vi.mock('@pos/db', () => ({ db: { manualIncome: { findMany: mocks.findMany, count: mocks.count, create: mocks.create, findFirst: mocks.findFirst, update: mocks.update } } }));

const payments = [{ method: 'CASH', amount: 40000 }, { method: 'TRANSFER', amount: 60000 }];
const income = { description: 'Pemasukan contoh', category: 'ATK', amount: 100000, occurredAt: '2026-11-09' };
const row = { ...income, id: 'income-1', storeId: 'store-1', recordedById: 'user-1', occurredAt: new Date('2026-11-08T17:00:00Z'), createdAt: new Date('2026-11-09T00:00:00Z'), updatedAt: new Date('2026-11-09T00:00:00Z'), deletedAt: null, recordedBy: { id: 'user-1', name: 'Contoh' }, payments };
const request = (method: string, data: unknown) => new Request('http://localhost/api/finance/income', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
const context = { params: Promise.resolve({ id: 'income-1' }) };

describe('API rincian pembayaran pemasukan manual', () => {
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-10T03:00:00Z'));
    vi.clearAllMocks(); mocks.guard.mockResolvedValue({ id: 'user-1', storeId: 'store-1' });
    mocks.findMany.mockResolvedValue([row]); mocks.count.mockResolvedValue(1);
    mocks.create.mockResolvedValue(row); mocks.findFirst.mockResolvedValue(row); mocks.update.mockResolvedValue(row);
  });
  afterEach(() => vi.useRealTimers());

  it('menyimpan dan mengembalikan rincian metode dalam satu pembuatan', async () => {
    const response = await POST(request('POST', { ...income, payments }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payments: { create: payments }, storeId: 'store-1' }) }));
    expect((await response.json()).data.payments).toEqual(payments);
  });
  it('menolak pemasukan baru tanpa metode atau dengan jumlah tidak seimbang', async () => {
    expect((await POST(request('POST', income))).status).toBe(422);
    expect((await POST(request('POST', { ...income, payments: [{ method: 'CASH', amount: 1 }] }))).status).toBe(422);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('memuat rincian pembayaran untuk daftar dan pengeditan', async () => {
    const response = await GET(new Request('http://localhost/api/finance/income?month=2026-11'));
    expect((await response.json()).data[0].payments).toEqual(payments);
    expect(mocks.findMany.mock.calls[0][0].select.payments).toBeTruthy();
    expect(mocks.findMany.mock.calls[0][0].select.updatedAt).toBe(true);
  });
  it('memperbarui seluruh rincian bersama catatan pemasukan', async () => {
    const replacement = [{ method: 'QRIS', amount: 100000 }];
    const response = await PATCH(request('PATCH', { ...income, payments: replacement }), context);
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ payments: { deleteMany: {}, create: replacement } }) }));
  });
  it('mempertahankan rincian bila dihilangkan, tetapi menolak nominal yang tidak lagi cocok', async () => {
    expect((await PATCH(request('PATCH', income), context)).status).toBe(200);
    expect(mocks.update.mock.calls[0][0].data.payments).toBeUndefined();
    mocks.update.mockClear();
    expect((await PATCH(request('PATCH', { ...income, amount: 90000 }), context)).status).toBe(422);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('tetap mengizinkan koreksi catatan lama tanpa metode', async () => {
    mocks.findFirst.mockResolvedValue({ ...row, payments: [] });
    expect((await PATCH(request('PATCH', { ...income, amount: 90000 }), context)).status).toBe(200);
  });
  it('menolak perubahan bersamaan agar nominal dan rincian tidak terpisah', async () => {
    mocks.update.mockRejectedValue({ code: 'P2025' });
    const response = await PATCH(request('PATCH', { ...income, payments }), context);
    expect(mocks.update.mock.calls[0][0].where.updatedAt).toEqual(row.updatedAt);
    expect(response.status).toBe(409);
  });
  it('menolak formulir dengan versi lama tanpa menimpa perubahan terbaru', async () => {
    const response = await PATCH(request('PATCH', { ...income, payments, updatedAt: '2026-11-08T00:00:00.000Z' }), context);
    expect(response.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('menerima versi terbaru ketika menyimpan rincian', async () => {
    const response = await PATCH(request('PATCH', { ...income, payments, updatedAt: row.updatedAt.toISOString() }), context);
    expect(response.status).toBe(200);
    expect(mocks.update.mock.calls[0][0].where.updatedAt).toEqual(row.updatedAt);
  });
  it('menolak akses pengguna tanpa izin', async () => {
    mocks.guard.mockRejectedValue(new Error('denied'));
    expect((await POST(request('POST', { ...income, payments }))).status).toBe(403);
    expect((await PATCH(request('PATCH', { ...income, payments }), context)).status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
