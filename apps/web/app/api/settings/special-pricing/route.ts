import { NextResponse } from "next/server";
import { z } from "zod";
import { handleAuthError, requireRole } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { getSpecialPricingEnabled, updateSpecialPricingEnabled } from "@/features/customer-category-pricing/server/special-pricing-settings";

export const dynamic = "force-dynamic";
const log = getLogger("api:settings:special-pricing");
const schema = z.object({ enabled: z.boolean() }).strict();

export async function GET() {
  try {
    await requireRole("OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY");
    return NextResponse.json({ enabled: await getSpecialPricingEnabled() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Failed to read special pricing settings:", error);
    return NextResponse.json({ message: "Pengaturan Harga Khusus belum dapat dimuat." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRole("OWNER");
    const { enabled } = schema.parse(await request.json());
    return NextResponse.json({ enabled: await updateSpecialPricingEnabled(enabled) });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ message: "Pengaturan Harga Khusus tidak valid." }, { status: 422 });
    log.error("Failed to update special pricing settings:", error);
    return NextResponse.json({ message: "Pengaturan Harga Khusus belum dapat disimpan." }, { status: 500 });
  }
}
