import { describe, expect, it } from 'vitest';
import { customExpenseCategoryId, customExpenseCategoryKey, expenseCategoryColor, expenseCategoryLabel, normalizeExpenseCategoryName } from '../category-meta';
import { bucketExpensesByCategory, bucketExpensesByDay } from '../keuangan-core';

describe('kategori pengeluaran khusus', () => {
  it('memisahkan label kategori khusus dari kategori bawaan', () => {
    expect(customExpenseCategoryKey('parking')).toBe('custom:parking');
    expect(customExpenseCategoryId('custom:parking')).toBe('parking');
    expect(customExpenseCategoryId('OTHER')).toBeNull();
    expect(expenseCategoryLabel('custom:parking', [{ id: 'parking', name: 'Parkir' }])).toBe('Parkir');
    expect(expenseCategoryLabel('OTHER')).toBe('Lainnya');
    expect(expenseCategoryColor('OTHER')).toBe('#64748B');
    expect(normalizeExpenseCategoryName('  PARKIR   Kantor  ')).toBe('parkir kantor');
  });
  it('mengelompokkan nominal kategori khusus tanpa mencampur Lainnya', () => {
    const rows = [
      { occurredAt: new Date('2026-10-01T03:00:00Z'), amount: 100, changeAmount: 10, category: 'custom:parking' as const },
      { occurredAt: new Date('2026-10-01T03:00:00Z'), amount: 50, changeAmount: 0, category: 'OTHER' as const },
    ];
    expect(bucketExpensesByCategory(rows)).toEqual([{ category: 'custom:parking', total: 90 }, { category: 'OTHER', total: 50 }]);
    expect(bucketExpensesByDay(rows)).toEqual([{ date: '2026-10-01', total: 140, byCategory: { 'custom:parking': 90, OTHER: 50 } }]);
  });
});
