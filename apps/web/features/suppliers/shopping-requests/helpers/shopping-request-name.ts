export function resolveShoppingRequestName(
  input: string | null | undefined,
  number: string,
): { name: string; normalizedName: string } {
  const name = input?.trim() || number;
  return { name, normalizedName: name.toLowerCase() };
}

export function isShoppingRequestNameUniqueConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;

  const candidate = error as {
    code?: unknown;
    meta?: { target?: unknown };
  };
  if (candidate.code !== "P2002") return false;

  const target = candidate.meta?.target;
  return Array.isArray(target)
    ? target.includes("normalizedName")
    : typeof target === "string" && target.includes("normalizedName");
}
