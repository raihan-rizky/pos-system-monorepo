import { describe, expect, it } from 'vitest';
import { validateManualIncome } from '../manual-finance';

const now = new Date('2026-11-10T03:00:00Z');
const income = { description: 'Pemasukan contoh', category: 'ATK', amount: 100000, occurredAt: '2026-11-09' };

describe('metode pembayaran pemasukan manual', () => {
  it('mempertahankan tiga metode dan nominalnya', () => {
    const payments = [
      { method: 'CASH', amount: 40000 },
      { method: 'TRANSFER', amount: 35000 },
      { method: 'QRIS', amount: 25000 },
    ];
    expect(validateManualIncome({ ...income, payments }, now)).toEqual({ success: true, data: { ...income, payments } });
  });

  it('menghitung pecahan dalam satuan terkecil tanpa selisih floating point', () => {
    const payments = [{ method: 'CASH', amount: 0.01 }, { method: 'QRIS', amount: 0.02 }];
    expect(validateManualIncome({ ...income, amount: 0.03, payments }, now)).toEqual({
      success: true, data: { ...income, amount: 0.03, payments },
    });
  });

  it.each([
    { payments: [] },
    { payments: [{ method: 'TEMPO', amount: 100000 }] },
    { payments: [{ method: 'CASH', amount: 0 }] },
    { payments: [{ method: 'CASH', amount: 100000.001 }] },
    { payments: [{ method: 'CASH', amount: 50000 }, { method: 'CASH', amount: 50000 }] },
    { payments: [{ method: 'CASH', amount: 99999 }] },
    { payments: [{ method: 'CASH', amount: 100001 }] },
    { payments: 'CASH' },
  ])('menolak rincian yang tidak sah: $payments', ({ payments }) => {
    expect(validateManualIncome({ ...income, payments }, now)).toMatchObject({ success: false, errors: { payments: expect.any(Array) } });
  });

  it('tetap menerima catatan lama tanpa rincian metode', () => {
    expect(validateManualIncome(income, now)).toEqual({ success: true, data: income });
  });
});
