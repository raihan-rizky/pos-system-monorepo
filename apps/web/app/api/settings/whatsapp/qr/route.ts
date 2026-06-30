import { NextResponse } from "next/server";
import { getWahaConfig, isWaConfigured } from "@/lib/whatsapp";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";

import { getLogger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rate-limit";

const log = getLogger("api:settings:whatsapp:qr");
export const dynamic = "force-dynamic";

// GET /api/settings/whatsapp/qr
export async function GET(request: Request) {
  const rateLimited = enforceRateLimit(request, {
    namespace: "api:settings:whatsapp:qr",
    limit: 60,
    windowMs: 60_000,
  });
  if (rateLimited) return rateLimited;

  try {
    await requirePermission("whatsapp", "read");
    if (!isWaConfigured()) {
      log.info("[Settings/WA/QR] WAHA is not configured in env");
      return NextResponse.json(
        { message: "WAHA_BASE_URL is not set. Configure it in your environment variables." },
        { status: 503 }
      );
    }

    const { baseUrl, apiKey, session } = getWahaConfig();
    const headers: Record<string, string> = { Accept: "image/png" };
    if (apiKey) headers["X-Api-Key"] = apiKey;

    const targetUrl = `${baseUrl}/api/${session}/auth/qr?format=image`;
    log.info(`[Settings/WA/QR] Fetching QR from WAHA at: ${targetUrl}`);

    const res = await fetch(targetUrl, {
      headers,
      cache: "no-store",
    });

    log.info(`[Settings/WA/QR] WAHA response status: ${res.status}`);

    if (!res.ok) {
      const text = await res.text();
      log.error(`[Settings/WA/QR] WAHA error returned: ${res.status}, body:`, text);
      return NextResponse.json({ message: "Failed to fetch QR from WAHA" }, { status: res.status });
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    log.info(`[Settings/WA/QR] Successfully fetched QR data from WAHA`);
    return NextResponse.json({ value: base64 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("[Settings/WA/QR] Failed with exception:", error);
    return NextResponse.json({ message: "Failed to fetch QR code" }, { status: 500 });
  }
}
