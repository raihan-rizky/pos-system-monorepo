import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

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
    const limit = Math.max(1, Math.min(200, parseInt(searchParams.get("limit") || "100", 10)));
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));

    const whereClause: Prisma.ProductWhereInput = {
      storeId,
      isActive: true,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { sku: { contains: search, mode: "insensitive" } },
          { barcode: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...(categoryId && { categoryId }),
    };

    const products = await db.product.findMany({
      where: whereClause,
      include: {
        category: {
          select: { id: true, name: true, icon: true, color: true },
        },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    });

    const total = await db.product.count({
      where: whereClause,
    });

    const totalPages = Math.ceil(total / limit);

    const res = NextResponse.json({
      data: products,
      pagination: { total, page, limit, totalPages },
    });
    res.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30");
    return res;
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Failed to fetch products:", error);
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
        { status: 400 }
      );
    }

    const product = await db.product.create({
      data: {
        ...validatedData,
        storeId: user.storeId || "store-main",
      },
      include: {
        category: {
          select: { id: true, name: true, icon: true, color: true },
        },
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Failed to create product:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { message: "Failed to create product" },
      { status: 500 }
    );
  }
}



