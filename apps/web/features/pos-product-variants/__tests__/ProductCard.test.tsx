import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProductCard } from '../components/ProductCard';
import type { Product } from '@/hooks/useProducts';

describe('ProductCard', () => {
  const mockProduct: Product = {
    id: 'group-1',
    name: 'Coffee',
    sku: 'COFFEE-DUS',
    price: 50000,
    costPrice: 40000,
    stock: 10,
    unit: 'dus',
    isActive: true,
    minStock: 5,
    category: { id: 'cat1', name: 'Beverage', icon: null, color: '#1976d2' },
    imageUrl: null,
    defaultVariant: {
      id: '1',
      unit: 'dus',
      price: 50000,
      stock: 10,
      sku: 'COFFEE-DUS',
    },
    variants: [
      {
        id: '1',
        unit: 'dus',
        price: 50000,
        costPrice: 40000,
        stock: 10,
        sku: 'COFFEE-DUS',
      },
      {
        id: '2',
        unit: 'pcs',
        price: 5000,
        costPrice: 4000,
        stock: 100,
        sku: 'COFFEE-PCS',
      },
      {
        id: '3',
        unit: 'pack',
        price: 48000,
        costPrice: 38000,
        stock: 5,
        sku: 'COFFEE-PACK',
      },
    ] as any,
  } as Product;

  const mockProductWith2Variants: Product = {
    ...mockProduct,
    variants: (mockProduct.variants || []).slice(0, 2) as any,
  };

  it('renders product name', () => {
    const onAddToCart = vi.fn();
    const html = renderToStaticMarkup(
      <ProductCard product={mockProduct} onAddToCart={onAddToCart} />
    );

    expect(html).toContain('Coffee');
  });

  it('renders default variant price', () => {
    const onAddToCart = vi.fn();
    const html = renderToStaticMarkup(
      <ProductCard product={mockProduct} onAddToCart={onAddToCart} />
    );

    expect(html).toContain('50.000');
  });

  it('renders default variant unit', () => {
    const onAddToCart = vi.fn();
    const html = renderToStaticMarkup(
      <ProductCard product={mockProduct} onAddToCart={onAddToCart} />
    );

    expect(html).toContain('dus');
  });

  it('renders category name', () => {
    const onAddToCart = vi.fn();
    const html = renderToStaticMarkup(
      <ProductCard product={mockProduct} onAddToCart={onAddToCart} />
    );

    expect(html).toContain('Beverage');
  });

  it('renders regular price hint when requested', () => {
    const onAddToCart = vi.fn();
    const html = renderToStaticMarkup(
      <ProductCard
        product={mockProduct}
        onAddToCart={onAddToCart}
        showRegularPriceHint
      />
    );

    expect(html).toContain('Harga Reguler');
    expect(html).toContain('Tidak ada Harga Dinas atau Harga Khusus');
  });

  it('does not render regular price hint by default', () => {
    const onAddToCart = vi.fn();
    const html = renderToStaticMarkup(
      <ProductCard product={mockProduct} onAddToCart={onAddToCart} />
    );

    expect(html).not.toContain('Harga Reguler');
  });

  it('includes select element when 3+ variants', () => {
    const onAddToCart = vi.fn();
    const html = renderToStaticMarkup(
      <ProductCard product={mockProduct} onAddToCart={onAddToCart} />
    );

    expect(html).toContain('<select');
  });

  it('excludes select element when less than 3 variants', () => {
    const onAddToCart = vi.fn();
    const html = renderToStaticMarkup(
      <ProductCard product={mockProductWith2Variants} onAddToCart={onAddToCart} />
    );

    expect(html).not.toContain('<select');
  });

  it('includes all variants as select options when 3+', () => {
    const onAddToCart = vi.fn();
    const html = renderToStaticMarkup(
      <ProductCard product={mockProduct} onAddToCart={onAddToCart} />
    );

    expect(html).toContain('dus');
    expect(html).toContain('pcs');
    expect(html).toContain('pack');
  });

  it('displays variant prices in select options', () => {
    const onAddToCart = vi.fn();
    const html = renderToStaticMarkup(
      <ProductCard product={mockProduct} onAddToCart={onAddToCart} />
    );
    expect(html).toContain('5.000');
    expect(html).toContain('48.000');
  });

  it('displays "(Stok Habis)" for empty stock variants in select options', () => {
    const mockProductWithEmptyStock = {
      ...mockProduct,
      variants: [
        ...(mockProduct.variants || []),
        {
          id: '4',
          unit: 'box',
          price: 100000,
          costPrice: 80000,
          stock: 0,
          sku: 'COFFEE-BOX',
        }
      ]
    } as any;

    const onAddToCart = vi.fn();
    const html = renderToStaticMarkup(
      <ProductCard product={mockProductWithEmptyStock} onAddToCart={onAddToCart} />
    );

    expect(html).toContain('(Stok Habis)');
  });

  it('renders harga agen and harga dinas when they exist', () => {
    const mockProductWithPrices = {
      ...mockProduct,
      hargaAgen: 45000,
      hargaDinas: 47000,
    } as any;

    const onAddToCart = vi.fn();
    const html = renderToStaticMarkup(
      <ProductCard product={mockProductWithPrices} onAddToCart={onAddToCart} />
    );

    expect(html).toContain('45.000');
    expect(html).toContain('47.000');
  });

  it('renders fallback text when harga agen and harga dinas are missing', () => {
    const mockProductWithoutPrices = {
      ...mockProduct,
      hargaAgen: 0,
      hargaDinas: null,
    } as any;

    const onAddToCart = vi.fn();
    const html = renderToStaticMarkup(
      <ProductCard product={mockProductWithoutPrices} onAddToCart={onAddToCart} />
    );

    expect(html).toContain('Belum ada harga agen');
    expect(html).toContain('Belum ada harga dinas');
  });
});
