import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import {
  calculateOutLogCorrectionMovements,
  jakartaDateKey,
  resolveOutLogVerificationState,
} from "@/features/inventory-management/helpers/inventory-management-rules";
import { applyProductStockDelta } from "@/features/product-stock-groups/stock-mutations";

const verificationSchema = z.object({
  inventoryLogId: z.string().min(1),
  status: z.enum(["VERIFIED", "MISMATCH"]),
  note: z.string().trim().max(500).optional().nullable(),
});

const correctionSchema = z.object({
  action: z.literal("CREATE_CORRECTION"),
  inventoryLogId: z.string().min(1),
  correctedProductId: z.string().min(1),
  correctedQuantity: z.coerce.number().positive(),
  correctedReason: z.enum(["USAGE", "MANUAL_ADJUSTMENT"]),
  correctedNote: z.string().trim().min(1).max(500),
});

const approveCorrectionSchema = z.object({
  action: z.literal("APPROVE_CORRECTION"),
  correctionRequestId: z.string().min(1),
});

const rejectCorrectionSchema = z.object({
  action: z.literal("REJECT_CORRECTION"),
  correctionRequestId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
});

const VERIFIABLE_REASONS = new Set(["USAGE", "MANUAL_ADJUSTMENT"]);

function jakartaDayBounds(dateKey: string): { start: Date; end: Date } {
  const [year, month, day] = dateKey.split("-").map(Number);
  const startUtc = Date.UTC(year, month - 1, day, -7, 0, 0, 0);
  const endUtc = Date.UTC(year, month - 1, day + 1, -7, 0, 0, 0);
  return { start: new Date(startUtc), end: new Date(endUtc) };
}

export async function GET(request: Request) {
  try {
    const user = await requirePermission("inventory", "read");
    if (!user.storeId) {
      return NextResponse.json(
        { message: "Workflow inventaris memerlukan pengguna dengan toko" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const requestedDateKey = searchParams.get("dateKey");
    const dateKey =
      requestedDateKey && /^\d{4}-\d{2}-\d{2}$/.test(requestedDateKey)
        ? requestedDateKey
        : jakartaDateKey(new Date());
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 25)));
    const { start, end } = jakartaDayBounds(dateKey);
    const where = {
      type: "OUT" as const,
      status: "APPROVED" as const,
      createdAt: { gte: start, lt: end },
      product: { storeId: user.storeId },
      OR: [{ reason: "USAGE" as const }, { reason: "MANUAL_ADJUSTMENT" as const }],
    };

    const [logs, total] = await Promise.all([
      db.inventoryLog.findMany({
        where,
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
          verification: true,
          correctionRequests: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: {
              correctedProduct: {
                select: { id: true, name: true, sku: true, unit: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.inventoryLog.count({ where }),
    ]);

    const items = logs.map((log) => {
      const latestCorrection = log.correctionRequests[0] ?? null;
      return {
        ...log,
        correctionRequests: undefined,
        latestCorrection,
        verificationState: resolveOutLogVerificationState({
          verificationStatus: log.verification?.status ?? null,
          correctionStatus: latestCorrection?.status ?? null,
        }),
      };
    });

    return NextResponse.json({
      data: {
        periodKey: dateKey,
        items,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    return NextResponse.json(
      { message: "Gagal memuat antrean verifikasi Log OUT" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await requirePermission(
      body?.action === "APPROVE_CORRECTION" ||
        body?.action === "REJECT_CORRECTION"
        ? "inventory.approve"
        : "inventory.out_log.verify",
      "update",
    );
    if (!user.storeId) {
      return NextResponse.json(
        { message: "Inventory workflow requires a store-scoped user" },
        { status: 403 },
      );
    }
    const storeId = user.storeId;

    if (body?.action === "REJECT_CORRECTION") {
      const input = rejectCorrectionSchema.parse(body);
      const correction = await db.$transaction(async (tx) => {
        const pending = await tx.inventoryLogCorrectionRequest.findFirst({
          where: {
            id: input.correctionRequestId,
            storeId,
            status: "PENDING",
          },
          select: { id: true, requestedBy: true },
        });
        if (!pending) throw new Error("CORRECTION_NOT_FOUND");
        if (pending.requestedBy === user.id) throw new Error("SELF_APPROVAL");

        return tx.inventoryLogCorrectionRequest.update({
          where: { id: pending.id },
          data: {
            status: "REJECTED",
            decidedBy: user.id,
            decidedAt: new Date(),
            rejectionReason: input.reason,
            version: { increment: 1 },
          },
        });
      });

      return NextResponse.json({ data: correction });
    }

    if (body?.action === "APPROVE_CORRECTION") {
      const input = approveCorrectionSchema.parse(body);
      const correction = await db.$transaction(async (tx) => {
        const pending = await tx.inventoryLogCorrectionRequest.findFirst({
          where: {
            id: input.correctionRequestId,
            storeId,
            status: "PENDING",
          },
          include: {
            inventoryLog: {
              select: { id: true, productId: true, quantity: true },
            },
          },
        });
        if (!pending) throw new Error("CORRECTION_NOT_FOUND");
        if (pending.requestedBy === user.id) throw new Error("SELF_APPROVAL");

        const movements = calculateOutLogCorrectionMovements({
          originalProductId: pending.inventoryLog.productId,
          originalQuantity: pending.inventoryLog.quantity,
          correctedProductId: pending.correctedProductId,
          correctedQuantity: pending.correctedQuantity,
        });
        const now = new Date();

        for (const movement of movements) {
          await applyProductStockDelta(tx, {
            storeId,
            productId: movement.productId,
            delta: movement.delta,
          });
          const adjustmentLog = await tx.inventoryLog.create({
            data: {
              productId: movement.productId,
              type: "ADJUSTMENT",
              reason: "MANUAL_ADJUSTMENT",
              quantity: movement.delta,
              note: `Koreksi Log OUT ${pending.inventoryLogId}: ${pending.correctedNote || "Koreksi data"}`,
              createdBy: pending.requestedBy,
              status: "APPROVED",
              approvedBy: user.id,
              approverName: user.name,
              decidedAt: now,
            },
          });
          await tx.inventoryLogCorrectionMovement.create({
            data: {
              correctionRequestId: pending.id,
              inventoryLogId: adjustmentLog.id,
              kind: movement.kind,
            },
          });
        }

        return tx.inventoryLogCorrectionRequest.update({
          where: { id: pending.id },
          data: {
            status: "APPROVED",
            decidedBy: user.id,
            decidedAt: now,
            rejectionReason: null,
            version: { increment: 1 },
          },
        });
      });

      return NextResponse.json({ data: correction });
    }

    if (body?.action === "CREATE_CORRECTION") {
      const input = correctionSchema.parse(body);
      const sourceLog = await db.inventoryLog.findFirst({
        where: {
          id: input.inventoryLogId,
          type: "OUT",
          status: "APPROVED",
          product: { storeId },
          OR: [{ reason: "USAGE" }, { reason: "MANUAL_ADJUSTMENT" }],
        },
        select: {
          id: true,
          productId: true,
          quantity: true,
          createdAt: true,
          verification: { select: { status: true } },
        },
      });
      if (!sourceLog) {
        return NextResponse.json(
          { message: "Log OUT tidak ditemukan" },
          { status: 404 },
        );
      }
      if (sourceLog.verification?.status !== "MISMATCH") {
        return NextResponse.json(
          { message: "Tandai Log OUT sebagai Perlu Koreksi terlebih dahulu" },
          { status: 422 },
        );
      }

      const [pendingCorrection, correctedProduct] = await Promise.all([
        db.inventoryLogCorrectionRequest.findFirst({
          where: {
            storeId,
            inventoryLogId: sourceLog.id,
            status: "PENDING",
          },
          select: { id: true },
        }),
        db.product.findFirst({
          where: { id: input.correctedProductId, storeId, isActive: true },
          select: { id: true },
        }),
      ]);
      if (pendingCorrection) {
        return NextResponse.json(
          { message: "Koreksi Log OUT ini masih menunggu approval" },
          { status: 409 },
        );
      }
      if (!correctedProduct) {
        return NextResponse.json(
          { message: "Produk koreksi tidak ditemukan atau sudah nonaktif" },
          { status: 422 },
        );
      }

      const periodKey = jakartaDateKey(sourceLog.createdAt);
      const [matchingTask, daySession] = await Promise.all([
        db.inventoryTask.findUnique({
          where: {
            storeId_type_periodKey: {
              storeId,
              type: "DAILY_STOCK_MATCHING",
              periodKey,
            },
          },
          select: { status: true },
        }),
        db.inventoryDaySession.findUnique({
          where: { storeId_periodKey: { storeId, periodKey } },
          select: { status: true },
        }),
      ]);
      if (
        matchingTask?.status === "SUBMITTED" ||
        daySession?.status === "CHECKED_OUT"
      ) {
        return NextResponse.json(
          { message: "Koreksi sudah dikunci setelah matching atau check-out" },
          { status: 409 },
        );
      }

      const correction = await db.inventoryLogCorrectionRequest.create({
        data: {
          storeId,
          inventoryLogId: sourceLog.id,
          correctedProductId: input.correctedProductId,
          correctedQuantity: input.correctedQuantity,
          correctedReason: input.correctedReason,
          correctedNote: input.correctedNote,
          requestedBy: user.id,
          status: "PENDING",
        },
      });

      return NextResponse.json({ data: correction }, { status: 201 });
    }

    const input = verificationSchema.parse(body);

    const log = await db.inventoryLog.findFirst({
      where: {
        id: input.inventoryLogId,
        type: "OUT",
        status: "APPROVED",
        product: { storeId },
      },
      select: {
        id: true,
        reason: true,
        createdAt: true,
      },
    });

    if (!log) {
      return NextResponse.json(
        { message: "Inventory log not found" },
        { status: 404 },
      );
    }

    if (!log.reason || !VERIFIABLE_REASONS.has(log.reason)) {
      return NextResponse.json(
        { message: "Inventory log is not eligible for daily verification" },
        { status: 422 },
      );
    }

    const periodKey = jakartaDateKey(log.createdAt);
    const [matchingTask, daySession] = await Promise.all([
      db.inventoryTask.findUnique({
        where: {
          storeId_type_periodKey: {
            storeId,
            type: "DAILY_STOCK_MATCHING",
            periodKey,
          },
        },
        select: { status: true },
      }),
      db.inventoryDaySession.findUnique({
        where: { storeId_periodKey: { storeId, periodKey } },
        select: { status: true },
      }),
    ]);
    if (
      matchingTask?.status === "SUBMITTED" ||
      daySession?.status === "CHECKED_OUT"
    ) {
      return NextResponse.json(
        { message: "Verifikasi sudah dikunci setelah matching atau check-out" },
        { status: 409 },
      );
    }

    const pendingCorrection = await db.inventoryLogCorrectionRequest.findFirst({
      where: {
        storeId,
        inventoryLogId: log.id,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (pendingCorrection) {
      return NextResponse.json(
        { message: "Selesaikan atau tolak request koreksi yang masih pending" },
        { status: 409 },
      );
    }

    const now = new Date();
    const note = input.note?.trim() || null;
    const verification = await db.inventoryLogVerification.upsert({
      where: { inventoryLogId: input.inventoryLogId },
      create: {
        inventoryLogId: input.inventoryLogId,
        storeId,
        status: input.status,
        note,
        verifiedBy: user.id,
        verifiedAt: now,
      },
      update: {
        status: input.status,
        note,
        verifiedBy: user.id,
        verifiedAt: now,
      },
    });

    return NextResponse.json({ data: verification });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    if (error instanceof Error && error.message === "CORRECTION_NOT_FOUND") {
      return NextResponse.json(
        { message: "Request koreksi tidak ditemukan atau sudah diputuskan" },
        { status: 404 },
      );
    }
    if (error instanceof Error && error.message === "SELF_APPROVAL") {
      return NextResponse.json(
        { message: "Pembuat koreksi tidak boleh menyetujui request sendiri" },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { message: "Failed to verify inventory log" },
      { status: 500 },
    );
  }
}
