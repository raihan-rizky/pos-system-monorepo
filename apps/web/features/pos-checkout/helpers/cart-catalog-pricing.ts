import type { CartItem } from "@/hooks/useCart";
import type { Product } from "@/hooks/useProducts";

export function refreshCartCatalogPrices(items: CartItem[], products: Product[]): CartItem[] {
  const byId = new Map(products.map(product => [product.id, product]));
  return items.map(item => {
    if (item.lineType !== "PRODUCT") return item;
    const unitOptions = item.unitOptions?.map(option => {
      const product = byId.get(option.productId);
      return product ? {
        ...option, price: Number(product.price), catalogPrice: Number(product.price),
        costPrice: product.costPrice == null ? null : Number(product.costPrice),
        baseCostPrice: product.baseCostPrice, baseCostUnit: product.baseCostUnit,
        hargaAgen: product.hargaAgen == null ? null : Number(product.hargaAgen),
        hargaDinas: product.hargaDinas == null ? null : Number(product.hargaDinas),
        brandId: product.brandId, brandName: product.brand?.name ?? null,
        categoryId: product.category.id, categoryName: product.category.name,
      } : option;
    });
    const product = byId.get(item.productId);
    if (!product) return unitOptions ? { ...item, unitOptions } : item;
    return {
      ...item,
      catalogPrice: Number(product.price),
      price: item.transactionPrice ?? Number(product.price),
      costPrice: product.costPrice == null ? null : Number(product.costPrice),
      baseCostPrice: product.baseCostPrice,
      baseCostUnit: product.baseCostUnit,
      hargaAgen: product.hargaAgen == null ? null : Number(product.hargaAgen),
      hargaDinas: product.hargaDinas == null ? null : Number(product.hargaDinas),
      categoryId: product.category.id,
      categoryName: product.category.name,
      brandId: product.brandId,
      brandName: product.brand?.name ?? null,
      unitOptions,
    };
  });
}
