import { NextResponse } from "next/server";
import { getWahaConfig, isWaConfigured } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * GET /api/wa/media/[id]
 * Proxies WhatsApp media downloads through WAHA.
 * The `id` param is the WAHA message ID that contains media.
 *
 * Uses WAHA endpoint: GET /api/{session}/media?messageId={id}
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isWaConfigured()) {
    return NextResponse.json(
      { message: "WAHA is not configured" },
      { status: 500 }
    );
  }

  try {
    const { baseUrl, apiKey, session } = getWahaConfig();

    // WAHA media download endpoint
    const url = `${baseUrl}/api/${session}/media?messageId=${encodeURIComponent(id)}`;
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers["X-Api-Key"] = apiKey;
    }

    const mediaRes = await fetch(url, { headers });

    if (!mediaRes.ok) {
      const err = await mediaRes.text();
      console.error("[WAHA] Failed to fetch media:", err);
      return NextResponse.json(
        { message: "Failed to fetch media from WAHA" },
        { status: mediaRes.status }
      );
    }

    const contentType =
      mediaRes.headers.get("content-type") || "application/octet-stream";
    const body = mediaRes.body;

    return new Response(body as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[WAHA] Media proxy error:", error);
    return NextResponse.json(
      { message: "Internal error fetching WhatsApp media" },
      { status: 500 }
    );
  }
}
