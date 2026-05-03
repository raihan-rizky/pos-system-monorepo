import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";

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
  storeId: z.string().default("store-main"),
  imageUrl: z.string().optional().nullable(),
});

export const dynamic = 'force-dynamic';

// GET /api/products?search=xxx&categoryId=xxx
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const categoryId = searchParams.get("categoryId") || "";

    const products = await db.product.findMany({
      where: {
        isActive: true,
        ...(search && {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { sku: { contains: search, mode: "insensitive" } },
            { barcode: { contains: search, mode: "insensitive" } },
          ],
        }),
        ...(categoryId && { categoryId }),
      },
      include: {
        category: {
          select: { id: true, name: true, icon: true, color: true },
        },
      },
      orderBy: { name: "asc" },
    });

    const res = NextResponse.json(products);
    res.headers.set("Cache-Control", "private, max-age=10, stale-while-revalidate=30");
    return res;
  } catch (error) {
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
      data: validatedData,
      include: {
        category: {
          select: { id: true, name: true, icon: true, color: true },
        },
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
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
