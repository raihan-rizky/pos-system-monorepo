import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const verificationSchema = z.object({
  inventoryLogId: z.string().min(1),
  status: z.enum(["VERIFIED", "MISMATCH"]),
  note: z.string().trim().max(500).optional().nullable(),
});

const VERIFIABLE_REASONS = new Set(["USAGE", "MANUAL_ADJUSTMENT"]);

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    const body = await request.json();
    const input = verificationSchema.parse(body);
    if (!user.storeId) {
      return NextResponse.json(
        { message: "Inventory workflow requires a store-scoped user" },
        { status: 403 },
      );
    }
    const storeId = user.storeId;

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

    return NextResponse.json(
      { message: "Failed to verify inventory log" },
      { status: 500 },
    );
  }
}
