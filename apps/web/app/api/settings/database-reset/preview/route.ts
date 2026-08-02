import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@pos/db";
import { createDatabaseResetPlan } from "@/features/database-reset/helpers/database-reset-plan";
import { handleAuthError, requireRole } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:settings:database-reset");
export const dynamic = "force-dynamic";

const domainSchema = z.enum([
  "productCatalog",
  "customers",
  "salesFinance",
  "supplierProcurement",
  "inventoryOperations",
  "importBatchJobs",
  "storeNotifications",
]);

const previewSchema = z.object({ domains: z.array(domainSchema).min(1) });

export async function POST(request: Request) {
  try {
    const user = await requireRole("OWNER");
    if (!user.storeId) {
      return NextResponse.json({ message: "Store pengguna tidak ditemukan." }, { status: 409 });
    }

    const parsed = previewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Pilih minimal satu data reset yang valid.", errors: parsed.error.flatten().fieldErrors },
        { status: 422 },
      );
    }

    const plan = await createDatabaseResetPlan({
      db,
      storeId: user.storeId,
      domains: parsed.data.domains,
    });

    return NextResponse.json(plan);
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    log.error("[POST /api/settings/database-reset/preview] Failed", error);
    return NextResponse.json({ message: "Gagal menyiapkan preview reset database." }, { status: 500 });
  }
}
