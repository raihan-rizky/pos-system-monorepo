import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { jakartaDateKey } from "@/features/inventory-management/helpers/inventory-management-rules";

const matchingSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
  now: z.string().datetime().optional(),
});

function jakartaDayBounds(dateKey: string): { start: Date; end: Date } {
  const [year, month, day] = dateKey.split("-").map(Number);
  const startUtc = Date.UTC(year, month - 1, day, -7, 0, 0, 0);
  const endUtc = Date.UTC(year, month - 1, day + 1, -7, 0, 0, 0);
  return { start: new Date(startUtc), end: new Date(endUtc) };
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    const body = await request.json();
    const input = matchingSchema.parse(body);
    if (!user.storeId) {
      return NextResponse.json(
        { message: "Inventory workflow requires a store-scoped user" },
        { status: 403 },
      );
    }
    const storeId = user.storeId;
    const submittedAt = input.now ? new Date(input.now) : new Date();
    const periodKey = jakartaDateKey(submittedAt);
    const { start, end } = jakartaDayBounds(periodKey);

    const unverifiedCount = await db.inventoryLog.count({
      where: {
        type: "OUT",
        status: "APPROVED",
        createdAt: { gte: start, lt: end },
        product: { storeId },
        verification: null,
        OR: [{ reason: "USAGE" }, { reason: "MANUAL_ADJUSTMENT" }],
      },
    });

    if (unverifiedCount > 0) {
      return NextResponse.json(
        {
          message: "Daily stock matching still has unverified stock-out logs",
          unverifiedCount,
        },
        { status: 422 },
      );
    }

    const note = input.note?.trim() || null;
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
        note,
        submittedBy: user.id,
        submittedAt,
        completionSnapshot: {
          eligibleLogCount: 0,
          periodKey,
          completedAt: submittedAt.toISOString(),
        },
      },
      update: {
        status: "SUBMITTED",
        note,
        submittedBy: user.id,
        submittedAt,
        completionSnapshot: {
          eligibleLogCount: 0,
          periodKey,
          completedAt: submittedAt.toISOString(),
        },
      },
    });

    return NextResponse.json({ data: task });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Validation error", errors: error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    return NextResponse.json(
      { message: "Failed to submit daily stock matching" },
      { status: 500 },
    );
  }
}
