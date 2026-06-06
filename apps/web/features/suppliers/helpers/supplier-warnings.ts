import type { SupplierWarning } from "@/features/suppliers/types/supplier";

export type SupplierNameCandidate = {
  id?: string | null;
  name: string;
};

export function normalizeSupplierName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findDuplicateSupplierNameWarnings(
  candidate: SupplierNameCandidate,
  existingSuppliers: SupplierNameCandidate[],
): SupplierWarning[] {
  const normalizedCandidate = normalizeSupplierName(candidate.name);
  if (!normalizedCandidate) return [];

  const matchedSupplierIds = existingSuppliers
    .filter((supplier) => supplier.id !== candidate.id)
    .filter(
      (supplier) => normalizeSupplierName(supplier.name) === normalizedCandidate,
    )
    .map((supplier) => supplier.id)
    .filter((id): id is string => Boolean(id));

  if (matchedSupplierIds.length === 0) return [];

  return [
    {
      code: "DuplicateSupplierName",
      message: "Nama supplier mirip sudah ada.",
      matchedSupplierIds,
    },
  ];
}
