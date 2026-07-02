export function normalizeSupplierCode(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim().toUpperCase();
  return normalized ? normalized : null;
}

export function isSupplierCodeUniqueError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; meta?: { target?: unknown } };
  if (candidate.code !== "P2002") return false;

  const target = candidate.meta?.target;
  if (Array.isArray(target)) {
    return target.some(
      (field) => typeof field === "string" && field.toLowerCase() === "code",
    );
  }

  return typeof target === "string" && target.toLowerCase().includes("code");
}
