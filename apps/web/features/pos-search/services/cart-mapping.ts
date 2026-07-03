import type { Product } from '@/hooks/useProducts';

export function mapProductToCartItem(product: Product, variantId?: string) {
  let variant = variantId ? product.variants?.find((v) => v.id === variantId) : undefined;

  // Fall back to defaultVariant if not found or not specified
  if (!variant && product.defaultVariant?.id) {
    variant = product.variants?.find((v) => v.id === product.defaultVariant?.id);
  }

  // Fall back to the first variant if still not found but variants exist
  if (!variant && product.variants && product.variants.length > 0) {
    variant = product.variants[0];
  }

  if (variant) {
    return {
      id: variant.id,
      name: product.name,
      price: Number(variant.price),
      costPrice: variant.costPrice,
      hargaDinas: variant.hargaDinas,
      hargaAgen: variant.hargaAgen,
      brandId: variant.brandId ?? null,
      brandName: variant.brand?.name ?? null,
      unit: variant.unit,
      stock: variant.stock,
      unitMultiplierToBase: variant.unitMultiplierToBase ?? null,
      stockGroup: variant.stockGroup ?? null,
      categoryId: product.category.id,
      categoryName: product.category.name,
      size: variant.size ?? undefined,
      material: variant.material ?? undefined,
    };
  }

  return {
    id: product.id,
    name: product.name,
    price: Number(product.price),
    costPrice: product.costPrice,
    hargaDinas: product.hargaDinas,
    hargaAgen: product.hargaAgen,
    brandId: product.brandId ?? null,
    brandName: product.brand?.name ?? null,
    unit: product.unit,
    stock: product.stock,
    unitMultiplierToBase: product.unitMultiplierToBase ?? null,
    stockGroup: product.stockGroup ?? null,
    categoryId: product.category.id,
    categoryName: product.category.name,
    size: product.size ?? undefined,
    material: product.material ?? undefined,
  };
}
