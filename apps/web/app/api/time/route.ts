import { getClockReading } from "@/features/invoice-date/services/internet-clock";
import { NextResponse } from "next/server";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";

const log = getLogger("api:time");
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole("OWNER", "ADMIN", "CASHIER", "SALES");
    const clock = await getClockReading();
    return NextResponse.json(
      {
        ...clock,
        timeZone: "Asia/Jakarta",
      },
      {
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    log.error("Failed to return server clock:", error);
    return NextResponse.json(
      { message: "Waktu server belum dapat dimuat." },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
