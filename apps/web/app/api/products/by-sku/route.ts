import { NextRequest, NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

// POST /api/products/by-sku
// Body: { skus: string[] }
// Returns: { results: { sku: string; id: string }[] }
export async function POST(req: NextRequest) {
  try {
    const user = await requirePermission("product", "update");
    const storeId = user.storeId || "store-main";
    const { skus } = await req.json();

    if (!Array.isArray(skus) || skus.length === 0) {
      return NextResponse.json({ message: "skus must be a non-empty array" }, { status: 422 });
    }

    const products = await db.product.findMany({
      where: { storeId, sku: { in: skus }, isActive: true },
      select: { id: true, sku: true },
    });

    return NextResponse.json({ results: products });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    return NextResponse.json({ message: "Internal Server Error" }, { status: 500 });
  }
}
