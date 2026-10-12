import { afterEach, describe, expect, it, vi } from "vitest";
import { listShoppingRequests } from "../shopping-requests-api";

describe("query status penerimaan Daftar Belanja", () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each(["NOT_RECEIVED", "PARTIALLY_RECEIVED", "RECEIVED"] as const)("sends %s with existing search and pagination parameters", async (fulfillmentStatus) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] })));
    vi.stubGlobal("fetch", fetchMock);
    await listShoppingRequests({ q: "Data Print", status: "APPROVED", page: 2, limit: 10, fulfillmentStatus } as Parameters<typeof listShoppingRequests>[0] & { fulfillmentStatus: string });
    const url = new URL(fetchMock.mock.calls[0][0], "http://localhost");
    expect(url.searchParams.get("fulfillmentStatus")).toBe(fulfillmentStatus);
    expect(url.searchParams.get("q")).toBe("Data Print");
    expect(url.searchParams.get("status")).toBe("APPROVED");
    expect(url.searchParams.get("page")).toBe("2");
  });
});
