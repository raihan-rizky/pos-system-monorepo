import { describe, expect, it, vi } from 'vitest';
import { canRolePerformAction } from '@/features/rbac/helpers/rbac-core';
import { createDatabaseResetPlan } from '@/features/database-reset/helpers/database-reset-plan';
import type { DatabaseResetReadClient } from '@/features/database-reset/types/database-reset';

describe('akses dan reset pemasukan manual', () => {
  it('mengikuti izin pengeluaran untuk create/update dan membatasi hapus', () => {
    expect(canRolePerformAction('CASHIER','income','create')).toBe(true);
    expect(canRolePerformAction('ADMIN','income','update')).toBe(true);
    expect(canRolePerformAction('ADMIN','income','delete')).toBe(true);
    expect(canRolePerformAction('CASHIER','income','delete')).toBe(false);
    expect(canRolePerformAction('SALES','income','create')).toBe(false);
  });
  it('mencakup pemasukan manual dalam reset keuangan toko', async () => {
    const count = vi.fn().mockResolvedValue(2);
    const db = new Proxy({}, { get:() => ({count}) }) as DatabaseResetReadClient;
    const plan=await createDatabaseResetPlan({db,storeId:'store-1',domains:['salesFinance']});
    expect(plan.operations).toContainEqual(expect.objectContaining({model:'ManualIncome',count:2,where:{storeId:'store-1'}}));
  });
});
