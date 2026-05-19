import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const logger = getLogger("api:inventory:bulk:commit");
import { productSnapshot, stockDelta } from "@/features/batch-operations/helpers/snapshots";

const bulkCommitSchema = z.object({
  productIds: z.array(z.string().min(1)).min(1).max(500),
  type: z.enum(["IN", "OUT", "ADJUSTMENT"]),
  quantities: z.record(z.string(), z.coerce.number().int().min(0)),
  note: z.string().trim().min(1, "Note is required"),
});

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    const input = bulkCommitSchema.parse(await request.json());
    const storeId = user.storeId || "store-main";

    const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const products = await tx.product.findMany({ where: { id: { in: input.productIds }, storeId, isActive: true } });

      if (products.length !== input.productIds.length) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      const impacts = products.map((product) => {
        const quantity = input.quantities[product.id] ?? 0;
        const delta = stockDelta(input.type, product.stock, quantity);
        return { product, quantity, delta, afterStock: product.stock + delta };
      });

      if (impacts.some((impact) => impact.quantity <= 0)) throw new Error("QUANTITY_REQUIRED");
      if (impacts.some((impact) => impact.afterStock < 0)) throw new Error("NEGATIVE_STOCK");

      const batch = await tx.batchOperation.create({
        data: {
          type: "BULK_STOCK_ADJUSTMENT",
          status: "COMMITTED",
          storeId,
          createdBy: user.id,
          summary: {
            type: input.type,
            productCount: impacts.length,
            note: input.note,
          },
        },
      });

      let inventoryLogCount = 0;

      for (const impact of impacts) {
        const beforeSnapshot = productSnapshot(impact.product);
        const updated = await tx.product.update({
          where: { id: impact.product.id },
          data: { stock: impact.afterStock },
        });
        const log = await tx.inventoryLog.create({
          data: {
            productId: updated.id,
            type: input.type,
            quantity: Math.abs(input.type === "ADJUSTMENT" ? impact.delta : impact.quantity),
            note: input.note,
            createdBy: user.id,
            person: user.name,
          },
        });
        inventoryLogCount += 1;

        await tx.batchOperationItem.create({
          data: {
            batchOperationId: batch.id,
            productId: updated.id,
            sku: updated.sku,
            action: input.type === "IN" ? "STOCK_IN" : input.type === "OUT" ? "STOCK_OUT" : "ADJUSTMENT",
            beforeSnapshot: beforeSnapshot as unknown as Prisma.InputJsonValue,
            afterSnapshot: productSnapshot(updated) as unknown as Prisma.InputJsonValue,
            inventoryLogId: log.id,
          },
        });
      }

      await tx.batchOperation.update({
        where: { id: batch.id },
        data: {
          summary: {
            type: input.type,
            updatedProductCount: impacts.length,
            inventoryLogCount,
            note: input.note,
          },
        },
      });

      return {
        updatedProductCount: impacts.length,
        inventoryLogCount,
        batchOperationId: batch.id,
        undoAvailable: true,
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Validation error", errors: error.flatten().fieldErrors }, { status: 422 });
    }
    if (error instanceof Error) {
      if (error.message === "PRODUCT_NOT_FOUND") return NextResponse.json({ message: "Some selected products were not found" }, { status: 404 });
      if (error.message === "QUANTITY_REQUIRED") return NextResponse.json({ message: "Every selected product needs a quantity" }, { status: 422 });
      if (error.message === "NEGATIVE_STOCK") return NextResponse.json({ message: "Stock cannot be negative" }, { status: 422 });
    }
    logger.error("inventory.bulk.commit.failed", { error });
    return NextResponse.json({ message: "Failed to commit bulk stock update" }, { status: 500 });
  }
}

