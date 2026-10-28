import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ProductCard } from '../components/ProductCard';
import type { Product } from '@/hooks/useProducts';
import type { CategoryPricingRule } from '@/features/customer-category-pricing/helpers/pricing-rules';

describe('ProductCard', () => {
  it('shows the rounded selling price with a disclosure and respects an inactive policy', () => {
    const product = { ...mockProduct, price: 4050, defaultVariant: undefined, variants: undefined };
    const html = renderToStaticMarkup(<ProductCard product={product} onAddToCart={vi.fn()} />);
    expect(html).toContain('4.500');
    expect(html).toContain('Dibulatkan ke atas');
    const unrounded = renderToStaticMarkup(<ProductCard product={product} onAddToCart={vi.fn()} roundingSettings={{ enabled: false, increment: 500, threshold: 50 }} />);
    expect(unrounded).toContain('4.050');
    expect(unrounded).not.toContain('Dibulatkan');
  });
  it('renders the shared product description instead of a unit description', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct, description: 'Deskripsi grup', variants: mockProduct.variants?.map(v => ({ ...v, description: v.id === '1' ? 'Isi dua belas botol' : 'Satu botol' })) }} onAddToCart={vi.fn()} />);
    expect(html).not.toContain('Isi dua belas botol');
    expect(html).toContain('Deskripsi grup');
    expect(html).toContain('line-clamp-2');
    expect(html).toContain('aria-label="Deskripsi produk"');
  });

  it.each([0, 1])('keeps the shared description when unit %s has no description', (unitIndex) => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct, defaultVariant: mockProduct.variants![unitIndex], description: 'Deskripsi varian lain', variants: mockProduct.variants?.map(v => ({ ...v, description: null })) }} onAddToCart={vi.fn()} />);
    expect(html).toContain('aria-label="Deskripsi produk"');
    expect(html).toContain('Deskripsi varian lain');
  });

  it('hides the description when the shared product description is blank', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct, description: '  ' }} onAddToCart={vi.fn()} />);
    expect(html).not.toContain('aria-label="Deskripsi produk"');
  });

  it('shows the description for an ungrouped product', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct, variants: undefined, defaultVariant: undefined, description: 'Kopi bubuk 250 gram' }} onAddToCart={vi.fn()} />);
    expect(html).toContain('Kopi bubuk 250 gram');
  });

  it('shows the effective unit price and badge beside it for a matching formula', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct, variants: mockProduct.variants?.map(v => ({ ...v, baseCostPrice: 700, baseCostUnit: 'pcs' })) }} onAddToCart={vi.fn()} customerType="UMUM" categoryPricingRules={[{ id: 'special', categoryId: 'cat1', customerType: 'ALL', mode: 'COST_PLUS_FLAT', value: 4000, unit: 'dus', isActive: true }]} />);
    expect(html).toContain('4.700');
    expect(html).toContain('Harga Khusus');
    expect(html).toMatch(/<div class="flex items-center gap-2"><p class="text-base font-bold text-emerald-800">Rp\s5\.000<\/p><span role="img" aria-label="Harga Khusus"/);
    expect(html).toContain('text-emerald-800');
    expect(html).not.toContain('700/pcs');
  });
  it('marks an overridden member price in both its row and the selected price', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct, variants: mockProduct.variants?.map(v => ({ ...v, hargaAgen: 4200 })) }} onAddToCart={vi.fn()} customerType="AGEN" categoryPricingRules={[]} />);
    expect(html).toContain('4.200');
    const row = html.match(/<p\b[^>]*><span\b[^>]*>Agen:<\/span>.*?<\/p>/)?.[0];
    expect(row).toContain('aria-label="Harga Khusus"');
    expect(row).toContain('text-emerald-800');
    expect(html).toMatch(/text-base font-bold text-emerald-800/);
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

  it('shows the selected unit badge immediately after the category badge', () => {
    const html = renderToStaticMarkup(
      <ProductCard product={mockProduct} onAddToCart={vi.fn()} />
    );

    expect(html).toMatch(/<span>Beverage<\/span><\/div><span[^>]*aria-label="Satuan terpilih"[^>]*>10 dus<\/span>/);
  });

  it('uses the product unit badge when the product has no variants', () => {
    const html = renderToStaticMarkup(
      <ProductCard product={{ ...mockProduct, variants: undefined, defaultVariant: undefined, unit: 'lembar' }} onAddToCart={vi.fn()} />
    );

    expect(html).toMatch(/aria-label="Satuan terpilih"[^>]*>10 lembar<\/span>/);
  });

  it.each([
    [32, '32 dus'],
    [32.5, '32 dus 6 pcs'],
    [0, '0 dus'],
    [-2, '-2 dus'],
  ])('shows selected stock %s in the unit badge', (stock, label) => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct,
      unitMultiplierToBase: 12,
      stockGroup: { id: 'group', displayName: 'Coffee', baseUnit: 'pcs', baseStock: Number(stock) * 12 },
      variants: mockProduct.variants?.map(v => ({ ...v, stock: Number(stock), unitMultiplierToBase: 12 })),
    }} onAddToCart={vi.fn()} />);

    expect(html.match(/aria-label="Satuan terpilih"[^>]*>([^<]*)<\/span>/)?.[1]).toBe(label);
    expect(html.match(/aria-label="Konversi satuan"[^>]*>([^<]*)<\/p>/)?.[1]).toBe('1 dus = 12 pcs');
  });

  it.each([undefined, 0, -12, Number.NaN, Number.POSITIVE_INFINITY])('hides an unavailable or invalid conversion factor %s', (factor) => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct,
      stockGroup: { id: 'group', displayName: 'Coffee', baseUnit: 'pcs', baseStock: 120 },
      variants: mockProduct.variants?.map(v => ({ ...v, unitMultiplierToBase: factor })),
    }} onAddToCart={vi.fn()} />);

    expect(html).not.toContain('aria-label="Konversi satuan"');
  });

  it('hides conversion when the base unit is unavailable', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct,
      unitMultiplierToBase: 12,
      variants: mockProduct.variants?.map(v => ({ ...v, unitMultiplierToBase: 12 })),
    }} onAddToCart={vi.fn()} />);

    expect(html).not.toContain('aria-label="Konversi satuan"');
  });

  it('does not borrow the root multiplier for a different selected unit', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct,
      unit: 'pack', unitMultiplierToBase: 6,
      stockGroup: { id: 'group', displayName: 'Coffee', baseUnit: 'pcs', baseStock: 120 },
    }} onAddToCart={vi.fn()} />);

    expect(html).not.toContain('aria-label="Konversi satuan"');
  });

  it.each([[2.5, '2,5'], [1, '1']])('formats a valid conversion factor %s in Indonesian', (factor, label) => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct,
      stockGroup: { id: 'group', displayName: 'Coffee', baseUnit: 'pcs', baseStock: 25 },
      variants: mockProduct.variants?.map(v => ({ ...v, unitMultiplierToBase: Number(factor) })),
    }} onAddToCart={vi.fn()} />);

    expect(html.match(/aria-label="Konversi satuan"[^>]*>([^<]*)<\/p>/)?.[1]).toBe(`1 dus = ${label} pcs`);
  });

  it('hides conversion when selected and base units are the same', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct,
      stockGroup: { id: 'group', displayName: 'Coffee', baseUnit: 'dus', baseStock: 10 },
      variants: mockProduct.variants?.map(v => ({ ...v, unitMultiplierToBase: 1 })),
    }} onAddToCart={vi.fn()} />);
    expect(html).not.toContain('aria-label="Konversi satuan"');
  });

  it('uses product conversion metadata when there are no catalog variants', () => {
    const html = renderToStaticMarkup(<ProductCard product={{ ...mockProduct,
      variants: undefined, stock: 32.5, defaultVariant: undefined, unitMultiplierToBase: 12,
      stockGroup: { id: 'group', displayName: 'Coffee', baseUnit: 'pcs', baseStock: 390 },
    }} onAddToCart={vi.fn()} />);
    expect(html.match(/aria-label="Satuan terpilih"[^>]*>([^<]*)<\/span>/)?.[1]).toBe('32 dus 6 pcs');
    expect(html.match(/aria-label="Konversi satuan"[^>]*>([^<]*)<\/p>/)?.[1]).toBe('1 dus = 12 pcs');
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
      variants: undefined,
      defaultVariant: undefined,
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

  it('shows the selected selling price for both member defaults without a special badge', () => {
    const mockProductWithoutPrices = {
      ...mockProduct,
      hargaAgen: 0,
      hargaDinas: null,
    } as any;

    const onAddToCart = vi.fn();
    const html = renderToStaticMarkup(
      <ProductCard product={mockProductWithoutPrices} onAddToCart={onAddToCart} />
    );

    for (const label of ['Agen', 'Dinas']) {
      const row = html.match(new RegExp(`<p\\b[^>]*><span\\b[^>]*>${label}:<\\/span>.*?<\\/p>`))?.[0];
      expect(row).toContain('50.000');
      expect(row).toContain('Mengikuti harga jual');
      expect(row).not.toContain('aria-label="Harga Khusus"');
    }
    expect(html).not.toContain('Belum ada harga');
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
    const defaultLabel = label === 'Agen' ? 'Dinas' : 'Agen';
    const defaultRow = html.match(new RegExp(`<p\\b[^>]*><span\\b[^>]*>${defaultLabel}:<\\/span>.*?<\\/p>`))?.[0];
    expect(defaultRow).toContain('50.000');
    expect(defaultRow).toContain('Mengikuti harga jual');
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
