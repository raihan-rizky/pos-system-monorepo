import { describe, expect, it } from 'vitest';
import type { Product } from '@/hooks/useProducts';
import { mapProductToCartItem } from '../services/cart-mapping';

describe('CartMappingService', () => {
  const mockCategory = {
    id: 'cat1',
    name: 'Office Supplies',
    icon: 'folder',
    color: '#3b82f6',
  };

  const simpleProduct: Product = {
    id: 'prod1',
    name: 'Standard Pen',
    sku: 'PEN-STD',
    price: 5000,
    costPrice: 3000,
    hargaDinas: 4500,
    hargaAgen: 4200,
    stock: 20,
    minStock: 5,
    unit: 'pcs',
    size: 'M',
    material: 'Plastic',
    imageUrl: null,
    isActive: true,
    category: mockCategory,
  };

  const variantProduct: Product = {
    id: 'prod2',
    name: 'Acco Binder',
    sku: 'ACCO-DEFAULT',
    price: 12000, // Top-level values (e.g. copied from Dus)
    costPrice: 9000,
    hargaDinas: 11000,
    hargaAgen: 10500,
    stock: 5,
    minStock: 2,
    unit: 'Dus',
    size: 'Large',
    material: 'Metal',
    imageUrl: null,
    isActive: true,
    category: mockCategory,
    defaultVariant: {
      id: 'acco-pak',
      unit: 'Pak',
      price: 13500,
      stock: 15,
      sku: 'ACCO-PAK',
    },
    variants: [
      {
        id: 'acco-dus',
        unit: 'Dus',
        price: 12000,
        costPrice: 9000,
        hargaDinas: 11000,
        hargaAgen: 10500,
        stock: 5,
        sku: 'ACCO-DUS',
        size: 'Large',
        material: 'Metal',
        barcode: '11111',
      },
      {
        id: 'acco-pak',
        unit: 'Pak',
        price: 13500,
        costPrice: 10000,
        hargaDinas: 12500,
        hargaAgen: 12000,
        stock: 15,
        sku: 'ACCO-PAK',
        size: 'Medium',
        material: 'Plastic',
        barcode: '22222',
      },
    ],
  };

  it('maps a simple product with no variants correctly', () => {
    const result = mapProductToCartItem(simpleProduct);

    expect(result).toEqual({
      id: 'prod1',
      name: 'Standard Pen',
      price: 5000,
      costPrice: 3000,
      hargaDinas: 4500,
      hargaAgen: 4200,
      brandId: null,
      brandName: null,
      unit: 'pcs',
      stock: 20,
      unitMultiplierToBase: null,
      stockGroup: null,
      categoryId: 'cat1',
      categoryName: 'Office Supplies',
      size: 'M',
      material: 'Plastic',
    });
  });

  it('maps to the default variant when no variantId is provided', () => {
    const result = mapProductToCartItem(variantProduct);

    // The defaultVariant has ID 'acco-pak'
    expect(result.id).toBe('acco-pak');
    expect(result.unit).toBe('Pak');
    expect(result.price).toBe(13500);
    // Values that should come from the 'acco-pak' variant object in variants array:
    expect(result.costPrice).toBe(10000);
    expect(result.hargaDinas).toBe(12500);
    expect(result.hargaAgen).toBe(12000);
    expect(result.size).toBe('Medium');
    expect(result.material).toBe('Plastic');
  });

  it('maps to a specific variant when variantId is provided', () => {
    const result = mapProductToCartItem(variantProduct, 'acco-dus');

    expect(result.id).toBe('acco-dus');
    expect(result.unit).toBe('Dus');
    expect(result.price).toBe(12000);
    expect(result.costPrice).toBe(9000);
    expect(result.hargaDinas).toBe(11000);
    expect(result.hargaAgen).toBe(10500);
    expect(result.size).toBe('Large');
    expect(result.material).toBe('Metal');
  });

  it('preserves brand scope when mapping a selected variant to cart', () => {
    const result = mapProductToCartItem(
      {
        ...variantProduct,
        variants: [
          {
            id: 'acco-dus',
            unit: 'Dus',
            price: 12000,
            costPrice: 9000,
            hargaDinas: 11000,
            hargaAgen: 10500,
            stock: 5,
            sku: 'ACCO-DUS',
            size: 'Large',
            material: 'Metal',
            barcode: '11111',
            brandId: 'brand-joyko',
            brand: {
              id: 'brand-joyko',
              name: 'Joyko',
            },
          },
        ],
      },
      'acco-dus',
    );

    expect(result.brandId).toBe('brand-joyko');
    expect(result.brandName).toBe('Joyko');
  });

  it('falls back to default variant if specified variantId is not found', () => {
    const result = mapProductToCartItem(variantProduct, 'non-existent-id');

    expect(result.id).toBe('acco-pak');
    expect(result.unit).toBe('Pak');
    expect(result.price).toBe(13500);
  });
});
