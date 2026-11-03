import { describe, expect, it } from 'vitest';
import { validateManualIncome, validateManualTransfer } from '../manual-finance';

const now = new Date('2026-11-02T06:00:00Z');
const income = { description: ' Pemasukan tambahan ', category: 'ATK', amount: 100000, occurredAt: '2026-11-02' };

describe('pencatatan keuangan manual', () => {
  it.each(['ATK','CETAK','SPANDUK','PRINT','STEMPEL'])('menerima kategori %s dan merapikan sumber', (category) => {
    expect(validateManualIncome({ ...income, category }, now)).toEqual({ success: true, data: { ...income, description: 'Pemasukan tambahan', category } });
  });
  it.each([0,-1,NaN,Infinity,10000000000,1.001,'100000',null])('menolak nominal %s', (amount) => {
    expect(validateManualIncome({ ...income, amount }, now)).toMatchObject({ success:false, errors:{amount:expect.any(Array)} });
  });
  it.each(['PLAT','UNMAPPED','atk',null])('menolak kategori %s', (category) => {
    expect(validateManualIncome({ ...income, category }, now).success).toBe(false);
  });
  it.each(['2026-02-31','2026-11-03','2021-11-01','2026-13-01','bukan tanggal'])('menolak tanggal %s', (occurredAt) => {
    expect(validateManualIncome({ ...income, occurredAt }, now)).toMatchObject({ success:false, errors:{occurredAt:expect.any(Array)} });
  });
  it('menerima batas lima tahun dan nominal desimal', () => {
    expect(validateManualIncome({ ...income, amount:12.34, occurredAt:'2021-11-02' }, now).success).toBe(true);
  });
  it('menggunakan hari WIB sesudah pergantian hari UTC', () => {
    expect(validateManualIncome({ ...income, occurredAt:'2026-11-03' },new Date('2026-11-02T17:00:00Z')).success).toBe(true);
  });
  it.each([null,{}, { ...income, description:12 }, { ...income, description:' ' },{...income,description:'a'.repeat(501)}])('menolak payload atau keterangan tidak sah', (payload) => {
    expect(validateManualIncome(payload,now).success).toBe(false);
  });
  it('memvalidasi penerima dan keterangan belanja transfer', () => {
    const payload = { applicantName:' Pemasok ', description:' Kertas ',amount:25000,occurredAt:'2026-11-02',attachmentUrl:null };
    expect(validateManualTransfer(payload,now)).toEqual({success:true,data:{...payload,applicantName:'Pemasok',description:'Kertas'}});
    expect(validateManualTransfer({...payload,applicantName:''},now)).toMatchObject({success:false,errors:{applicantName:expect.any(Array)}});
  });
});
