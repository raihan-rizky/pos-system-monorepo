import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";

import { productSnapshot } from "@/features/batch-operations/helpers/snapshots";
import {
  DAILY_MATCHING_WINDOW_LABEL,
  isDailyMatchingWindowOpen,
  jakartaDateKey,
  unresolvedOutLogVerificationWhere,
} from "@/features/inventory-management/helpers/inventory-management-rules";
import { resolveProductDisplayStock } from "@/features/product-stock-groups/stock-display";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const matchingSchema = z.object({
  now: z.string().datetime().optional(),
  lines: z.array(
    z.object({
      productId: z.string().min(1),
      physicalStock: z.coerce.number().min(0),
      note: z.string().trim().max(500).optional().nullable(),
    }),
  ),
});

function jakartaDayBounds(dateKey: string): { start: Date; end: Date } {
  const [year, month, day] = dateKey.split("-").map(Number);
  const startUtc = Date.UTC(year, month - 1, day, -7, 0, 0, 0);
  const endUtc = Date.UTC(year, month - 1, day + 1, -7, 0, 0, 0);
  return { start: new Date(startUtc), end: new Date(endUtc) };
}

async function loadPendingMatchingBundle(storeId: string, periodKey: string) {
  return db.batchOperation.findFirst({
    where: {
      storeId,
      type: "DAILY_STOCK_MATCHING",
      status: "PENDING",
      summary: {
        path: ["periodKey"],
        equals: periodKey,
      },
    },
    include: {
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              unit: true,
              stock: true,
              imageUrl: true,
              category: { select: { name: true, icon: true } },
            },
          },
        },
      },
    },
  });
}

async function countUnverifiedOutLogs(storeId: string, dateKey: string) {
  const { start, end } = jakartaDayBounds(dateKey);
  return db.inventoryLog.count({
    where: {
      type: "OUT",
      status: "APPROVED",
      createdAt: { gte: start, lt: end },
      product: { storeId },
      ...unresolvedOutLogVerificationWhere(),
    },
  });
}

async function buildDailyMatchingPreview(storeId: string, dateKey: string) {
  const { start, end } = jakartaDayBounds(dateKey);
  const logs = await db.inventoryLog.findMany({
    where: {
      type: "OUT",
      status: "APPROVED",
      createdAt: { gte: start, lt: end },
      product: { storeId },
    },
    include: {
      product: {
        include: {
          category: { select: { name: true, icon: true } },
          stockGroup: true,
        },
      },
      verification: { select: { status: true } },
      correctionRequests: {
        where: { status: "APPROVED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        include: {
          correctedProduct: {
            include: {
              category: { select: { name: true, icon: true } },
              stockGroup: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const grouped = new Map<string, {
    product: (typeof logs)[number]["product"];
    totalOut: number;
    logCount: number;
  }>();

  for (const log of logs) {
    const approvedCorrection =
      log.verification?.status === "VERIFIED"
        ? log.correctionRequests?.[0]
        : null;
    const effectiveProduct =
      approvedCorrection?.correctedProduct ?? log.product;
    const effectiveProductId =
      approvedCorrection?.correctedProductId ?? log.productId;
    const effectiveQuantity =
      approvedCorrection?.correctedQuantity ?? log.quantity;
    const row = grouped.get(effectiveProductId) ?? {
      product: effectiveProduct,
      totalOut: 0,
      logCount: 0,
    };
    row.totalOut += effectiveQuantity;
    row.logCount += 1;
    grouped.set(effectiveProductId, row);
  }

  const rows = Array.from(grouped.values()).map((row) => {
    const expectedAfterStock = resolveProductDisplayStock(row.product);
    const stockBeforeOut = expectedAfterStock + row.totalOut;

    return {
      productId: row.product.id,
      product: {
        id: row.product.id,
        name: row.product.name,
        sku: row.product.sku,
        unit: row.product.unit,
        imageUrl: row.product.imageUrl,
        category: row.product.category,
      },
      stockBeforeOut,
      totalOut: row.totalOut,
      expectedAfterStock,
      logCount: row.logCount,
    };
  });

  return rows.sort((a, b) => a.product.name.localeCompare(b.product.name));
}

export async function GET(request: Request) {
  try {
    const user = await requirePermission("inventory", "read");
    if (!user.storeId) {
      return NextResponse.json(
        { message: "Inventory workflow requires a store-scoped user" },
        { status: 403 },
      );
    }
    const { searchParams } = new URL(request.url);
    const now = searchParams.get("now");
    const periodKey = now ? jakartaDateKey(new Date(now)) : jakartaDateKey(new Date());
    const [rows, pendingBundle] = await Promise.all([
      buildDailyMatchingPreview(user.storeId, periodKey),
      loadPendingMatchingBundle(user.storeId, periodKey),
    ]);

    return NextResponse.json({
      data: {
        periodKey,
        rows,
        pendingBundle: pendingBundle
          ? {
              id: pendingBundle.id,
              status: pendingBundle.status,
              summary: pendingBundle.summary,
              items: pendingBundle.items,
            }
          : null,
      },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    return NextResponse.json(
      { message: "Failed to load daily stock matching" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    if (!user.storeId) {
      return NextResponse.json(
        { message: "Inventory workflow requires a store-scoped user" },
        { status: 403 },
      );
    }
    const body = await request.json();
    const input = matchingSchema.parse(body);
    const storeId = user.storeId;
    const submittedAt = new Date();
    const periodDate = input.now ? new Date(input.now) : submittedAt;
    const periodKey = jakartaDateKey(periodDate);

    if (!isDailyMatchingWindowOpen(submittedAt)) {
      return NextResponse.json(
        {
          message: `Matching stok harian hanya bisa disubmit pukul ${DAILY_MATCHING_WINDOW_LABEL}.`,
        },
        { status: 422 },
      );
    }

    const unverifiedCount = await countUnverifiedOutLogs(storeId, periodKey);
    if (unverifiedCount > 0) {
      return NextResponse.json(
        {
          message: "Verify eligible stock-out logs before daily matching",
          unverifiedCount,
        },
        { status: 422 },
      );
    }

    const pendingBundle = await loadPendingMatchingBundle(storeId, periodKey);
    if (pendingBundle) {
      return NextResponse.json(
        { message: "Daily matching is waiting for approval", batchId: pendingBundle.id },
        { status: 409 },
      );
    }

    const previewRows = await buildDailyMatchingPreview(storeId, periodKey);
    const previewByProductId = new Map(previewRows.map((row) => [row.productId, row]));
    const inputByProductId = new Map(input.lines.map((line) => [line.productId, line]));

    if (previewRows.length !== input.lines.length) {
      return NextResponse.json(
        { message: "All matching rows must be submitted" },
        { status: 422 },
      );
    }

    const differences = previewRows
      .map((row) => {
        const line = inputByProductId.get(row.productId);
        if (!line) throw new Error("MISSING_LINE");
        const difference = line.physicalStock - row.expectedAfterStock;
        return {
          ...row,
          physicalStock: line.physicalStock,
          difference,
          note: line.note?.trim() || null,
        };
      })
      .filter((row) => Math.abs(row.difference) > 1e-9);

    const missingNotes = differences.filter((row) => !row.note);
    if (missingNotes.length > 0) {
      return NextResponse.json(
        {
          message: "Catatan wajib diisi untuk produk yang selisih",
          productIds: missingNotes.map((row) => row.productId),
        },
        { status: 422 },
      );
    }

    if (differences.length === 0) {
      const task = await db.inventoryTask.upsert({
        where: {
          storeId_type_periodKey: {
            storeId,
            type: "DAILY_STOCK_MATCHING",
            periodKey,
          },
        },
        create: {
          storeId,
          type: "DAILY_STOCK_MATCHING",
          periodType: "DAILY",
          periodKey,
          status: "SUBMITTED",
          submittedBy: user.id,
          submittedAt,
          completionSnapshot: {
            rowCount: previewRows.length,
            differenceCount: 0,
            periodKey,
            completedAt: submittedAt.toISOString(),
          },
        },
        update: {
          status: "SUBMITTED",
          submittedBy: user.id,
          submittedAt,
          completionSnapshot: {
            rowCount: previewRows.length,
            differenceCount: 0,
            periodKey,
            completedAt: submittedAt.toISOString(),
          },
        },
      });
      return NextResponse.json({ data: { status: "SUBMITTED", task } });
    }

    const products = await db.product.findMany({
      where: { id: { in: differences.map((row) => row.productId) }, storeId },
    });
    const productById = new Map(products.map((product) => [product.id, product]));

    const result = await db.$transaction(async (tx) => {
      const batch = await tx.batchOperation.create({
        data: {
          type: "DAILY_STOCK_MATCHING",
          status: "PENDING",
          storeId,
          createdBy: user.id,
          summary: {
            source: "DAILY_STOCK_MATCHING",
            productName: `Matching Stok Harian ${periodKey}`,
            periodKey,
            totalCount: differences.length,
            pendingCount: differences.length,
            approvedCount: 0,
            rejectedCount: 0,
            pendingApproval: true,
            rowCount: previewRows.length,
          },
        },
      });

      for (const row of differences) {
        const product = productById.get(row.productId);
        if (!product) throw new Error("PRODUCT_NOT_FOUND");
        const beforeSnapshot = productSnapshot({
          ...product,
          stock: row.expectedAfterStock,
        });
        const afterSnapshot = productSnapshot({
          ...product,
          stock: row.physicalStock,
        });
        const log = await tx.inventoryLog.create({
          data: {
            productId: row.productId,
            type: "ADJUSTMENT",
            reason: "OPNAME",
            quantity: row.physicalStock,
            note: row.note,
            createdBy: user.id,
            person: user.name,
            status: "PENDING",
          },
        });
        await tx.batchOperationItem.create({
          data: {
            batchOperationId: batch.id,
            productId: row.productId,
            sku: product.sku,
            action: "ADJUSTMENT",
            beforeSnapshot: beforeSnapshot as unknown as Prisma.InputJsonValue,
            afterSnapshot: afterSnapshot as unknown as Prisma.InputJsonValue,
            inventoryLogId: log.id,
          },
        });
      }

      await tx.inventoryTask.upsert({
        where: {
          storeId_type_periodKey: {
            storeId,
            type: "DAILY_STOCK_MATCHING",
            periodKey,
          },
        },
        create: {
          storeId,
          type: "DAILY_STOCK_MATCHING",
          periodType: "DAILY",
          periodKey,
          status: "PENDING",
          submittedBy: user.id,
          submittedAt,
          completionSnapshot: {
            rowCount: previewRows.length,
            differenceCount: differences.length,
            batchOperationId: batch.id,
          },
        },
        update: {
          status: "PENDING",
          submittedBy: user.id,
          submittedAt,
          completionSnapshot: {
            rowCount: previewRows.length,
            differenceCount: differences.length,
            batchOperationId: batch.id,
          },
        },
      });

      return { status: "PENDING_APPROVAL", batchOperationId: batch.id };
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    if (error instanceof Error && error.message === "MISSING_LINE") {
      return NextResponse.json(
        { message: "All matching rows must be submitted" },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { message: "Failed to submit daily stock matching" },
      { status: 500 },
    );
  }
}
