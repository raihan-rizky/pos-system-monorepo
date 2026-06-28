import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { apiError, apiValidationError } from "@/lib/api/responses";
import {
  handleAuthError,
  requirePermission,
} from "@/lib/rbac/guard";

const MARKING_STATUSES = [
  "COMPLETED",
  "NOT_DELIVERED",
  "NEEDS_SIGNATURE",
  "NEEDS_FOLLOW_UP",
  "POSTPONED",
  "NOT_RELEVANT",
] as const;

const NOTE_REQUIRED_STATUSES = new Set<(typeof MARKING_STATUSES)[number]>([
  "NOT_DELIVERED",
  "NEEDS_SIGNATURE",
  "NEEDS_FOLLOW_UP",
  "POSTPONED",
  "NOT_RELEVANT",
]);

const markingSchema = z
  .object({
    markingStatus: z.enum(MARKING_STATUSES),
    markingNote: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine((input, ctx) => {
    if (
      NOTE_REQUIRED_STATUSES.has(input.markingStatus) &&
      !input.markingNote
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["markingNote"],
        message: "Catatan wajib diisi untuk status ini",
      });
    }
  });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("surat_jalan", "update");
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const input = markingSchema.parse(await request.json().catch(() => ({})));

    const suratJalan = await db.suratJalan.findFirst({
      where: { id, storeId },
      select: { id: true },
    });

    if (!suratJalan) {
      return apiError("Surat jalan not found", 404, { code: "NotFound" });
    }

    const updated = await db.suratJalan.update({
      where: { id },
      data: {
        markingStatus: input.markingStatus,
        markedById: user.id,
        markedByName: user.name ?? user.username,
        markedAt: new Date(),
        markingNote: input.markingNote || null,
      },
      include: { items: true },
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    if (error instanceof z.ZodError) {
      return apiValidationError(error);
    }
    return apiError("Failed to mark surat jalan", 500, {
      code: "InternalError",
    });
  }
}
