import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProductCard } from '../components/ProductCard';
import type { Product } from '@/hooks/useProducts';
import type { CategoryPricingRule } from '@/features/customer-category-pricing/helpers/pricing-rules';

describe('ProductCard', () => {
  it('renders a two-line description trigger for the active variant', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct, description: 'Deskripsi grup', variants: mockProduct.variants?.map(v => ({ ...v, description: v.id === '1' ? 'Isi dua belas botol' : 'Satu botol' })) }} onAddToCart={vi.fn()} />);
    expect(html).toContain('Isi dua belas botol');
    expect(html).not.toContain('Deskripsi grup');
    expect(html).toContain('line-clamp-2');
    expect(html).toContain('aria-label="Deskripsi produk"');
  });

  it('hides the description trigger when the active variant has no description', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct, description: 'Deskripsi varian lain', variants: mockProduct.variants?.map(v => ({ ...v, description: null })) }} onAddToCart={vi.fn()} />);
    expect(html).not.toContain('aria-label="Deskripsi produk"');
    expect(html).not.toContain('Deskripsi varian lain');
  });

  it('shows the description for an ungrouped product', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct, variants: undefined, defaultVariant: undefined, description: 'Kopi bubuk 250 gram' }} onAddToCart={vi.fn()} />);
    expect(html).toContain('Kopi bubuk 250 gram');
  });

  it('shows the effective unit price and badge beside it for a matching formula', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct, variants: mockProduct.variants?.map(v => ({ ...v, baseCostPrice: 700, baseCostUnit: 'pcs' })) }} onAddToCart={vi.fn()} customerType="UMUM" categoryPricingRules={[{ id: 'special', categoryId: 'cat1', customerType: 'ALL', mode: 'COST_PLUS_FLAT', value: 4000, unit: 'dus', isActive: true }]} />);
    expect(html).toContain('4.700');
    expect(html).toContain('Harga Khusus');
    expect(html).toMatch(/<div class="flex items-center gap-2"><p class="text-base font-bold text-emerald-800">Rp\s4\.700<\/p><span role="img" aria-label="Harga Khusus"/);
    expect(html).toContain('text-emerald-800');
    expect(html).not.toContain('700/pcs');
  });
  it('does not show a special badge for member pricing', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct, variants: mockProduct.variants?.map(v => ({ ...v, hargaAgen: 4200 })) }} onAddToCart={vi.fn()} customerType="AGEN" categoryPricingRules={[]} />);
    expect(html).toContain('4.200');
    expect(html).not.toContain('>Harga Khusus<');
  });
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

  it.each([
    { label: 'Agen', customerType: 'AGEN', mode: 'FLAT_DISCOUNT', value: 500, expected: '49.500' },
    { label: 'Dinas', customerType: 'PEMERINTAH', mode: 'PERCENT_DISCOUNT', value: 15, expected: '42.500' },
    { label: 'Agen', customerType: 'AGEN', mode: 'COST_PLUS_FLAT', value: 500, expected: '40.500' },
    { label: 'Dinas', customerType: 'PEMERINTAH', mode: 'COST_PLUS_PERCENT', value: 10, expected: '44.000' },
  ] as const)('shows the $mode rule price in the $label row without a manual member price', ({ label, customerType, mode, value, expected }) => {
    const rule: CategoryPricingRule = { id: 'special', categoryId: 'cat1', customerType, mode, value, unit: 'dus', isActive: true };
    const product = { ...mockProduct, variants: mockProduct.variants?.map(v => ({ ...v, baseCostPrice: 40000, baseCostUnit: 'dus' })) };
    const html = renderToStaticMarkup(<ProductCard product={product} onAddToCart={vi.fn()} categoryPricingRules={[rule]} />);
    const row = html.match(new RegExp(`<p\\b[^>]*><span\\b[^>]*>${label}:<\\/span>.*?<\\/p>`))?.[0];

    expect(row?.replace(/\s/g, ' ')).toContain(expected);
    expect(row).not.toContain('Belum ada harga');
    expect(html).toContain(label === 'Agen' ? 'Belum ada harga dinas' : 'Belum ada harga agen');
  });

  it('shows an ALL rule in both member rows instead of their manual prices', () => {
    const product = { ...mockProduct, variants: mockProduct.variants?.map(v => ({ ...v, hargaAgen: 45000, hargaDinas: 47000 })) };
    const rule: CategoryPricingRule = { id: 'special', categoryId: 'cat1', customerType: 'ALL', mode: 'PERCENT_DISCOUNT', value: 15, unit: 'dus', isActive: true };
    const html = renderToStaticMarkup(<ProductCard product={product} onAddToCart={vi.fn()} customerType="AGEN" categoryPricingRules={[rule]} />);

    for (const label of ['Agen', 'Dinas']) {
      const row = html.match(new RegExp(`<p\\b[^>]*><span\\b[^>]*>${label}:<\\/span>.*?<\\/p>`))?.[0];
      expect(row).toContain('42.500');
      expect(row).not.toContain(label === 'Agen' ? '45.000' : '47.000');
    }
  });

  it.each(['inactive', 'other-category', 'other-unit', 'other-brand', 'other-customer', 'zero-result'] as const)('retains manual member prices for an %s rule', (scope) => {
    const product = { ...mockProduct, variants: mockProduct.variants?.map(v => ({ ...v, hargaAgen: 45000, hargaDinas: 47000 })) };
    const rule: CategoryPricingRule = {
      id: 'special', categoryId: scope === 'other-category' ? 'other' : 'cat1',
      customerType: scope === 'other-customer' ? 'INDUSTRI' : 'ALL',
      mode: 'FLAT_DISCOUNT', value: scope === 'zero-result' ? 50000 : 500, isActive: scope !== 'inactive',
      unit: scope === 'other-unit' ? 'pcs' : 'dus', brandId: scope === 'other-brand' ? 'other' : null,
    };
    const html = renderToStaticMarkup(<ProductCard product={product} onAddToCart={vi.fn()} categoryPricingRules={[rule]} />);

    expect(html.match(/<p\b[^>]*><span\b[^>]*>Agen:<\/span>.*?<\/p>/)?.[0]).toContain('45.000');
    expect(html.match(/<p\b[^>]*><span\b[^>]*>Dinas:<\/span>.*?<\/p>/)?.[0]).toContain('47.000');
  });

  it('uses the selected unit and prioritizes its rule over the all-unit rule in both rows', () => {
    const product = { ...mockProduct, defaultVariant: mockProduct.variants![1] };
    const rules: CategoryPricingRule[] = [
      { id: 'all-units', categoryId: 'cat1', customerType: 'ALL', mode: 'PERCENT_DISCOUNT', value: 15, isActive: true },
      { id: 'pcs', categoryId: 'cat1', customerType: 'ALL', mode: 'FLAT_DISCOUNT', value: 500, unit: 'pcs', isActive: true },
    ];
    const html = renderToStaticMarkup(<ProductCard product={product} onAddToCart={vi.fn()} categoryPricingRules={rules} />);

    for (const label of ['Agen', 'Dinas']) {
      expect(html.match(new RegExp(`<p\\b[^>]*><span\\b[^>]*>${label}:<\\/span>.*?<\\/p>`))?.[0]).toContain('4.500');
    }
  });

  it('shows rule prices in both member rows for an ungrouped product', () => {
    const product = { ...mockProduct, variants: undefined, defaultVariant: undefined };
    const rule: CategoryPricingRule = { id: 'special', categoryId: 'cat1', customerType: 'ALL', mode: 'FLAT_DISCOUNT', value: 500, isActive: true };
    const html = renderToStaticMarkup(<ProductCard product={product} onAddToCart={vi.fn()} categoryPricingRules={[rule]} />);

    for (const label of ['Agen', 'Dinas']) {
      expect(html.match(new RegExp(`<p\\b[^>]*><span\\b[^>]*>${label}:<\\/span>.*?<\\/p>`))?.[0]).toContain('49.500');
    }
  });

  it('shows the smaller unit before the larger unit regardless of input order', () => {
    const product = {
      ...mockProductWith2Variants,
      unit: 'pcs',
      stockGroup: { id: 'group-1', displayName: 'Coffee', baseUnit: 'pcs', baseStock: 100 },
      variants: [
        { id: 'bal', unit: 'Bal', price: 50000, stock: 2, sku: 'COFFEE-BAL', unitMultiplierToBase: 20 },
        { id: 'pcs', unit: 'Pcs', price: 3000, stock: 100, sku: 'COFFEE-PCS', unitMultiplierToBase: 1 },
      ],
    } as unknown as Product;

    const html = renderToStaticMarkup(
      <ProductCard product={product} onAddToCart={vi.fn()} />,
    );

    expect(html.indexOf('Pcs')).toBeLessThan(html.indexOf('Bal'));
  });
});
