import { after, NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { sendRolePushEvent } from "@/lib/push-events";
import {
  applyProductStockDelta,
  StockMutationError,
} from "@/features/product-stock-groups/stock-mutations";

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
  const startedAt = Date.now();
  try {
    const user = await requirePermission("inventory", "update");
    const body = await request.json();
    const validatedData = inventoryLogSchema.parse(body);
    const storeId = user.storeId || "store-main";
    const isOwner = user.role === "OWNER";

    logger.info("inventory.request.received", {
      actorId: user.id,
      actorName: user.name,
      actorRole: user.role,
      storeId,
      productId: validatedData.productId,
      type: validatedData.type,
      reason: validatedData.reason,
      quantity: validatedData.quantity,
      ownerDirectCommit: isOwner,
    });

    if (validatedData.quantity === 0) {
      logger.warn("inventory.request.rejected.zero_quantity", {
        actorId: user.id,
        actorRole: user.role,
        productId: validatedData.productId,
      });
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
        logger.warn("inventory.request.product_not_found", {
          actorId: user.id,
          actorRole: user.role,
          storeId,
          productId: validatedData.productId,
        });
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
          // ADJUSTMENT preserves sign so approval can subtract a downward
          // correction (e.g. OPNAME found fewer units: qty=-5 → stock -= 5).
          // IN/OUT/WASTE etc. are directionally fixed; abs() is correct there.
          quantity:
            validatedData.type === "ADJUSTMENT"
              ? validatedData.quantity
              : Math.abs(validatedData.quantity),
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

      logger.info("inventory.request.log_created", {
        logId: log.id,
        status: log.status,
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        productId: validatedData.productId,
        type: validatedData.type,
        reason: validatedData.reason,
        quantity: Math.abs(validatedData.quantity),
        beforeStock: product.stock,
        stockDelta,
      });

      const updatedProduct = null;
      if (isOwner) {
        const stockResult = await applyProductStockDelta(tx, {
          storeId,
          productId: validatedData.productId,
          delta: stockDelta,
        });
        logger.info("inventory.request.stock_updated", {
          logId: log.id,
          actorId: user.id,
          actorRole: user.role,
          productId: validatedData.productId,
          beforeStock: stockResult.beforeStock,
          afterStock: stockResult.afterStock,
          stockDelta,
        });
      }

      return { log, updatedProduct, status: log.status };
    });

    logger.info("inventory.request.completed", {
      logId: result.log.id,
      status: result.status,
      actorId: user.id,
      actorRole: user.role,
      productId: validatedData.productId,
      durationMs: Date.now() - startedAt,
    });

    if (
      result.status === "PENDING" &&
      (validatedData.type === "IN" || validatedData.type === "OUT")
    ) {
      after(async () => {
        try {
          await sendRolePushEvent({
            eventName: "inventory-request-created",
            storeId,
            roles: ["OWNER", "ADMIN"],
            featureKey: "inventoryRequests",
            payload: {
              title: "Permintaan stok baru",
              body: `${user.name || "User"} membuat permintaan stok ${validatedData.type} sebanyak ${Math.abs(validatedData.quantity)} item.`,
              url: "/products?tab=logs",
              tag: `inventory-request:${result.log.id}`,
            },
          });
        } catch (error) {
          logger.error("inventory.request.notification_failed", {
            error,
            logId: result.log.id,
            actorId: user.id,
            actorRole: user.role,
            storeId,
          });
        }
      });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) {
      logger.warn("inventory.request.auth_failed", {
        durationMs: Date.now() - startedAt,
        error,
      });
      return authErr;
    }

    if (error instanceof z.ZodError) {
      logger.warn("inventory.request.validation_failed", {
        durationMs: Date.now() - startedAt,
        errors: error.flatten().fieldErrors,
      });
      return NextResponse.json(
        { message: "Validation error", errors: error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    if (error instanceof Error) {
      if (error.message === "PRODUCT_NOT_FOUND") {
        return NextResponse.json({ message: "Product not found" }, { status: 404 });
      }
      if (
        error.message === "NEGATIVE_STOCK" ||
        (error instanceof StockMutationError &&
          error.message === "INSUFFICIENT_STOCK")
      ) {
        return NextResponse.json({ message: "Stock cannot be negative" }, { status: 422 });
      }
      if (
        error instanceof StockMutationError &&
        error.message === "CONVERSION_NEEDS_REVIEW"
      ) {
        return NextResponse.json(
          { message: "Product unit conversion must be reviewed before stock changes" },
          { status: 422 },
        );
      }
    }

    logger.error("inventory.record.failed", {
      error,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { message: "Failed to record inventory log" },
      { status: 500 },
    );
  }
}
