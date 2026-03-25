import { NextResponse } from "next/server";
import { db } from "@pos/db";

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

    return NextResponse.json(products);
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
    const product = await db.product.create({
      data: {
        name: body.name,
        sku: body.sku,
        barcode: body.barcode || null,
        description: body.description || null,
        price: body.price,
        costPrice: body.costPrice || null,
        stock: body.stock || 0,
        minStock: body.minStock || 5,
        unit: body.unit || "pcs",
        size: body.size || null,
        material: body.material || null,
        categoryId: body.categoryId,
        storeId: body.storeId || "store-main",
        imageUrl: body.imageUrl || null,
      },
      include: {
        category: {
          select: { id: true, name: true, icon: true, color: true },
        },
      },
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("Failed to create product:", error);
    return NextResponse.json(
      { message: "Failed to create product" },
      { status: 500 }
    );
  }
}
