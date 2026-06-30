import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPrntScProxyUrl,
  isPrntScUrl,
  resolvePrntScImageUrl,
} from "../prntsc";

describe("prnt.sc helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("validates only secure prnt.sc page URLs", () => {
    expect(isPrntScUrl("https://prnt.sc/abc123")).toBe(true);
    expect(isPrntScUrl("https://www.prnt.sc/abc123")).toBe(true);
    expect(isPrntScUrl("http://prnt.sc/abc123")).toBe(false);
    expect(isPrntScUrl("https://example.com/prnt.sc/abc123")).toBe(false);
  });

  it("builds the same proxy URL shape used by keuangan and history previews", () => {
    expect(getPrntScProxyUrl("https://prnt.sc/abc123")).toBe(
      "/api/prntsc?url=https%3A%2F%2Fprnt.sc%2Fabc123",
    );
    expect(getPrntScProxyUrl("https://example.com/prnt.sc/abc123")).toBeNull();
  });

  it("resolves the image URL by fetching the pasted prnt.sc page directly", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        '<meta property="og:image" content="https://image.prntscr.com/image/proof.png">',
        { status: 200 },
      ),
    );

    await expect(resolvePrntScImageUrl("https://prnt.sc/abc123")).resolves.toBe(
      "https://image.prntscr.com/image/proof.png",
    );

    expect(fetch).toHaveBeenCalledWith(
      "https://prnt.sc/abc123",
      expect.objectContaining({
        headers: expect.objectContaining({
          "User-Agent": expect.stringContaining("Mozilla"),
        }),
      }),
    );
  });

  it("rejects unsupported image hosts found in prnt.sc metadata", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('<meta property="og:image" content="https://example.com/proof.png">', {
        status: 200,
      }),
    );

    await expect(resolvePrntScImageUrl("https://prnt.sc/abc123")).resolves.toBeNull();
  });
});
