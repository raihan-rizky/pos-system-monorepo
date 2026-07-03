import type { Product, ProductVariant } from '@/hooks/useProducts';

export interface GroupedProduct extends Product {
  defaultVariant: {
    id: string;
    unit: string;
    price: number;
    stock: number;
    sku: string;
  };
  variants: ProductVariant[];
}

/**
 * Selects the default variant from a list of products.
 * Prioritizes highest stock, then first by order.
 */
export function selectDefaultVariant(products: Product[]): Product {
  if (products.length === 0) {
    throw new Error('Cannot select default variant from empty list');
  }

  return products.reduce((prev, current) =>
    current.stock > prev.stock ? current : prev
  );
}

/**
 * Groups products by name and categoryId.
 * Case-insensitive name matching.
 * Returns merged products with variants array.
 */
export function groupProductsByNameAndCategory(
  products: Product[]
): GroupedProduct[] {
  const grouped = new Map<string, Product[]>();

  // Group by 'name:categoryId' (case-insensitive name)
  for (const product of products) {
    const key = product.name.toLowerCase() + ':' + product.category.id;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(product);
  }

  // Transform to merged products
  const merged: GroupedProduct[] = [];
  for (const variants of grouped.values()) {
    if (variants.length === 0) continue;

    const defaultVariant = selectDefaultVariant(variants);

    merged.push({
      ...variants[0], // Copy base product info from first variant
      id: defaultVariant.id, // Use default variant ID as group ID
      sku: defaultVariant.sku,
      price: defaultVariant.price,
      costPrice: defaultVariant.costPrice,
      hargaDinas: defaultVariant.hargaDinas,
      hargaAgen: defaultVariant.hargaAgen,
      brandId: defaultVariant.brandId,
      brand: defaultVariant.brand,
      stock: defaultVariant.stock,
      unit: defaultVariant.unit,
      size: defaultVariant.size,
      material: defaultVariant.material,
      defaultVariant: {
        id: defaultVariant.id,
        unit: defaultVariant.unit,
        price: defaultVariant.price,
        stock: defaultVariant.stock,
        sku: defaultVariant.sku,
      },
      variants: variants.map((v) => ({
        id: v.id,
        unit: v.unit,
        price: v.price,
        costPrice: v.costPrice,
        stock: v.stock,
        sku: v.sku,
        unitMultiplierToBase: v.unitMultiplierToBase,
        stockGroup: v.stockGroup,
        hargaDinas: v.hargaDinas,
        hargaAgen: v.hargaAgen,
        brandId: v.brandId,
        brand: v.brand,
        barcode: v.barcode,
        size: v.size,
        material: v.material,
      })),
    });
  }

  return merged;
}
