import { NextRequest, NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

// GET /api/inventory/logs - Fetch inventory logs with filters
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermission("inventory", "read");
    const storeId = user.storeId || "store-main";

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("productId");
    const type = searchParams.get("type"); // IN | OUT | ADJUSTMENT
    const page = Math.max(1, Number(searchParams.get("page") || "1"));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || "50")));
    const days = Number(searchParams.get("days") || "60"); // Default 60-day window

    const since = new Date();
    since.setDate(since.getDate() - days);

    const where: any = {
      product: { storeId },
      createdAt: { gte: since },
    };

    if (productId) where.productId = productId;
    if (type && ["IN", "OUT", "ADJUSTMENT"].includes(type)) where.type = type;

    const [logs, total] = await Promise.all([
      db.inventoryLog.findMany({
        where,
        include: {
          product: {
            select: { id: true, name: true, sku: true, unit: true, stock: true, imageUrl: true, category: { select: { icon: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.inventoryLog.count({ where }),
    ]);

    return NextResponse.json({
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Failed to fetch inventory logs:", error);
    return NextResponse.json(
      { message: "Failed to fetch inventory logs" },
      { status: 500 }
    );
  }
}
