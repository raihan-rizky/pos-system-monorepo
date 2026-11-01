import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@pos/db";
import { executeDatabaseResetPlan, createDatabaseResetPlan } from "@/features/database-reset/helpers/database-reset-plan";
import {
  DATABASE_RESET_CONFIRMATION,
} from "@/features/database-reset/types/database-reset";
import { handleAuthError, requireRole } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { databaseResetSelectionSchema } from "@/features/database-reset/helpers/database-reset-selection-schema";

const log = getLogger("api:settings:database-reset");
export const dynamic = "force-dynamic";

const executeSchema = databaseResetSelectionSchema.safeExtend({
  confirmation: z.string(),
});

const ACTIVE_IMPORT_STATUSES = ["PENDING", "RUNNING", "CANCEL_REQUESTED"] as const;

async function findActiveProcess(storeId: string) {
  const [openShift, activeImport, pendingBatch] = await Promise.all([
    db.cashierShift.count({ where: { storeId, status: "OPEN" } }),
    db.productImportJob.count({ where: { storeId, status: { in: [...ACTIVE_IMPORT_STATUSES] } } }),
    db.batchOperation.count({ where: { storeId, status: "PENDING" } }),
  ]);

  if (openShift > 0) return "Tutup shift kasir yang masih terbuka sebelum reset.";
  if (activeImport > 0) return "Tunggu proses import produk selesai sebelum reset.";
  if (pendingBatch > 0) return "Tunggu operasi batch selesai sebelum reset.";
  return null;
}

export async function POST(request: Request) {
  try {
    const user = await requireRole("OWNER");
    if (!user.storeId) {
      return NextResponse.json({ message: "Store pengguna tidak ditemukan." }, { status: 409 });
    }

    const parsed = executeSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: "Data konfirmasi reset tidak valid." }, { status: 422 });
    }
    if (parsed.data.confirmation !== DATABASE_RESET_CONFIRMATION) {
      return NextResponse.json({ message: `Ketik ${DATABASE_RESET_CONFIRMATION} persis untuk melanjutkan.` }, { status: 422 });
    }

    const { confirmation: _confirmation, ...selection } = parsed.data;
    const plan = await createDatabaseResetPlan({ db, storeId: user.storeId, ...selection });
    if (!plan.canExecute) {
      return NextResponse.json(
        { message: "Pilih semua data yang diwajibkan sebelum reset.", requiredDependencies: plan.requiredDependencies },
        { status: 409 },
      );
    }

    const activeProcessMessage = await findActiveProcess(user.storeId);
    if (activeProcessMessage) {
      return NextResponse.json({ message: activeProcessMessage }, { status: 409 });
    }

    const summary = await db.$transaction((tx) => executeDatabaseResetPlan(tx, plan));
    return NextResponse.json(summary);
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    log.error("[POST /api/settings/database-reset/execute] Failed", error);
    return NextResponse.json({ message: "Reset database gagal dan tidak ada data yang dihapus." }, { status: 500 });
  }
}
