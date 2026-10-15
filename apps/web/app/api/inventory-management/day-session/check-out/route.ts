import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import { jakartaDateKey } from "@/features/inventory-management/helpers/inventory-management-rules";
import {
  buildInventoryCheckOutSnapshot,
  buildInventoryDayCompletion,
  loadInventoryDaySession,
} from "@/features/inventory-management/services/inventory-day-session";
import { apiError } from "@/lib/api/responses";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";

const checkOutSchema = z.object({
  note: z.string().trim().max(500).optional().nullable(),
  exceptionNotes: z.record(z.string(), z.string().trim().max(300)).optional().default({}),
});

function normalizeExceptionNotes(exceptionNotes: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(exceptionNotes)
      .map(([taskId, note]) => [taskId, note.trim()] as const)
      .filter(([, note]) => note.length > 0),
  );
}

function findMissingExceptionTaskIds(
  completion: Awaited<ReturnType<typeof buildInventoryDayCompletion>>,
  exceptionNotes: Record<string, string>,
) {
  return completion.tasks
    .filter((task) => task.required && !task.completed)
    .map((task) => task.id)
    .filter((taskId) => !exceptionNotes[taskId]?.trim());
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("inventory", "update");
    if (!user.storeId) {
      return apiError("Akun Anda belum terhubung ke toko.", 403, {
        code: "Forbidden",
      });
    }

    const input = checkOutSchema.parse(await request.json().catch(() => ({})));
    const exceptionNotes = normalizeExceptionNotes(input.exceptionNotes);
    const now = new Date();
    const dateKey = jakartaDateKey(now);
    const session = await loadInventoryDaySession(user.storeId, dateKey);

    const completion = await buildInventoryDayCompletion(user.storeId, dateKey, now);
    const missingExceptionTaskIds = findMissingExceptionTaskIds(
      completion,
      exceptionNotes,
    );
    if (missingExceptionTaskIds.length > 0) {
      return apiError("Masih ada tugas harian yang belum selesai. Isi catatan pengecualian untuk melanjutkan.", 409, {
        code: "Conflict",
        extra: {
          blockers: completion.blockers,
          completion,
          missingExceptionTaskIds,
        },
      });
    }

    const snapshot = await buildInventoryCheckOutSnapshot({
      storeId: user.storeId,
      dateKey,
      now,
      note: input.note,
      exceptionNotes,
      completion,
      morningCheckSnapshot: session?.morningCheckSnapshot ?? null,
    }) as unknown as Prisma.InputJsonObject;

    const checkOutData = {
      status: "CHECKED_OUT",
      checkOutById: user.id,
      checkOutByName: user.name ?? user.username,
      checkedOutAt: now,
      checkOutSnapshot: snapshot,
    };
    const data = await db.inventoryDaySession.upsert({
      where: { storeId_periodKey: { storeId: user.storeId, periodKey: dateKey } },
      create: { storeId: user.storeId, periodKey: dateKey, ...checkOutData },
      update: checkOutData,
    });

    return NextResponse.json({ data });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (error instanceof z.ZodError) {
      return apiError("Data yang Anda masukkan belum sesuai.", 422, {
        code: "ValidationError",
        errors: error.flatten().fieldErrors,
      });
    }
    return apiError("Belum berhasil menutup hari inventory. Silakan coba lagi.", 500, {
      code: "InternalError",
    });
  }
}
