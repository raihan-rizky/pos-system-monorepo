import { NextResponse } from "next/server";
import { z } from "zod";
import { handleAuthError, requireRole } from "@/lib/rbac/guard";
import {
  getShiftSettings,
  setShiftEnabled,
} from "@/lib/shift/shift-settings-server";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:settings:shift");
export const dynamic = "force-dynamic";

const shiftSettingsSchema = z.object({
  enabled: z.boolean(),
});

export async function GET() {
  try {
    await requireRole("OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY");
    return NextResponse.json(await getShiftSettings());
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    log.error("Failed to fetch shift settings:", error);
    return NextResponse.json(
      { message: "Gagal memuat pengaturan shift." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRole("OWNER");
    const body = shiftSettingsSchema.parse(await request.json());
    return NextResponse.json(await setShiftEnabled(body.enabled));
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { message: "Nilai pengaturan shift tidak valid." },
        { status: 422 },
      );
    }

    log.error("Failed to update shift settings:", error);
    return NextResponse.json(
      { message: "Gagal menyimpan pengaturan shift." },
      { status: 500 },
    );
  }
}
