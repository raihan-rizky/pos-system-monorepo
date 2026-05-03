import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";

const inventoryLogSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
  quantity: z.number().int("Quantity must be an integer"),
  note: z.string().optional().nullable(),
});

// POST /api/inventory - Record a stock change
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validatedData = inventoryLogSchema.parse(body);

    if (validatedData.quantity === 0) {
      return NextResponse.json(
        { message: "Quantity cannot be zero" },
        { status: 400 }
      );
    }

    // Determine the actual stock change amount.
    // If it's a Stock OUT, quantity should be negative for the product update.
    // We expect the client to send positive numbers for IN/OUT, but let's handle safety.
    let stockDelta = validatedData.quantity;
    if (validatedData.type === "OUT") {
      stockDelta = -Math.abs(validatedData.quantity);
    } else if (validatedData.type === "IN") {
      stockDelta = Math.abs(validatedData.quantity);
    }
    // ADJUSTMENT uses the exact value provided (can be negative or positive)

    // Execute atomically
    const result = await db.$transaction(async (tx: any) => {
      // 1. Get current stock
      const product = await tx.product.findUnique({
        where: { id: validatedData.productId },
        select: { stock: true },
      });

      if (!product) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const newStock = product.stock + stockDelta;

      if (newStock < 0) {
        throw new Error("NEGATIVE_STOCK");
      }

      // 2. Create the log
      const log = await tx.inventoryLog.create({
        data: {
          productId: validatedData.productId,
          type: validatedData.type,
          quantity: Math.abs(validatedData.quantity), // Store absolute magnitude in log
          note: validatedData.note,
        },
      });

      // 3. Update the product stock
      const updatedProduct = await tx.product.update({
        where: { id: validatedData.productId },
        data: { stock: newStock },
      });

      return { log, updatedProduct };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Failed to record inventory log:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.issues },
        { status: 400 }
      );
    }
    
    if (error instanceof Error) {
      if (error.message === "PRODUCT_NOT_FOUND") {
        return NextResponse.json({ message: "Product not found" }, { status: 404 });
      }
      if (error.message === "NEGATIVE_STOCK") {
        return NextResponse.json({ message: "Stock cannot be negative" }, { status: 400 });
      }
    }

    return NextResponse.json(
      { message: "Failed to record inventory log" },
      { status: 500 }
    );
  }
}
