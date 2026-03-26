import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/wa/media/[id]
 * Proxies WhatsApp media downloads through Meta Graph API.
 * The `id` param is the WhatsApp media ID (e.g. "933807996004982").
 *
 * Flow:
 * 1. Fetch media metadata from Graph API to get the download URL
 * 2. Download the actual binary from the returned URL
 * 3. Stream it back to the client with proper content-type
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = process.env.WHATSAPP_TOKEN;

  if (!token) {
    return NextResponse.json(
      { message: "WHATSAPP_TOKEN is not configured" },
      { status: 500 }
    );
  }

  try {
    // Step 1: Get the media URL from Graph API
    const metaRes = await fetch(`https://graph.facebook.com/v21.0/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!metaRes.ok) {
      const err = await metaRes.text();
      console.error("Failed to fetch WA media metadata:", err);
      return NextResponse.json(
        { message: "Failed to fetch media info from WhatsApp" },
        { status: metaRes.status }
      );
    }

    const metaData = await metaRes.json();
    const mediaUrl: string = metaData.url;

    if (!mediaUrl) {
      return NextResponse.json(
        { message: "No download URL returned by WhatsApp" },
        { status: 404 }
      );
    }

    // Step 2: Download the actual media binary
    const mediaRes = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!mediaRes.ok) {
      console.error("Failed to download WA media binary:", mediaRes.status);
      return NextResponse.json(
        { message: "Failed to download media from WhatsApp" },
        { status: mediaRes.status }
      );
    }

    // Step 3: Stream the binary back with correct content-type
    const contentType = mediaRes.headers.get("content-type") || "application/octet-stream";
    const body = mediaRes.body;

    return new Response(body as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400", // Cache for 24h since WA media expires
      },
    });
  } catch (error) {
    console.error("WA media proxy error:", error);
    return NextResponse.json(
      { message: "Internal error fetching WhatsApp media" },
      { status: 500 }
    );
  }
}
