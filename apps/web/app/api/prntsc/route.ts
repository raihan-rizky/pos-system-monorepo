import { NextResponse } from "next/server";
import { handleAuthError, requireRole } from "@/lib/rbac/guard";

const PRNTSC_HOSTS = new Set(["prnt.sc", "www.prnt.sc"]);
const ALLOWED_IMAGE_HOSTS = new Set(["image.prntscr.com", "prnt.sc", "www.prnt.sc", "img.lightshot.app"]);
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function parseAllowedUrl(rawUrl: string | null, allowedHosts: Set<string>) {
  if (!rawUrl) return null;

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return null;
    if (!allowedHosts.has(parsed.hostname.toLowerCase())) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  try {
    await requireRole("OWNER", "ADMIN", "CASHIER", "SALES");

    const { searchParams } = new URL(request.url);
    const prntscUrl = parseAllowedUrl(searchParams.get("url"), PRNTSC_HOSTS);
    const wantsJson = searchParams.get("json") === "true";

    if (!prntscUrl) {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }

    const res = await fetchWithTimeout(prntscUrl, {
      headers: {
        "User-Agent": USER_AGENT,
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch prnt.sc" }, { status: 500 });
    }

    const html = await res.text();
    const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/<meta\s+name="twitter:image:src"\s+content="([^"]+)"/i);

    if (match && match[1]) {
      const imageUrl = parseAllowedUrl(match[1], ALLOWED_IMAGE_HOSTS);

      if (!imageUrl) {
        return NextResponse.json({ error: "Unsupported image URL" }, { status: 422 });
      }

      if (wantsJson) {
        return NextResponse.json({ imageUrl: imageUrl.toString() });
      }

      const imgRes = await fetchWithTimeout(imageUrl, {
        headers: {
          "User-Agent": USER_AGENT,
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
