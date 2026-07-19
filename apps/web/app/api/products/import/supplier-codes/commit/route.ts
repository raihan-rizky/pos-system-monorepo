import { NextResponse } from "next/server";
import { db } from "@pos/db";

import { commitSupplierCodeImport } from "@/features/supplier-code-import/services/supplier-code-import-service";
import type { SupplierCodeImportCommitRow } from "@/features/supplier-code-import/types";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

function isCommitRow(value: unknown): value is SupplierCodeImportCommitRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<SupplierCodeImportCommitRow>;
  return (
    typeof row.rowNumber === "number" &&
    typeof row.sku === "string" &&
    typeof row.productId === "string" &&
    Array.isArray(row.supplierCodes) &&
    row.supplierCodes.every((code) => typeof code === "string") &&
    Array.isArray(row.supplierIds) &&
    row.supplierIds.every((id) => typeof id === "string")
  );
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("product", "update");
    const payload = (await request.json()) as { rows?: unknown };
    if (!Array.isArray(payload.rows) || !payload.rows.every(isCommitRow)) {
      return NextResponse.json({ message: "Data impor tidak valid." }, { status: 422 });
    }
    const rows = payload.rows;
    const productIds = Array.from(new Set(rows.map((row) => row.productId)));
    const supplierIds = Array.from(new Set(rows.flatMap((row) => row.supplierIds)));
    const [products, suppliers] = await Promise.all([
      db.product.findMany({
        where: { id: { in: productIds }, storeId: user.storeId || "store-main" },
        select: { id: true, sku: true },
      }),
      db.supplier.findMany({
        where: { id: { in: supplierIds }, isActive: true },
        select: { id: true, code: true },
      }),
    ]);
    const productMap = new Map(products.map((product) => [product.id, product.sku.toUpperCase()]));
    const supplierMap = new Map(
      suppliers.map((supplier) => [supplier.id, supplier.code?.toUpperCase() ?? ""]),
    );
    const referencesValid = rows.every(
      (row) =>
        productMap.get(row.productId) === row.sku.toUpperCase() &&
        row.supplierIds.every(
          (supplierId, index) => supplierMap.get(supplierId) === row.supplierCodes[index]?.toUpperCase(),
        ),
    );
    if (!referencesValid) {
      return NextResponse.json(
        { message: "Data produk atau supplier sudah berubah. Buat pratinjau ulang." },
        { status: 422 },
      );
    }

    const result = await commitSupplierCodeImport(
      {
        replaceAssignments: (assignments) =>
          db.$transaction(async (tx) => {
            for (const assignment of assignments) {
              await tx.productSupplier.deleteMany({ where: { productId: assignment.productId } });
              await tx.productSupplier.createMany({
                data: assignment.supplierIds.map((supplierId) => ({
                  productId: assignment.productId,
                  supplierId,
                })),
                skipDuplicates: true,
              });
            }
          }),
      },
      rows,
    );
    return NextResponse.json(result);
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Impor kode supplier gagal." },
      { status: 422 },
    );
  }
}
