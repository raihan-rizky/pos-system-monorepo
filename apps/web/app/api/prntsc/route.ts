import { NextResponse } from "next/server";
import { handleAuthError, requireRole } from "@/lib/rbac/guard";
import {
  extractPrntScImageUrl,
  fetchWithPrntScTimeout,
  parsePrntScImageUrl,
  parsePrntScPageUrl,
  PRNTSC_USER_AGENT,
} from "@/lib/prntsc";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    await requireRole("OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY");

    const { searchParams } = new URL(request.url);
    const prntscUrl = parsePrntScPageUrl(searchParams.get("url"));
    const wantsJson = searchParams.get("json") === "true";

    if (!prntscUrl) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const res = await fetchWithPrntScTimeout(prntscUrl.toString(), {
      headers: {
        "User-Agent": PRNTSC_USER_AGENT,
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch prnt.sc" }, { status: 500 });
    }

    const html = await res.text();
    const rawImageUrl = extractPrntScImageUrl(html);

    if (rawImageUrl) {
      const imageUrl = parsePrntScImageUrl(rawImageUrl);

      if (!imageUrl) {
        return NextResponse.json({ error: "Unsupported image URL" }, { status: 422 });
      }

      if (wantsJson) {
        return NextResponse.json({ imageUrl: imageUrl.toString() });
      }

      const imgRes = await fetchWithPrntScTimeout(imageUrl.toString(), {
        headers: {
          "User-Agent": PRNTSC_USER_AGENT,
          "Referer": prntscUrl.toString(),
        }
      });
      
      if (imgRes.ok) {
        const contentType = imgRes.headers.get("content-type") || "";
        const contentLength = Number(imgRes.headers.get("content-length") || "0");

        if (!contentType.startsWith("image/")) {
          return NextResponse.json({ error: "Unsupported image response" }, { status: 502 });
        }

        if (contentLength > MAX_IMAGE_BYTES) {
          return NextResponse.json({ error: "Image too large" }, { status: 413 });
        }

        const buffer = await imgRes.arrayBuffer();
        if (buffer.byteLength > MAX_IMAGE_BYTES) {
          return NextResponse.json({ error: "Image too large" }, { status: 413 });
        }

        return new NextResponse(buffer, {
          headers: {
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
      
      return NextResponse.redirect(imageUrl);
    } else {
      return NextResponse.json({ error: "Image not found on prnt.sc page" }, { status: 404 });
    }
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    return NextResponse.json({ error: "Error fetching" }, { status: 500 });
  }
}
