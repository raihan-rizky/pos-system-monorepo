import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { jakartaWeekKey } from "@/features/inventory-management/helpers/inventory-management-rules";
import { resolveSubmittedProofImageUrl } from "@/features/proof-upload/server/resolve-submitted-proof";

const proofSchema = z.object({
  proofUrl: z.string().url(),
  note: z.string().trim().max(500).optional().nullable(),
  now: z.string().datetime().optional(),
});

export async function GET(_request: Request) {
  try {
    const user = await requirePermission("inventory", "read");
    if (!user.storeId) {
      return NextResponse.json({ message: "Pengguna harus terhubung ke toko." }, { status: 403 });
    }
    const task = await db.inventoryTask.findUnique({
      where: {
        storeId_type_periodKey: {
          storeId: user.storeId,
          type: "WEEKLY_CLEANING_PROOF",
          periodKey: jakartaWeekKey(new Date()),
        },
      },
      select: { id: true, proofUrl: true, resolvedProofImageUrl: true, note: true },
    });
    return NextResponse.json({ data: task });
  } catch (error) {
    const authErr = handleAuthError(error); if (authErr) return authErr;
    return NextResponse.json({ message: "Gagal memuat bukti mingguan." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    const body = await request.json();
    const input = proofSchema.parse(body);
    if (!user.storeId) {
      return NextResponse.json(
        { message: "Inventory workflow requires a store-scoped user" },
        { status: 403 },
      );
    }
    const storeId = user.storeId;

    const resolvedProofImageUrl = await resolveSubmittedProofImageUrl(input.proofUrl);
    if (!resolvedProofImageUrl) {
      return NextResponse.json(
        { message: "Tautan bukti tidak valid atau gambar tidak dapat dibuka." },
        { status: 422 },
      );
    }

    const submittedAt = input.now ? new Date(input.now) : new Date();
    const periodKey = jakartaWeekKey(submittedAt);
    const note = input.note?.trim() || null;

    const task = await db.inventoryTask.upsert({
      where: {
        storeId_type_periodKey: {
          storeId,
          type: "WEEKLY_CLEANING_PROOF",
          periodKey,
        },
      },
      create: {
        storeId,
        type: "WEEKLY_CLEANING_PROOF",
        periodType: "WEEKLY",
        periodKey,
        status: "SUBMITTED",
        proofUrl: input.proofUrl,
        resolvedProofImageUrl,
        note,
        submittedBy: user.id,
        submittedAt,
      },
      update: {
        status: "SUBMITTED",
        proofUrl: input.proofUrl,
        resolvedProofImageUrl,
        note,
        submittedBy: user.id,
        submittedAt,
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
      { message: "Failed to submit weekly cleaning proof" },
      { status: 500 },
    );
  }
}
