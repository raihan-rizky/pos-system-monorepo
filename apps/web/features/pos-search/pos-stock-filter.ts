export const STOCK_ONLY_STORAGE_KEY = "pos:hide-out-of-stock";

export type ProductStockOnly = { stock?: number | null };
export type ProductStockStatusFilter = "all" | "out" | "negative";

/**
 * Returns a Prisma `where` fragment that drops products with stock <= 0,
 * or `undefined` when the filter is disabled so callers can spread it in
 * conditionally.
 */
export function buildProductStockFilter(
  inStockOnly: boolean,
): { stock: { gt: 0 } } | undefined {
  return inStockOnly ? { stock: { gt: 0 } } : undefined;
}

export function buildProductStockStatusFilter(
  status?: ProductStockStatusFilter | null,
): { stock: { equals: 0 } } | { stock: { lt: 0 } } | undefined {
  if (status === "out") return { stock: { equals: 0 } };
  if (status === "negative") return { stock: { lt: 0 } };
  return undefined;
}

/**
 * Mirrors `buildProductStockFilter` for client-side / offline lists.
 * Treats missing or non-finite stock values as out-of-stock.
 */
export function matchesStockFilter(
  product: ProductStockOnly,
  inStockOnly: boolean,
): boolean {
  if (!inStockOnly) return true;
  const stock = product.stock;
  return typeof stock === "number" && Number.isFinite(stock) && stock > 0;
}

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Reads the saved "hide out of stock" preference. Defaults to false. */
export function loadStockOnlyPreference(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  try {
    return storage.getItem(STOCK_ONLY_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persists the toggle. Removes the key on `false` to keep storage tidy. */
export function saveStockOnlyPreference(value: boolean): void {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (value) {
      storage.setItem(STOCK_ONLY_STORAGE_KEY, "1");
    } else {
      storage.removeItem(STOCK_ONLY_STORAGE_KEY);
    }
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}
