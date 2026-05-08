import { NextResponse } from "next/server";
import { getWahaConfig, isWaConfigured } from "@/lib/whatsapp";
import { requireRole, handleAuthError } from "@/lib/rbac/guard";

export const dynamic = "force-dynamic";

function isSafeFilename(value: string) {
  return /^[A-Za-z0-9._-]+$/.test(value) && !value.startsWith(".");
}

function resolveWahaFileUrl({
  id,
  baseUrl,
  session,
}: {
  id: string;
  baseUrl: string;
  session: string;
}) {
  const configuredBase = new URL(baseUrl);
  const decoded = decodeURIComponent(id);

  if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
    const urlObj = new URL(decoded);
    const isLocalWahaUrl =
      urlObj.hostname === "localhost" || urlObj.hostname === "127.0.0.1";

    if (!isLocalWahaUrl && urlObj.origin !== configuredBase.origin) {
      throw new Error("INVALID_MEDIA_URL");
    }

    const expectedPrefix = `/api/files/${session}/`;
    if (!urlObj.pathname.startsWith(expectedPrefix)) {
      throw new Error("INVALID_MEDIA_URL");
    }

    return `${configuredBase.origin}${urlObj.pathname}${urlObj.search}`;
  }

  if (!isSafeFilename(decoded)) {
    throw new Error("INVALID_MEDIA_URL");
  }

  return `${configuredBase.origin}/api/files/${session}/${decoded}`;
}

/**
 * GET /api/wa/media/[id]
 *
 * Proxies WAHA media file downloads through our Next.js backend.
 *
 * Architecture (on-demand / lazy loading):
 *  1. Frontend clicks a contact → messages are fetched with `downloadMedia=true`.
 *  2. WAHA processes media and stores files locally, returning URLs like:
 *       http://localhost:3000/api/files/default/<FILENAME>.jpeg
 *  3. That full URL (or just the filename) is stored as `image_url` on the message.
 *  4. When the frontend wants to render an image it calls:
 *       GET /api/wa/media/<FILENAME>.jpeg
 *     OR with full url encoded:
 *       GET /api/wa/media/<encoded-full-url>
 *  5. THIS route adds the WAHA X-Api-Key header and streams the file back to the browser.
 *     The browser never touches WAHA directly — no CORS, no credentials leakage.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startTime = performance.now();
  const { id } = await params;

  console.log(`[WA/Media] GET request — id=${id}`);

  if (!isWaConfigured()) {
    console.warn(`[WA/Media] WAHA not configured — returning 503`);
    return NextResponse.json(
      { message: "WAHA is not configured" },
      { status: 503 },
    );
  }

  try {
    await requireRole("OWNER", "ADMIN");
    const { baseUrl, apiKey, session } = getWahaConfig();

    // ── Resolve the actual download URL ─────────────────────────────────────
    //
    // The `id` param can be one of:
    //   (a) A bare filename:     "AC3D0CE3840F1E65B92C7A6A32D883F3.jpeg"
    //   (b) A URL-encoded full WAHA file URL:
    //       "http%3A%2F%2Flocalhost%3A3000%2Fapi%2Ffiles%2Fdefault%2FAC3D...jpeg"
    //
    // In both cases we want to call WAHA's /api/files/{session}/{filename} endpoint
    // (or the full URL if it was explicitly provided) and stream the bytes back.

    let fileUrl: string;

    // Check if the id is a full URL (encoded or not)
    const decoded = decodeURIComponent(id);
    if (decoded.startsWith("http://") || decoded.startsWith("https://")) {
      // Case (b): the frontend passed a full URL.
      // ⚠️ IMPORTANT: If the URL contains 'localhost' or '127.0.0.1', it likely came 
      // from a local WAHA instance but we are now running in production (Vercel).
      // We must replace the local address with our actual configured baseUrl.
      if (decoded.includes("localhost:") || decoded.includes("127.0.0.1:")) {
        console.log(`[WA/Media] 🔄 Patching localhost URL to use configured baseUrl`);
        // Extract the path after the domain (e.g. /api/files/default/abc.jpg)
        const urlObj = new URL(decoded);
        fileUrl = `${baseUrl}${urlObj.pathname}${urlObj.search}`;
      } else {
        fileUrl = decoded;
      }
    } else {
      // Case (a): bare filename — construct the standard WAHA files endpoint.
      fileUrl = `${baseUrl}/api/files/${session}/${id}`;
    }
    fileUrl = resolveWahaFileUrl({ id, baseUrl, session });

    const headers: Record<string, string> = {
      Accept: "image/*, video/*, audio/*, application/octet-stream, */*",
    };
    if (apiKey) {
      headers["X-Api-Key"] = apiKey;
    }

    console.log(`[WA/Media] Fetching from WAHA: ${fileUrl}`);
    const mediaRes = await fetch(fileUrl, { headers });

    if (!mediaRes.ok) {
      const errText = await mediaRes.text();
      const duration = (performance.now() - startTime).toFixed(1);
      console.error(
        `[WA/Media] ❌ WAHA returned ${mediaRes.status} after ${duration}ms:`,
        errText,
      );
      return NextResponse.json(
        { message: "Failed to fetch media from WAHA", detail: errText },
        { status: mediaRes.status },
      );
    }

    const contentType =
      mediaRes.headers.get("content-type") || "application/octet-stream";

    const duration = (performance.now() - startTime).toFixed(1);
    console.log(
      `[WA/Media] ✅ Streaming media (type=${contentType}) for id=${id} in ${duration}ms`,
    );

    // Stream the binary directly to the browser — no buffering, memory-efficient.
    return new Response(mediaRes.body as ReadableStream, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Allow aggressive browser caching — WAHA filenames are content-addressed.
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch (error: any) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (error?.message === "INVALID_MEDIA_URL") {
      return NextResponse.json(
        { message: "Invalid media URL" },
        { status: 400 },
      );
    }

    const duration = (performance.now() - startTime).toFixed(1);
    console.error(
      `[WA/Media] ❌ Proxy error after ${duration}ms:`,
      error.message || error,
    );
    return NextResponse.json(
      { message: "Internal error fetching WhatsApp media" },
      { status: 500 },
    );
  }
}
