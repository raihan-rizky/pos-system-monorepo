import { NextResponse } from "next/server";
import { db } from "@pos/db";

import {
  buildSupplierCodeImportRecords,
  normalizeSupplierCodeImportRows,
} from "@/features/supplier-code-import/helpers/import-core";
import { IMPORT_FILE_TOO_LARGE_MESSAGE, isImportFileTooLarge } from "@/lib/import-file-size";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { parseSpreadsheetMatrix } from "@/lib/server/spreadsheet-parser";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requirePermission("product", "update");
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "Berkas wajib dipilih." }, { status: 422 });
    }
    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx")) {
      return NextResponse.json(
        { message: "Gunakan berkas berformat CSV atau XLSX." },
        { status: 415 },
      );
    }
    if (isImportFileTooLarge(file)) {
      return NextResponse.json({ message: IMPORT_FILE_TOO_LARGE_MESSAGE }, { status: 413 });
    }

    const matrix = await parseSpreadsheetMatrix(await file.arrayBuffer());
    const { headers, records } = buildSupplierCodeImportRecords(matrix);
    if (!headers.includes("sku") || !headers.includes("supplierCode")) {
      return NextResponse.json(
        { message: "Kolom SKU dan Kode Supplier wajib tersedia." },
        { status: 422 },
      );
    }

    const skus = Array.from(
      new Set(records.map((record) => String(record.sku ?? "").trim().toUpperCase()).filter(Boolean)),
    );
    const supplierCodes = Array.from(
      new Set(
        records.flatMap((record) =>
          String(record.supplierCode ?? "")
            .split(/[,;\n]/)
            .map((code) => code.trim().toUpperCase())
            .filter(Boolean),
        ),
      ),
    );
    const [products, suppliers] = await Promise.all([
      db.product.findMany({
        where: {
          storeId: user.storeId || "store-main",
          sku: { in: skus, mode: "insensitive" },
        },
        select: { id: true, sku: true, name: true },
      }),
      db.supplier.findMany({
        where: { code: { in: supplierCodes, mode: "insensitive" }, isActive: true },
        select: { id: true, code: true, name: true },
      }),
    ]);

    return NextResponse.json(
      normalizeSupplierCodeImportRows(
        records,
        new Map(products.map((product) => [product.sku.toUpperCase(), product])),
        new Map(
          suppliers
            .filter((supplier): supplier is typeof supplier & { code: string } => Boolean(supplier.code))
            .map((supplier) => [supplier.code.toUpperCase(), supplier]),
        ),
      ),
    );
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    return NextResponse.json(
      { message: "Pratinjau impor kode supplier gagal dibuat." },
      { status: 500 },
    );
  }
}
