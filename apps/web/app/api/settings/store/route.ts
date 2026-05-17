import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

const SETTINGS_ID = "store-main";

const storeSchema = z.object({
  name: z.string().optional().default(""),
  address: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  logoUrl: z.string().nullable().optional(),
});

// GET /api/settings/store
export async function GET() {
  try {
    await requirePermission("settings", "read");
    const settings = await db.storeSettings.findUnique({
      where: { id: SETTINGS_ID },
    });

    // Return defaults if no record yet
    return NextResponse.json(
      settings ?? { id: SETTINGS_ID, name: "", address: "", phone: "", logoUrl: null }
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("[Settings/Store] GET failed:", error);
    return NextResponse.json({ message: "Failed to fetch settings" }, { status: 500 });
  }
}

// PATCH /api/settings/store
export async function PATCH(request: Request) {
  try {
    await requirePermission("settings", "update");
    const body = await request.json();
    const data = storeSchema.parse(body);

    const settings = await db.storeSettings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...data },
    });

    return NextResponse.json(settings);
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Validation error", errors: error.issues }, { status: 400 });
    }
    console.error("[Settings/Store] PATCH failed:", error);
    return NextResponse.json({ message: "Failed to save settings" }, { status: 500 });
  }
}
