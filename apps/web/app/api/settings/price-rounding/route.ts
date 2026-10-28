import { NextResponse } from "next/server";
import { z } from "zod";
import { handleAuthError, requirePermission, requireRole } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { getPriceRoundingSettings, updatePriceRoundingSettings } from "@/features/product-price-rounding/server/rounding-settings";

const log = getLogger("api:settings:price-rounding");
export const dynamic = "force-dynamic";
const settingsSchema = z.object({
  enabled: z.boolean(),
  increment: z.number().int().min(1).max(1_000_000_000),
  threshold: z.number().int().min(0),
}).refine((settings) => settings.threshold <= settings.increment, { path: ["threshold"] });

export async function GET() {
  try {
    await requireRole("OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY");
    return NextResponse.json(await getPriceRoundingSettings(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Failed to fetch price rounding settings:", error);
    return NextResponse.json({ message: "Gagal memuat pengaturan pembulatan harga." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requirePermission("settings.price_rounding", "update");
    const settings = settingsSchema.parse(await request.json());
    return NextResponse.json(await updatePriceRoundingSettings(settings));
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ message: "Pengaturan tidak valid. Isi kelipatan bulat 1–1.000.000.000 dan ambang bulat dari nol sampai kelipatan." }, { status: 422 });
    }
    log.error("Failed to update price rounding settings:", error);
    return NextResponse.json({ message: "Gagal menyimpan pengaturan pembulatan harga." }, { status: 500 });
  }
}
