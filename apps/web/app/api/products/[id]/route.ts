import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

import { z } from "zod";

const updateProductSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  sku: z.string().min(1, "SKU is required").optional(),
  barcode: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "Price must be >= 0").optional(),
  costPrice: z.coerce.number().optional().nullable(),
  stock: z.coerce.number().optional(),
  minStock: z.coerce.number().optional(),
  unit: z.string().optional(),
  size: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  categoryId: z.string().optional(),
  imageUrl: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("product", "update");
    const { id } = await params;
    const storeId = user.storeId || "store-main";
    const body = await request.json();
    
    const validatedData = updateProductSchema.parse(body);

    if (validatedData.sku) {
      const existingProduct = await db.product.findFirst({
        where: { sku: validatedData.sku, storeId },
      });
      if (existingProduct && existingProduct.id !== id) {
        return NextResponse.json(
          { message: "SKU already exists on another product." },
          { status: 400 }
        );
      }
    }

    const existingProduct = await db.product.findFirst({
      where: { id, storeId },
      select: { id: true },
    });

    if (!existingProduct) {
      return NextResponse.json(
        { message: "Product not found" },
        { status: 404 }
      );
    }

    const product = await db.product.update({
      where: { id: existingProduct.id },
      data: validatedData,
      include: {
        category: {
          select: { id: true, name: true, icon: true, color: true },
        },
      },
    });

    return NextResponse.json(product);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Failed to update product:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.issues },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { message: "Failed to update product" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("product", "delete");
    const { id } = await params;
    const storeId = user.storeId || "store-main";
    const existingProduct = await db.product.findFirst({
      where: { id, storeId },
      select: { id: true },
    });

    if (!existingProduct) {
      return NextResponse.json(
        { message: "Product not found" },
        { status: 404 }
      );
    }
    
    // Check if product is in any transactions
    const transactionsCount = await db.transactionItem.count({
      where: { productId: existingProduct.id },
    });

    if (transactionsCount > 0) {
      // Soft delete by setting isActive to false
      const product = await db.product.update({
        where: { id: existingProduct.id },
        data: { isActive: false },
      });
      return NextResponse.json({ success: true, softDeleted: true, product });
    }

    // Hard delete if it has never been sold
    await db.product.delete({
      where: { id: existingProduct.id },
    });

    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("Failed to delete product:", error);
    return NextResponse.json(
      { message: "Failed to delete product" },
      { status: 500 }
    );
  }
}
