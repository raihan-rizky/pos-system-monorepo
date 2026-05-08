import { NextResponse } from "next/server";
import { getWahaConfig, isWaConfigured } from "@/lib/whatsapp";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

// GET /api/settings/whatsapp/qr
export async function GET() {
  try {
    await requireRole("OWNER", "ADMIN");
    if (!isWaConfigured()) {
      console.log("[Settings/WA/QR] WAHA is not configured in env");
      return NextResponse.json(
        { message: "WAHA_BASE_URL is not set. Configure it in your environment variables." },
        { status: 503 }
      );
    }

    const { baseUrl, apiKey, session } = getWahaConfig();
    const headers: Record<string, string> = { Accept: "image/png" };
    if (apiKey) headers["X-Api-Key"] = apiKey;

    const targetUrl = `${baseUrl}/api/${session}/auth/qr?format=image`;
    console.log(`[Settings/WA/QR] Fetching QR from WAHA at: ${targetUrl}`);

    const res = await fetch(targetUrl, {
      headers,
      cache: "no-store",
    });

    console.log(`[Settings/WA/QR] WAHA response status: ${res.status}`);

    if (!res.ok) {
      const text = await res.text();
      console.error(`[Settings/WA/QR] WAHA error returned: ${res.status}, body:`, text);
      return NextResponse.json({ message: "Failed to fetch QR from WAHA" }, { status: res.status });
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");

    console.log(`[Settings/WA/QR] Successfully fetched QR data from WAHA`);
    return NextResponse.json({ value: base64 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("[Settings/WA/QR] Failed with exception:", error);
    return NextResponse.json({ message: "Failed to fetch QR code" }, { status: 500 });
  }
}
