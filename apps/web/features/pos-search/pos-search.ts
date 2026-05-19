export type ProductSearchable = {
  name?: string | null;
  sku?: string | null;
  barcode?: string | null;
};

const MAX_TOKENS = 8;

/**
 * Parses a free-form POS search box value into a list of normalized
 * tokens that callers can AND together. Quoted phrases are kept as a
 * single token so cashiers can search for things like `"coca cola"`.
 */
export function parseSearchQuery(input?: string | null): string[] {
  if (!input) return [];
  const trimmed = input.trim();
  if (!trimmed) return [];

  const tokens: string[] = [];
  const re = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(trimmed)) !== null) {
    const raw = (match[1] ?? match[2] ?? "").trim();
    if (!raw) continue;
    tokens.push(raw.toLowerCase());
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
    if (unique.length >= MAX_TOKENS) break;
  }
  return unique;
}

/**
 * Returns true when every token appears in at least one of the
 * searchable fields. Used by the offline cache fallback so the local
 * filter mirrors the server's AND-of-OR behaviour.
 */
export function matchesSearchTokens(
  product: ProductSearchable,
  tokens: string[],
): boolean {
  if (tokens.length === 0) return true;
  const haystack = [product.name, product.sku, product.barcode]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map((v) => v.toLowerCase());
  if (haystack.length === 0) return false;
  return tokens.every((token) => {
    const needle = token.toLowerCase();
    return haystack.some((field) => field.includes(needle));
  });
}

type ContainsFilter = { contains: string; mode: "insensitive" };
type ProductWhereGroup = {
  OR: Array<
    | { name: ContainsFilter }
    | { sku: ContainsFilter }
    | { barcode: ContainsFilter }
  >;
};

export type ProductSearchWhere = {
  AND: ProductWhereGroup[];
};

/**
 * Builds a Prisma `where` fragment that requires every token to hit
 * at least one of name/sku/barcode. Returns `undefined` for an empty
 * token list so callers can drop the filter entirely.
 */
export function buildProductSearchOR(
  tokens: string[],
): ProductSearchWhere | undefined {
  if (tokens.length === 0) return undefined;
  return {
    AND: tokens.map((token) => ({
      OR: [
        { name: { contains: token, mode: "insensitive" } },
        { sku: { contains: token, mode: "insensitive" } },
        { barcode: { contains: token, mode: "insensitive" } },
      ],
    })),
  };
}
