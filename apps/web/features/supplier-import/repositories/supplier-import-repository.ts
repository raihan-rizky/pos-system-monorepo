import { db, Prisma } from "@pos/db";

import type {
  ExistingSupplierMatch,
} from "@/features/supplier-import/types";
import type { SupplierInput } from "@/features/suppliers/types/supplier";

export type SupplierImportSupplierRow = ExistingSupplierMatch & {
  normalizedName: string;
};

type Tx = Prisma.TransactionClient;

export async function listSupplierImportCandidates(): Promise<
  SupplierImportSupplierRow[]
> {
  return listSupplierImportCandidatesWithClient(db);
}

export async function listSupplierImportCandidatesForTransaction(
  tx: Tx,
): Promise<SupplierImportSupplierRow[]> {
  return listSupplierImportCandidatesWithClient(tx);
}

async function listSupplierImportCandidatesWithClient(
  client: Pick<Tx, "supplier">,
): Promise<SupplierImportSupplierRow[]> {
  const suppliers = await client.supplier.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      phone: true,
      isActive: true,
    },
  });

  return suppliers.map((supplier) => ({
    supplierId: supplier.id,
    name: supplier.name,
    normalizedName: normalizeSupplierNameForRepository(supplier.name),
    type: supplier.type,
    phone: supplier.phone,
    isActive: supplier.isActive,
  }));
}

export async function createSupplierForImport(
  tx: Tx,
  input: SupplierInput,
): Promise<void> {
  await tx.supplier.create({
    data: {
      name: input.name,
      type: input.type,
      phone: input.phone || null,
      contactPerson: input.contactPerson || null,
      address: input.address || null,
      notes: input.notes || null,
    },
  });
}

export async function updateSupplierForImport(
  tx: Tx,
  id: string,
  input: SupplierInput,
): Promise<void> {
  await tx.supplier.update({
    where: { id },
    data: {
      name: input.name,
      type: input.type,
      phone: input.phone || null,
      contactPerson: input.contactPerson || null,
      address: input.address || null,
      notes: input.notes || null,
    },
  });
}

export function runSupplierImportTransaction<T>(
  action: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.$transaction(action, {
    maxWait: 15000,
    timeout: 180000,
  });
}

function normalizeSupplierNameForRepository(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}
