import type { CartUnitOption } from '@/hooks/useCart';
import type { Product, ProductVariant } from '@/hooks/useProducts';

function mapStockGroupUnitOptions(
  product: Product,
  selectedVariant?: ProductVariant,
): CartUnitOption[] | undefined {
  const groupId =
    selectedVariant?.stockGroup?.id ??
    product.stockGroupId ??
    product.stockGroup?.id;
  if (!groupId) return undefined;

  const variants = (product.variants ?? []).filter(
    (variant) => variant.stockGroup?.id === groupId,
  );
  if (variants.length < 2) return undefined;

  return variants.map((variant) => ({
    productId: variant.id,
    name: product.name,
    price: Number(variant.price),
    catalogPrice: Number(variant.price),
    costPrice: variant.costPrice,
    baseCostPrice: variant.baseCostPrice,
    baseCostUnit: variant.baseCostUnit,
    hargaAgen: variant.hargaAgen,
    hargaDinas: variant.hargaDinas,
    unit: variant.unit,
    stock: variant.stock,
    unitMultiplierToBase: variant.unitMultiplierToBase ?? null,
    stockGroup: variant.stockGroup
      ? {
          id: variant.stockGroup.id,
          baseUnit: variant.stockGroup.baseUnit,
        }
      : null,
    brandId: variant.brandId ?? null,
    brandName: variant.brand?.name ?? null,
    categoryId: product.category.id,
    categoryName: product.category.name,
    size: variant.size ?? undefined,
    material: variant.material ?? undefined,
  }));
}

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
    const unitOptions = mapStockGroupUnitOptions(product, variant);
    return {
      id: variant.id,
      name: product.name,
      price: Number(variant.price),
      costPrice: variant.costPrice,
      baseCostPrice: variant.baseCostPrice,
      baseCostUnit: variant.baseCostUnit,
      hargaDinas: variant.hargaDinas,
      hargaAgen: variant.hargaAgen,
      brandId: variant.brandId ?? null,
      brandName: variant.brand?.name ?? null,
      unit: variant.unit,
      stock: variant.stock,
      unitMultiplierToBase: variant.unitMultiplierToBase ?? null,
      stockGroup: variant.stockGroup ?? product.stockGroup ?? null,
      categoryId: product.category.id,
      categoryName: product.category.name,
      size: variant.size ?? undefined,
      material: variant.material ?? undefined,
      ...(unitOptions ? { unitOptions } : {}),
    };
  }

  const unitOptions = mapStockGroupUnitOptions(product);
  return {
    id: product.id,
    name: product.name,
    price: Number(product.price),
    costPrice: product.costPrice,
    baseCostPrice: product.baseCostPrice,
    baseCostUnit: product.baseCostUnit,
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
    ...(unitOptions ? { unitOptions } : {}),
  };
}
