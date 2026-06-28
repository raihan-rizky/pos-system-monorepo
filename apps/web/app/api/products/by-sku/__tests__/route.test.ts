import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const productFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    product: { findMany: productFindManyMock },
  },
}));

function req(body: unknown) {
  return new NextRequest("http://localhost/api/products/by-sku", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/products/by-sku", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requirePermissionMock.mockResolvedValue({ id: "u1", storeId: "store-main" });
    handleAuthErrorMock.mockReturnValue(null);
    productFindManyMock.mockResolvedValue([]);
  });

  it("returns matching sku→id pairs", async () => {
    productFindManyMock.mockResolvedValue([
      { id: "prod-1", sku: "atk-027" },
      { id: "prod-2", sku: "atk-028" },
    ]);

    const res = await POST(req({ skus: ["atk-027", "atk-028", "atk-999"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toHaveLength(2);
    expect(body.results).toEqual(
      expect.arrayContaining([
        { id: "prod-1", sku: "atk-027" },
        { id: "prod-2", sku: "atk-028" },
      ]),
    );
  });

  it("returns empty results when no SKUs match", async () => {
    productFindManyMock.mockResolvedValue([]);

    const res = await POST(req({ skus: ["nonexistent-sku"] }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual([]);
  });

  it("422 for empty skus array", async () => {
    const res = await POST(req({ skus: [] }));
    expect(res.status).toBe(422);
  });

  it("422 when skus is not an array", async () => {
    const res = await POST(req({ skus: "atk-027" }));
    expect(res.status).toBe(422);
  });

  it("422 when skus key missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(422);
  });

  it("queries only active products within the store", async () => {
    await POST(req({ skus: ["atk-027"] }));

    expect(productFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-main",
          isActive: true,
          sku: { in: ["atk-027"] },
        }),
      }),
    );
  });

  it("uses store-main fallback when storeId is null", async () => {
    requirePermissionMock.mockResolvedValue({ id: "u1", storeId: null });

    await POST(req({ skus: ["atk-027"] }));

    expect(productFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ storeId: "store-main" }),
      }),
    );
  });

  it("returns 401 on auth error", async () => {
    requirePermissionMock.mockRejectedValue(new Error("Unauthorized"));
    handleAuthErrorMock.mockReturnValue(
      new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 }),
    );

    const res = await POST(req({ skus: ["atk-027"] }));
    expect(res.status).toBe(401);
  });
});
