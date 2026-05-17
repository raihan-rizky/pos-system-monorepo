import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { REQUIRED_IMPORT_COLUMNS } from "@/features/product-import/types";
import type { ColumnMapping } from "@/features/product-import/types";
import {
  buildMissingColumnResponse,
  normalizeImportRows,
  parseImportFile,
} from "@/features/product-import/helpers/import-core";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requirePermission("product", "create");
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "File is required" }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".csv") && !fileName.endsWith(".xlsx")) {
      return NextResponse.json({ message: "Only .csv and .xlsx files are supported" }, { status: 400 });
    }

    // Optional column mapping from the client
    const mappingRaw = formData.get("columnMapping");
    const columnMapping: ColumnMapping | undefined = mappingRaw
      ? JSON.parse(String(mappingRaw))
      : undefined;

    const { headers, records } = parseImportFile(await file.arrayBuffer(), columnMapping);
    const { missingColumns, unknownColumns, suggestions } = buildMissingColumnResponse(headers);

    if (missingColumns.length > 0) {
      return NextResponse.json(
        {
          code: "MISSING_REQUIRED_COLUMNS",
          message: "Import file is missing required columns.",
          missingColumns,
          requiredColumns: REQUIRED_IMPORT_COLUMNS,
          unknownColumns,
          suggestions,
        },
        { status: 400 },
      );
    }

    const storeId = user.storeId || "store-main";
    const skus = records.map((row) => String(row.sku ?? "").trim()).filter(Boolean);
    const [products, categories] = await Promise.all([
      db.product.findMany({
        where: { storeId, sku: { in: skus } },
        select: { id: true, sku: true, name: true },
      }),
      db.category.findMany({ select: { name: true } }),
    ]);

    const result = normalizeImportRows(
      records,
      new Map(products.map((product) => [product.sku, { id: product.id, name: product.name }])),
      new Set(categories.map((category) => category.name.toLowerCase())),
    );

    return NextResponse.json({
      ...result,
      missingColumns,
      unknownColumns,
      requiredColumns: REQUIRED_IMPORT_COLUMNS,
      suggestions,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Failed to preview product import:", error);
    return NextResponse.json({ message: "Failed to preview product import" }, { status: 500 });
  }
}
