import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

const bulkDeleteSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1, "At least one product must be selected"),
});

export async function POST(request: Request) {
  try {
    const user = await requirePermission("product", "delete");
    const body = await request.json();
    
    const validatedData = bulkDeleteSchema.parse(body);
    const storeId = user.storeId || "store-main";

    const products = await db.product.findMany({
      where: {
        id: { in: validatedData.productIds },
        storeId,
      },
    });

    if (products.length !== validatedData.productIds.length) {
      return NextResponse.json(
        { message: "Some products not found or do not belong to your store" },
        { status: 400 }
      );
    }

    await db.product.deleteMany({
      where: {
        id: { in: validatedData.productIds },
        storeId,
      },
    });

    return NextResponse.json(
      { message: `Successfully deleted ${validatedData.productIds.length} product(s)` },
      { status: 200 }
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Failed to delete products:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { message: "Failed to delete products" },
      { status: 500 }
    );
  }
}
