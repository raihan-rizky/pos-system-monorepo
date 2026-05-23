import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import {
  parseSearchQuery,
  buildProductSearchOR,
} from "@/features/pos-search/pos-search";
import { buildProductStockFilter } from "@/features/pos-search/pos-stock-filter";
import { apiList, buildPaginationMeta, parsePagination } from "@/lib/api/responses";
import { buildProductPriceLogEntries } from "@/lib/product-price-logs/price-log-entries";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:products");
const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  sku: z.string().min(1, "SKU is required"),
  barcode: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "Price must be >= 0"),
  costPrice: z.coerce.number().optional().nullable(),
  stock: z.coerce.number().default(0),
  minStock: z.coerce.number().default(5),
  unit: z.string().default("pcs"),
  size: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  categoryId: z.string().min(1, "Category is required"),
  imageUrl: z.string().optional().nullable(),
});

export const dynamic = 'force-dynamic';

// GET /api/products?search=xxx&categoryId=xxx&limit=100
export async function GET(request: Request) {
  try {
    const user = await requirePermission("product", "read");
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId") || "";
    const storeId = user.storeId || "store-main";
    // Cap at 200 to prevent unbounded result sets on Vercel
    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 100,
      maxLimit: 200,
    });
    const inStockOnly = searchParams.get("inStockOnly") === "true";

    const tokens = parseSearchQuery(search);
    const searchWhere = buildProductSearchOR(tokens);
    const stockFilter = buildProductStockFilter(inStockOnly);

    const whereClause: Prisma.ProductWhereInput = {
      storeId,
      isActive: true,
      ...(searchWhere ?? {}),
      ...(categoryId && { categoryId }),
      ...(stockFilter ?? {}),
    };

    const [products, total] = await Promise.all([
      db.product.findMany({
        where: whereClause,
        include: {
          category: {
            select: { id: true, name: true, icon: true, color: true },
          },
        },
        orderBy: { name: "asc" },
        skip,
        take: limit,
      }),
      db.product.count({
        where: whereClause,
      }),
    ]);

    const res = apiList(products, buildPaginationMeta(total, page, limit));
    res.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30");
    return res;
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to fetch products:", error);
    return NextResponse.json(
      { message: "Failed to fetch products" },
      { status: 500 }
    );
  }
}


// POST /api/products - Create a new product
export async function POST(request: Request) {
  try {
    const user = await requirePermission("product", "create");
    const body = await request.json();
    
    // Validate request body
    const validatedData = productSchema.parse(body);

    // Check for duplicate SKU
    const existingProduct = await db.product.findUnique({
      where: { sku: validatedData.sku },
    });

    if (existingProduct) {
      return NextResponse.json(
        { message: "SKU already exists. Please use a unique SKU." },
        { status: 409 }
      );
    }

    const storeId = user.storeId || "store-main";
    const product = await db.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          ...validatedData,
          storeId,
        },
        include: {
          category: {
            select: { id: true, name: true, icon: true, color: true },
          },
        },
      });

      const priceLogEntries = buildProductPriceLogEntries({
        productId: created.id,
        storeId,
        before: null,
        after: {
          price: created.price,
          costPrice: created.costPrice,
        },
        actor: user,
        source: "MANUAL",
      });

      if (priceLogEntries.length > 0) {
        await tx.productPriceLog.createMany({ data: priceLogEntries });
      }

      return created;
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to create product:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.flatten().fieldErrors },
        { status: 422 }
      );
    }
    return NextResponse.json(
      { message: "Failed to create product" },
      { status: 500 }
    );
  }
}

// DELETE /api/products?ids=a,b,c — bulk delete by ID
export async function DELETE(request: Request) {
  try {
    const user = await requirePermission("product", "delete");
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids") || "";
    const productIds = idsParam.split(",").map((s) => s.trim()).filter(Boolean);

    if (productIds.length === 0) {
      return NextResponse.json(
        { message: "Validation error", errors: { ids: ["At least one product id is required"] } },
        { status: 422 }
      );
    }

    const storeId = user.storeId || "store-main";

    const products = await db.product.findMany({
      where: { id: { in: productIds }, storeId },
      select: { id: true },
    });

    if (products.length !== productIds.length) {
      return NextResponse.json(
        { message: "Some products not found or do not belong to your store" },
        { status: 404 }
      );
    }

    await db.product.deleteMany({
      where: { id: { in: productIds }, storeId },
    });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("Failed to bulk-delete products:", error);
    return NextResponse.json(
      { message: "Failed to delete products" },
      { status: 500 }
    );
  }
}



