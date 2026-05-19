import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { stockDelta } from "@/features/batch-operations/helpers/snapshots";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:inventory:bulk:preview");
const bulkPreviewSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(500),
  type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
  quantities: z.record(z.string(), z.coerce.number().int().min(0)),
  note: z.string().trim().min(1, "Note is required"),
});

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    const input = bulkPreviewSchema.parse(await request.json());
    const storeId = user.storeId || "store-main";

    const products = await db.product.findMany({
      where: { id: { in: input.productIds }, storeId, isActive: true },
      include: { category: { select: { id: true, name: true, icon: true, color: true } } },
    });

    const rows = products.map((product) => {
      const quantity = input.quantities[product.id] ?? 0;
      const delta = stockDelta(input.type, product.stock, quantity);
      const afterStock = product.stock + delta;
      return {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        unit: product.unit,
        beforeStock: product.stock,
        quantity,
        afterStock,
        errors: afterStock < 0 ? ["Stock cannot be negative."] : quantity === 0 ? ["Quantity is required."] : [],
        warnings: product.stock <= product.minStock ? ["Product is already low stock."] : [],
      };
    });

    const foundIds = new Set(products.map((product) => product.id));
    const missingProductIds = input.productIds.filter((id) => !foundIds.has(id));
    const errors = rows.flatMap((row) => row.errors.map((error) => `${row.sku}: ${error}`));
    if (missingProductIds.length > 0) errors.push("Some selected products were not found.");

    return NextResponse.json({
      rows,
      errors,
      warnings: rows.flatMap((row) => row.warnings.map((warning) => `${row.sku}: ${warning}`)),
      missingProductIds,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Validation error", errors: error.flatten().fieldErrors }, { status: 422 });
    }
    log.error("Failed to preview bulk stock update:", error);
    return NextResponse.json({ message: "Failed to preview bulk stock update" }, { status: 500 });
  }
}
