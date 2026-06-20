import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const wantsJson = searchParams.get("json") === "true";

  if (!url || !url.includes("prnt.sc")) {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Failed to fetch prnt.sc" }, { status: 500 });
    }

    const html = await res.text();
    const match = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/i) || html.match(/<meta\s+name="twitter:image:src"\s+content="([^"]+)"/i);

    if (match && match[1]) {
      const imageUrl = match[1];

      if (wantsJson) {
        return NextResponse.json({ imageUrl });
      }

      const imgRes = await fetch(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": url,
        }
      });
      
      if (imgRes.ok) {
        const contentType = imgRes.headers.get("content-type") || "image/png";
        const buffer = await imgRes.arrayBuffer();
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
    return NextResponse.json({ error: "Error fetching" }, { status: 500 });
  }
}
