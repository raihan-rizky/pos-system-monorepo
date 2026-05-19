import { NextResponse } from "next/server";
import { getWahaConfig, isWaConfigured } from "@/lib/whatsapp";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:settings:whatsapp:status");
export const dynamic = "force-dynamic";

// GET /api/settings/whatsapp/status
export async function GET() {
  try {
    await requirePermission("whatsapp", "read");
    if (!isWaConfigured()) {
      log.info("[Settings/WA/Status] WAHA is not configured in env");
      return NextResponse.json(
        { status: "NOT_CONFIGURED", message: "WAHA_BASE_URL is not set." },
        { status: 503 }
      );
    }

    const { baseUrl, apiKey, session } = getWahaConfig();
    const headers: Record<string, string> = { Accept: "application/json" };
    if (apiKey) headers["X-Api-Key"] = apiKey;

    // Use /api/sessions/:session to get detailed session status including 'me' info
    const targetUrl = `${baseUrl}/api/sessions/${session}`;
    log.info(`[Settings/WA/Status] Fetching WAHA status from: ${targetUrl}`);

    const res = await fetch(targetUrl, {
      headers,
      cache: "no-store",
    });

    log.info(`[Settings/WA/Status] WAHA response status: ${res.status}`);

    if (!res.ok) {
      const text = await res.text();
      log.warn(`[Settings/WA/Status] WAHA returned non-ok status: ${res.status}, body:`, text);
      return NextResponse.json({ status: "DISCONNECTED" });
    }

    const data = await res.json();
    log.info(`[Settings/WA/Status] WAHA raw data:`, JSON.stringify(data));
    
    // WAHA /api/sessions/:session returns { status: "WORKING" | "STARTING" | "SCAN_QR_CODE" | "FAILED" | "STOPPED", me: { id, pushName } }
    const waStatus = data?.status ?? "DISCONNECTED";
    const mapped =
      waStatus === "WORKING" || waStatus === "CONNECTED"
        ? "CONNECTED"
        : waStatus === "SCAN_QR_CODE" || waStatus === "STARTING"
          ? "SCAN_QR_CODE"
          : "DISCONNECTED";

    log.info(`[Settings/WA/Status] Mapped status: ${mapped}`);
    return NextResponse.json({ status: mapped, raw: data });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("[Settings/WA/Status] Failed with exception:", error);
    return NextResponse.json({ status: "UNKNOWN" });
  }
}
