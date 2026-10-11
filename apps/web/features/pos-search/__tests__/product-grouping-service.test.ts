import { describe, expect, it } from 'vitest';
import type { Product } from '@/hooks/useProducts';
import { groupProductsByNameAndCategory, selectDefaultVariant } from '../services/product-grouping-service';

describe('ProductGroupingService', () => {
  it('preserves the default description and each variant description independently', () => {
    const [group] = groupProductsByNameAndCategory([
      { id: 'pcs', name: 'Kertas', unit: 'pcs', stock: 1, description: 'Satu lembar', category: { id: 'paper' } },
      { id: 'rim', name: 'Kertas', unit: 'rim', stock: 20, description: 'Isi 500 lembar', category: { id: 'paper' } },
    ] as unknown as Product[]);
    expect(group.description).toBe('Isi 500 lembar');
    expect(group.variants.map((variant) => variant.description)).toEqual(['Satu lembar', 'Isi 500 lembar']);
  });

  it('keeps the base modal of each variant and the chosen default independently', () => {
    const grouped = groupProductsByNameAndCategory([
      { id: 'rim', name: 'Kertas', unit: 'rim', stock: 20, price: 10000, costPrice: 9000, baseCostPrice: 700, baseCostUnit: 'pcs', category: { id: 'paper' } },
      { id: 'other', name: 'Kertas', unit: 'pcs', stock: 1, price: 2000, costPrice: 800, baseCostPrice: 800, baseCostUnit: 'pcs', category: { id: 'paper' } },
    ] as Product[]);
    expect(grouped[0].baseCostPrice).toBe(700);
    expect(grouped[0].variants[1].baseCostPrice).toBe(800);
  });
  describe('selectDefaultVariant', () => {
    it('selects variant with highest stock', () => {
      const variants: Product[] = [
        {
          id: '1',
          name: 'Coffee',
          sku: 'COFFEE-DUS',
          price: 50000,
          stock: 10,
          unit: 'dus',
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
        {
          id: '2',
          name: 'Coffee',
          sku: 'COFFEE-PCS',
          price: 5000,
          stock: 100,
          unit: 'pcs',
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
      ];

      const result = selectDefaultVariant(variants);
      expect(result.id).toBe('2');
      expect(result.stock).toBe(100);
    });

    it('selects first variant when stock is equal', () => {
      const variants: Product[] = [
        { id: '1', stock: 50 } as Product,
        { id: '2', stock: 50 } as Product,
      ];

      const result = selectDefaultVariant(variants);
      expect(result.id).toBe('1');
    });

    it('selects variant even when stock is zero', () => {
      const variants: Product[] = [
        { id: '1', stock: 0 } as Product,
        { id: '2', stock: 0 } as Product,
      ];

      const result = selectDefaultVariant(variants);
      expect(result).toBeDefined();
      expect(result.id).toBe('1');
    });
  });

  describe('groupProductsByNameAndCategory', () => {
    it('groups products by name and categoryId', () => {
      const products: Product[] = [
        {
          id: '1',
          name: 'Coffee',
          sku: 'COFFEE-DUS',
          price: 50000,
          stock: 10,
          unit: 'dus',
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
        {
          id: '2',
          name: 'Coffee',
          sku: 'COFFEE-PCS',
          price: 5000,
          stock: 100,
          unit: 'pcs',
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
        {
          id: '3',
          name: 'Tea',
          sku: 'TEA-DUS',
          price: 40000,
          stock: 5,
          unit: 'dus',
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
      ];

      const result = groupProductsByNameAndCategory(products);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Coffee');
      expect(result[0].variants).toHaveLength(2);
      expect(result[1].name).toBe('Tea');
      expect(result[1].variants).toHaveLength(1);
    });

    it('returns products with defaultVariant set to highest stock variant', () => {
      const products: Product[] = [
        {
          id: '1',
          name: 'Coffee',
          sku: 'COFFEE-DUS',
          price: 50000,
          stock: 10,
          unit: 'dus',
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
        {
          id: '2',
          name: 'Coffee',
          sku: 'COFFEE-PCS',
          price: 5000,
          stock: 100,
          unit: 'pcs',
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
      ];

      const result = groupProductsByNameAndCategory(products);

      expect(result[0].defaultVariant.id).toBe('2');
      expect(result[0].defaultVariant.price).toBe(5000);
      expect(result[0].defaultVariant.stock).toBe(100);
      expect(result[0].defaultVariant.unit).toBe('pcs');
    });

    it('does not group products with different categories', () => {
      const products: Product[] = [
        {
          id: '1',
          name: 'Coffee',
          sku: 'COFFEE-DUS',
          price: 50000,
          stock: 10,
          unit: 'dus',
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
        {
          id: '2',
          name: 'Coffee',
          sku: 'COFFEE-PCS',
          price: 5000,
          stock: 100,
          unit: 'pcs',
          category: { id: 'cat2', name: 'Food', icon: null, color: '#111' },
        } as Product,
      ];

      const result = groupProductsByNameAndCategory(products);

      expect(result).toHaveLength(2);
      expect(result[0].variants).toHaveLength(1);
      expect(result[1].variants).toHaveLength(1);
    });

    it('handles empty product list', () => {
      const result = groupProductsByNameAndCategory([]);
      expect(result).toHaveLength(0);
    });

    it('handles single product', () => {
      const products: Product[] = [
        {
          id: '1',
          name: 'Coffee',
          sku: 'COFFEE-DUS',
          price: 50000,
          stock: 10,
          unit: 'dus',
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
      ];

      const result = groupProductsByNameAndCategory(products);

      expect(result).toHaveLength(1);
      expect(result[0].variants).toHaveLength(1);
      expect(result[0].defaultVariant.id).toBe('1');
    });

    it('preserves all variant data in variants array', () => {
      const products: Product[] = [
        {
          id: '1',
          name: 'Coffee',
          sku: 'COFFEE-DUS',
          price: 50000,
          costPrice: 40000,
          stock: 10,
          unit: 'dus',
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
          unitMultiplierToBase: 30,
          stockGroup: { id: 'sg1', displayName: 'Coffee Group', baseUnit: 'pcs', baseStock: 300 },
        } as Product,
      ];

      const result = groupProductsByNameAndCategory(products);

      expect(result[0].variants[0]).toMatchObject({
        id: '1',
        price: 50000,
        costPrice: 40000,
        unit: 'dus',
        unitMultiplierToBase: 30,
        stockGroup: { id: 'sg1' },
      });
    });

    it('groups products case-insensitively by name', () => {
      const products: Product[] = [
        {
          id: '1',
          name: 'COFFEE',
          sku: 'SKU1',
          price: 50000,
          stock: 10,
          unit: 'dus',
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
        {
          id: '2',
          name: 'coffee',
          sku: 'SKU2',
          price: 5000,
          stock: 100,
          unit: 'pcs',
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
      ];

      const result = groupProductsByNameAndCategory(products);

      expect(result).toHaveLength(1);
      expect(result[0].variants).toHaveLength(2);
    });

    it('sets top-level product properties (price, unit, stock, sku, hargaDinas, hargaAgen, costPrice, size, material) from the selected defaultVariant', () => {
      const products: Product[] = [
        {
          id: '1',
          name: 'Coffee',
          sku: 'COFFEE-DUS',
          price: 50000,
          costPrice: 40000,
          hargaDinas: 45000,
          hargaAgen: 43000,
          stock: 10,
          unit: 'dus',
          size: 'large',
          material: 'bag',
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
        {
          id: '2',
          name: 'Coffee',
          sku: 'COFFEE-PCS',
          price: 5000,
          costPrice: 4000,
          hargaDinas: 4500,
          hargaAgen: 4300,
          stock: 100,
          unit: 'pcs',
          size: 'small',
          material: 'cup',
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
      ];

      const result = groupProductsByNameAndCategory(products);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
      expect(result[0].sku).toBe('COFFEE-PCS');
      expect(result[0].price).toBe(5000);
      expect(result[0].costPrice).toBe(4000);
      expect(result[0].hargaDinas).toBe(4500);
      expect(result[0].hargaAgen).toBe(4300);
      expect(result[0].stock).toBe(100);
      expect(result[0].unit).toBe('pcs');
      expect(result[0].size).toBe('small');
      expect(result[0].material).toBe('cup');
    });

    it('maps variant-specific properties (hargaDinas, hargaAgen, barcode, size, material) to the variants array items', () => {
      const products: Product[] = [
        {
          id: '1',
          name: 'Coffee',
          sku: 'COFFEE-DUS',
          barcode: '123456',
          price: 50000,
          costPrice: null,
          hargaDinas: 45000,
          hargaAgen: 43000,
          stock: 10,
          minStock: 0,
          unit: 'dus',
          size: 'large',
          material: 'bag',
          imageUrl: null,
          isActive: true,
          category: { id: 'cat1', name: 'Beverage', icon: null, color: '#000' },
        } as Product,
      ];

      const result = groupProductsByNameAndCategory(products);

      expect(result[0].variants[0]).toMatchObject({
        id: '1',
        hargaDinas: 45000,
        hargaAgen: 43000,
        barcode: '123456',
        size: 'large',
        material: 'bag',
      });
    });
  });
});
