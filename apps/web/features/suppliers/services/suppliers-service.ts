import { db } from "@pos/db";

import {
  createSupplier,
  countSuppliers,
  countSupplierRestockLogs,
  findActiveSupplierById,
  findSupplierById,
  findSupplierRestockLogs,
  findSuppliersByName,
  listSuppliers,
  setSupplierActive,
  updateSupplier,
  type SupplierListFilters,
} from "@/features/suppliers/repositories/suppliers-repository";
import {
  findDuplicateSupplierNameWarnings,
} from "@/features/suppliers/helpers/supplier-warnings";
import {
  buildSupplierSummary,
  type SupplierSummary,
} from "@/features/suppliers/helpers/supplier-summary";
import type {
  SupplierInput,
  SupplierListItem,
  SupplierWarning,
} from "@/features/suppliers/types/supplier";

export async function listSuppliersPage(
  filters: SupplierListFilters,
): Promise<{ total: number; suppliers: SupplierListItem[] }> {
  const [total, suppliers] = await Promise.all([
    countSuppliers(filters),
    listSuppliers(filters),
  ]);
  return { total, suppliers };
}

export async function createSupplierWithWarnings(
  input: SupplierInput,
): Promise<{ supplier: SupplierListItem; warnings: SupplierWarning[] }> {
  const existing = await findSuppliersByName(input.name);
  const warnings = findDuplicateSupplierNameWarnings(
    { name: input.name },
    existing,
  );
  const supplier = await createSupplier(input);
  return { supplier, warnings };
}

export async function updateSupplierWithWarnings(
  id: string,
  input: SupplierInput,
): Promise<{ supplier: SupplierListItem; warnings: SupplierWarning[] }> {
  const existing = await findSuppliersByName(input.name);
  const warnings = findDuplicateSupplierNameWarnings(
    { id, name: input.name },
    existing,
  );
  const supplier = await updateSupplier(id, input);
  return { supplier, warnings };
}

export async function getSupplierOrThrow(id: string): Promise<SupplierListItem> {
  const supplier = await findSupplierById(id);
  if (!supplier) throw new SupplierNotFoundError();
  return supplier;
}

export function deactivateSupplier(id: string): Promise<SupplierListItem> {
  return setSupplierActive(id, false);
}

export function reactivateSupplier(id: string): Promise<SupplierListItem> {
  return setSupplierActive(id, true);
}

export async function getSupplierSummary(filters: {
  from?: Date;
  to?: Date;
  supplierId?: string;
}): Promise<SupplierSummary> {
  const logs = await findSupplierRestockLogs(filters);
  return buildSupplierSummary(logs);
}

export async function getSupplierStockInRecap(filters: {
  from?: Date;
  to?: Date;
  supplierId?: string;
  productId?: string;
  categoryId?: string;
  skip: number;
  take: number;
}): Promise<{ total: number; logs: Awaited<ReturnType<typeof findSupplierRestockLogs>> }> {
  const [total, logs] = await Promise.all([
    countSupplierRestockLogs(filters),
    findSupplierRestockLogs(filters),
  ]);
  return { total, logs };
}

export async function validateRestockSupplier(
  supplierId: string | undefined,
): Promise<{ id: string; name: string }> {
  if (!supplierId) {
    throw new SupplierValidationError(
      "Supplier is required for restock stock-in",
    );
  }

  const supplier = await findActiveSupplierById(supplierId);
  if (!supplier) {
    throw new SupplierValidationError("Supplier was not found");
  }
  if (!supplier.isActive) {
    throw new SupplierValidationError("Supplier must be active");
  }

  return { id: supplier.id, name: supplier.name };
}

export class SupplierValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupplierValidationError";
  }
}

export class SupplierNotFoundError extends Error {
  constructor() {
    super("Supplier not found");
    this.name = "SupplierNotFoundError";
  }
}
