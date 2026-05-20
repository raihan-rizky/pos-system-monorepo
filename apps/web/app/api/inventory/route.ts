import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const logger = getLogger("api:inventory");

const REASONS_BY_TYPE = {
  IN: ["RESTOCK", "SALE_RETURN"],
  OUT: ["WASTE", "USAGE", "SUPPLIER_RETURN"],
  ADJUSTMENT: ["OPNAME", "MANUAL_ADJUSTMENT"],
} as const;

const inventoryLogSchema = z
  .object({
    productId: z.string().min(1, "Product ID is required"),
    type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
    reason: z.enum([
      "RESTOCK",
      "SALE_RETURN",
      "WASTE",
      "USAGE",
      "SUPPLIER_RETURN",
      "OPNAME",
      "MANUAL_ADJUSTMENT",
    ]),
    quantity: z.number().int("Quantity must be an integer"),
    note: z.string().optional().nullable(),
  })
  .refine(
    (data) =>
      (REASONS_BY_TYPE[data.type] as readonly string[]).includes(data.reason),
    {
      message: "Reason is not valid for the selected type",
      path: ["reason"],
    },
  );

function computeStockDelta(
  type: "IN" | "OUT" | "ADJUSTMENT",
  quantity: number,
): number {
  if (type === "OUT") return -Math.abs(quantity);
  if (type === "IN") return Math.abs(quantity);
  return quantity; // ADJUSTMENT can be signed
}

// POST /api/inventory
// OWNER → commits APPROVED row + updates product.stock atomically.
// Non-OWNER → creates a PENDING request only; no stock change.
export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    const body = await request.json();
    const validatedData = inventoryLogSchema.parse(body);
    const storeId = user.storeId || "store-main";
    const isOwner = user.role === "OWNER";

    if (validatedData.quantity === 0) {
      return NextResponse.json(
        { message: "Quantity cannot be zero" },
        { status: 422 },
      );
    }

    const stockDelta = computeStockDelta(
      validatedData.type,
      validatedData.quantity,
    );

    const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const product = await tx.product.findFirst({
        where: { id: validatedData.productId, storeId },
        select: { stock: true, costPrice: true },
      });

      if (!product) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const unitCost =
        product.costPrice === null
          ? null
          : Number(product.costPrice.toString());

      const now = new Date();

      const log = await tx.inventoryLog.create({
        data: {
          productId: validatedData.productId,
          type: validatedData.type,
          reason: validatedData.reason,
          quantity: Math.abs(validatedData.quantity),
          unitCost,
          note: validatedData.note,
          createdBy: user.id,
          person: user.name,
          status: isOwner ? "APPROVED" : "PENDING",
          approvedBy: isOwner ? user.id : null,
          approverName: isOwner ? user.name : null,
          decidedAt: isOwner ? now : null,
        },
      });

      let updatedProduct = null;
      if (isOwner) {
        const newStock = product.stock + stockDelta;
        if (newStock < 0) {
          throw new Error("NEGATIVE_STOCK");
        }
        updatedProduct = await tx.product.update({
          where: { id: validatedData.productId },
          data: { stock: newStock },
        });
      }

      return { log, updatedProduct, status: log.status };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    logger.error("inventory.record.failed", { error });
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    if (error instanceof Error) {
      if (error.message === "PRODUCT_NOT_FOUND") {
        return NextResponse.json({ message: "Product not found" }, { status: 404 });
      }
      if (error.message === "NEGATIVE_STOCK") {
        return NextResponse.json({ message: "Stock cannot be negative" }, { status: 422 });
      }
    }

    return NextResponse.json(
      { message: "Failed to record inventory log" },
      { status: 500 },
    );
  }
}
