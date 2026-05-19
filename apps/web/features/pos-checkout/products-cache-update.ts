type ProductLike = { id: string; stock: number };

type PaginatedProducts<T extends ProductLike = ProductLike> = {
  data: T[];
  [key: string]: unknown;
};

function decrementList<T extends ProductLike>(
  list: T[],
  itemsByProductId: Map<string, number>,
): T[] {
  let changed = false;
  const next = list.map((product) => {
    const qty = itemsByProductId.get(product.id);
    if (qty == null) return product;
    changed = true;
    return { ...product, stock: Math.max(0, product.stock - qty) };
  });
  return changed ? next : list;
}

function isProductLikeArray(value: unknown): value is ProductLike[] {
  return (
    Array.isArray(value) &&
    (value.length === 0 ||
      (typeof value[0] === "object" &&
        value[0] !== null &&
        "id" in (value[0] as object) &&
        "stock" in (value[0] as object)))
  );
}

function isPaginatedProducts(value: unknown): value is PaginatedProducts {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    isProductLikeArray((value as { data: unknown }).data)
  );
}

export function decrementProductStockInCache<T>(
  cache: T,
  itemsByProductId: Map<string, number>,
): T {
  if (cache == null) return cache;

  if (isProductLikeArray(cache)) {
    return decrementList(cache, itemsByProductId) as T;
  }

  if (isPaginatedProducts(cache)) {
    const nextData = decrementList(cache.data, itemsByProductId);
    if (nextData === cache.data) return cache;
    return { ...cache, data: nextData } as T;
  }

  return cache;
}
