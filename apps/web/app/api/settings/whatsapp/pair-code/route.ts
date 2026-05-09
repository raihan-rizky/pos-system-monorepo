import { NextResponse } from "next/server";
import { getWahaConfig, isWaConfigured } from "@/lib/whatsapp";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

function normalizePhoneNumber(phoneNumber: unknown) {
  if (typeof phoneNumber !== "string") return "";
  return phoneNumber.replace(/[^\d+]/g, "").replace(/^\+/, "");
}

function extractPairCode(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  return (
    record.code ||
    record.pairingCode ||
    record.requestCode ||
    record.value ||
    null
  );
}

function parseJsonObject(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    const data = JSON.parse(text);
    return data && typeof data === "object"
      ? data as Record<string, unknown>
      : { value: data };
  } catch {
    return { message: text };
  }
}

export async function POST(request: Request) {
  try {
    await requireRole("OWNER", "ADMIN");
    if (!isWaConfigured()) {
      return NextResponse.json(
        { message: "WAHA_BASE_URL is not set. Configure it in your environment variables." },
        { status: 503 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const phoneNumber = normalizePhoneNumber(body.phoneNumber);

    if (!phoneNumber || phoneNumber.length < 8) {
      return NextResponse.json(
        { message: "Enter a valid WhatsApp phone number." },
        { status: 400 },
      );
    }

    const { baseUrl, apiKey, session } = getWahaConfig();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (apiKey) headers["X-Api-Key"] = apiKey;

    const targetUrl = `${baseUrl}/api/${encodeURIComponent(session)}/auth/request-code`;
    const res = await fetch(targetUrl, {
      method: "POST",
      headers,
      cache: "no-store",
      body: JSON.stringify({ phoneNumber }),
    });

    const data = parseJsonObject(await res.text());

    if (!res.ok) {
      const message = typeof data.message === "string"
        ? data.message
        : "Failed to request pairing code from WAHA";

      return NextResponse.json(
        { message },
        { status: res.status },
      );
    }

    const code = extractPairCode(data);
    return NextResponse.json({
      code: typeof code === "string" ? code : "",
      phoneNumber,
      raw: data,
    });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    console.error("[Settings/WA/PairCode] Failed with exception:", error);
    return NextResponse.json(
      { message: "Failed to request WhatsApp pairing code" },
      { status: 500 },
    );
  }
}
