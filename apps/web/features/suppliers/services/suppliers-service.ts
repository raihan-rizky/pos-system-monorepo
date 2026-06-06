import { db } from "@pos/db";

import {
  createSupplier,
  countSuppliers,
  findActiveSupplierById,
  findSupplierStockInBatchItems,
  findSupplierStockInDetailLogs,
  findSupplierStockInRecapLogs,
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
import {
  buildSupplierStockInRecapBundles,
  type SupplierStockInRecapBundle,
} from "@/features/suppliers/helpers/supplier-stock-in-recap";
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
}): Promise<{ total: number; bundles: SupplierStockInRecapBundle[] }> {
  const logs = await findSupplierStockInRecapLogs(filters);
  const batchItems = await findSupplierStockInBatchItems(
    logs.map((entry) => entry.id),
  );
  const allBundles = buildSupplierStockInRecapBundles(logs, batchItems);

  return {
    total: allBundles.length,
    bundles: allBundles.slice(filters.skip, filters.skip + filters.take),
  };
}

export async function getSupplierDetail(filters: {
  supplierId: string;
  limit: number;
  cursor?: string;
}): Promise<{
  supplier: SupplierListItem;
  history: {
    items: SupplierStockInRecapBundle[];
    pageInfo: { nextCursor: string | null; hasNextPage: boolean };
  };
}> {
  const offset = decodeSupplierDetailCursor(filters.cursor);
  if (offset === null) {
    throw new SupplierValidationError("Invalid supplier detail cursor");
  }

  const supplier = await getSupplierOrThrow(filters.supplierId);
  const logs = await findSupplierStockInDetailLogs({
    supplierId: filters.supplierId,
  });
  const batchItems = await findSupplierStockInBatchItems(
    logs.map((entry) => entry.id),
  );
  const bundles = buildSupplierStockInRecapBundles(logs, batchItems);
  const items = bundles.slice(offset, offset + filters.limit);
  const nextOffset = offset + items.length;
  const hasNextPage = nextOffset < bundles.length;

  return {
    supplier,
    history: {
      items,
      pageInfo: {
        nextCursor: hasNextPage
          ? encodeSupplierDetailCursor(nextOffset)
          : null,
        hasNextPage,
      },
    },
  };
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

function encodeSupplierDetailCursor(offset: number): string {
  return `offset:${offset}`;
}

function decodeSupplierDetailCursor(cursor: string | undefined): number | null {
  if (!cursor) return 0;
  const match = /^offset:(\d+)$/.exec(cursor);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}
