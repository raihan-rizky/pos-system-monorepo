import { NextResponse } from "next/server";
import { db } from "@pos/db";
import {
  handleAuthError,
  requirePermission,
} from "@/lib/rbac/guard";
import { apiError } from "@/lib/api/responses";
import { getLogger } from "@/lib/logger";
import { resolveProductDisplayStock } from "@/features/product-stock-groups/stock-display";
import {
  applyProductStockDelta,
  StockMutationError,
} from "@/features/product-stock-groups/stock-mutations";

const log = getLogger("api:surat-jalan:approval");

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("surat_jalan", "update");
    const storeId = user.storeId || "store-main";
    const { id } = await params;

    const result = await db.$transaction(async (tx) => {
      const suratJalan = await tx.suratJalan.findFirst({
        where: { id, storeId },
        include: {
          items: {
            include: {
              product: {
                select: {
                  stock: true,
                  stockGroupId: true,
                  unitMultiplierToBase: true,
                  stockGroup: { select: { baseStock: true } },
                },
              },
            },
          },
          transaction: {
            include: {
              items: true,
              suratJalan: {
                include: { items: true },
              },
            },
          },
        },
      });

      if (!suratJalan) {
        throw new Error("SURAT_JALAN_NOT_FOUND");
      }
      if (suratJalan.status !== "PENDING") {
        throw new Error("INVALID_STATUS");
      }

      for (const item of suratJalan.items) {
        const invoiceItem = suratJalan.transaction.items.find(
          (txItem) => txItem.id === item.transactionItemId,
        );
        if (!invoiceItem) throw new Error("ITEM_NOT_FOUND");

        const alreadyDelivered = suratJalan.transaction.suratJalan
          .filter((record) => record.status === "CONFIRMED")
          .flatMap((record) => record.items)
          .filter(
            (confirmedItem) =>
              confirmedItem.transactionItemId === item.transactionItemId,
          )
          .reduce((sum, confirmedItem) => sum + confirmedItem.quantity, 0);

        if (alreadyDelivered + item.quantity > invoiceItem.quantity) {
          throw new Error("QUANTITY_EXCEEDS_REMAINING");
        }
        if (resolveProductDisplayStock(item.product) < item.quantity) {
          throw new Error("INSUFFICIENT_STOCK");
        }
      }

      for (const item of suratJalan.items) {
        await applyProductStockDelta(tx, {
          storeId,
          productId: item.productId,
          delta: -item.quantity,
        });
      }

      const now = new Date();
      const updated = await tx.suratJalan.update({
        where: { id: suratJalan.id },
        data: {
          status: "CONFIRMED",
          approvedById: user.id,
          approvedByName: user.name ?? null,
          confirmedAt: now,
        },
        include: { items: true },
      });

      await tx.inventoryLog.createMany({
        data: suratJalan.items.map((item) => ({
          productId: item.productId,
          transactionId: suratJalan.transactionId,
          suratJalanId: suratJalan.id,
          type: "OUT",
          reason: "SALE",
          quantity: item.quantity,
          note: `Surat Jalan ${suratJalan.number} untuk invoice ${suratJalan.transactionId}`,
          createdBy: user.id,
          person: user.name ?? null,
        })),
      });

      return updated;
    }, {
      maxWait: 5000,
      timeout: 20000,
    });

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof Error) {
      if (error.message === "SURAT_JALAN_NOT_FOUND") {
        return apiError("Surat jalan not found", 404, { code: "NotFound" });
      }
      if (error.message === "INVALID_STATUS") {
        return apiError("Surat jalan is not pending", 409, {
          code: "Conflict",
        });
      }
      if (
        ["QUANTITY_EXCEEDS_REMAINING", "INSUFFICIENT_STOCK"].includes(
          error.message,
        )
      ) {
        return apiError("Invalid surat jalan quantities", 422, {
          code: "ValidationError",
          errors: { quantities: [error.message] },
        });
      }
      if (
        error instanceof StockMutationError &&
        error.message === "INSUFFICIENT_STOCK"
      ) {
        return apiError("Invalid surat jalan quantities", 422, {
          code: "ValidationError",
          errors: { quantities: ["INSUFFICIENT_STOCK"] },
        });
      }
    }

    log.error("Failed to approve surat jalan", error);
    return apiError("Failed to approve surat jalan", 500, {
      code: "InternalError",
    });
  }
}
