import { NextResponse } from "next/server";
import { db } from "@pos/db";

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    const body = await request.json();

    const product = await db.product.update({
      where: { id },
      data: {
        name: body.name,
        sku: body.sku,
        price: body.price,
        costPrice: body.costPrice || null,
        stock: body.stock,
        minStock: body.minStock || 5,
        unit: body.unit,
        size: body.size || null,
        material: body.material || null,
        categoryId: body.categoryId,
      },
      include: {
        category: {
          select: { id: true, name: true, icon: true, color: true },
        },
      },
    });

    return NextResponse.json(product);
  } catch (error) {
    console.error("Failed to update product:", error);
    return NextResponse.json(
      { message: "Failed to update product" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const id = params.id;
    
    // Check if product is in any transactions
    const transactionsCount = await db.transactionItem.count({
      where: { productId: id },
    });

    if (transactionsCount > 0) {
      // Soft delete by setting isActive to false
      const product = await db.product.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({ success: true, softDeleted: true, product });
    }

    // Hard delete if it has never been sold
    await db.product.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, deleted: true });
  } catch (error) {
    console.error("Failed to delete product:", error);
    return NextResponse.json(
      { message: "Failed to delete product" },
      { status: 500 }
    );
  }
}
