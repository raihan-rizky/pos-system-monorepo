import { describe, expect, it } from 'vitest';
import type { Product } from '@/hooks/useProducts';
import { groupProductsByNameAndCategory } from '@/features/pos-search/services/product-grouping-service';

describe('Products API - Variant Grouping Integration', () => {
  describe('GET /api/products - Response with grouped variants', () => {
    it('returns products grouped by name and categoryId', () => {
      const flatProducts: Product[] = [
        {
          id: '1',
          name: 'Coffee',
          sku: 'COFFEE-DUS',
          price: 50000,
          costPrice: 40000,
          stock: 10,
          unit: 'dus',
          isActive: true,
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
        {
          id: '2',
          name: 'Coffee',
          sku: 'COFFEE-PCS',
          price: 5000,
          costPrice: 4000,
          stock: 100,
          unit: 'pcs',
          isActive: true,
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
      ];

      const grouped = groupProductsByNameAndCategory(flatProducts);

      expect(grouped).toHaveLength(1);
      expect(grouped[0].name).toBe('Coffee');
      expect(grouped[0].variants).toHaveLength(2);
      expect(grouped[0].defaultVariant.stock).toBe(100); // highest stock
    });

    it('groups by name and categoryId separately', () => {
      const flatProducts: Product[] = [
        {
          id: '1',
          name: 'Paper',
          sku: 'PAPER-A4',
          price: 50000,
          stock: 10,
          unit: 'ream',
          isActive: true,
          category: { id: 'cat-office', name: 'Office', icon: null, color: '#111' },
        } as Product,
        {
          id: '2',
          name: 'Paper',
          sku: 'PAPER-SHEET',
          price: 1000,
          stock: 500,
          unit: 'sheet',
          isActive: true,
          category: { id: 'cat-office', name: 'Office', icon: null, color: '#111' },
        } as Product,
        {
          id: '3',
          name: 'Paper',
          sku: 'PAPER-BOX',
          price: 100000,
          stock: 2,
          unit: 'box',
          isActive: true,
          category: { id: 'cat-art', name: 'Art', icon: null, color: '#222' },
        } as Product,
      ];

      const grouped = groupProductsByNameAndCategory(flatProducts);

      // Should be 2 groups: Office Paper (2 variants) + Art Paper (1 variant)
      expect(grouped).toHaveLength(2);
      expect(grouped[0].variants).toHaveLength(2);
      expect(grouped[1].variants).toHaveLength(1);
    });

    it('defaultVariant has required fields for card display', () => {
      const flatProducts: Product[] = [
        {
          id: '1',
          name: 'Coffee',
          sku: 'COFFEE-DUS',
          price: 50000,
          stock: 10,
          unit: 'dus',
          isActive: true,
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
      ];

      const grouped = groupProductsByNameAndCategory(flatProducts);

      expect(grouped[0].defaultVariant).toHaveProperty('id');
      expect(grouped[0].defaultVariant).toHaveProperty('unit');
      expect(grouped[0].defaultVariant).toHaveProperty('price');
      expect(grouped[0].defaultVariant).toHaveProperty('stock');
      expect(grouped[0].defaultVariant).toHaveProperty('sku');
    });

    it('variants array includes all required fields for dropdown', () => {
      const flatProducts: Product[] = [
        {
          id: '1',
          name: 'Coffee',
          sku: 'COFFEE-DUS',
          price: 50000,
          costPrice: 40000,
          stock: 10,
          unit: 'dus',
          isActive: true,
          unitMultiplierToBase: 30,
          stockGroup: { id: 'sg1', displayName: 'Coffee', baseUnit: 'pcs', baseStock: 300 },
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
      ];

      const grouped = groupProductsByNameAndCategory(flatProducts);

      expect(grouped[0].variants[0]).toMatchObject({
        id: '1',
        unit: 'dus',
        price: 50000,
        costPrice: 40000,
        stock: 10,
        sku: 'COFFEE-DUS',
        unitMultiplierToBase: 30,
        stockGroup: expect.objectContaining({ id: 'sg1' }),
      });
    });

    it('handles products with empty stock in variants', () => {
      const flatProducts: Product[] = [
        {
          id: '1',
          name: 'Coffee',
          sku: 'COFFEE-DUS',
          price: 50000,
          stock: 0,
          unit: 'dus',
          isActive: true,
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
        {
          id: '2',
          name: 'Coffee',
          sku: 'COFFEE-PCS',
          price: 5000,
          stock: 50,
          unit: 'pcs',
          isActive: true,
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
      ];

      const grouped = groupProductsByNameAndCategory(flatProducts);

      // Should still include empty stock variant
      expect(grouped[0].variants).toHaveLength(2);
      // Default should be non-empty one
      expect(grouped[0].defaultVariant.stock).toBe(50);
    });

    it('maintains backward compatibility - defaultVariant values readable as product fields', () => {
      const flatProducts: Product[] = [
        {
          id: '1',
          name: 'Coffee',
          sku: 'COFFEE-DUS',
          price: 50000,
          stock: 10,
          unit: 'dus',
          isActive: true,
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
      ];

      const grouped = groupProductsByNameAndCategory(flatProducts);
      const merged = grouped[0];

      // Existing code reading merged.price should work (from defaultVariant)
      expect(merged.price).toBe(merged.defaultVariant.price);
      expect(merged.unit).toBe(merged.defaultVariant.unit);
      expect(merged.stock).toBe(merged.defaultVariant.stock);
    });
  });
});
