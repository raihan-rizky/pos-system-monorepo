import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  handleAuthError: vi.fn(),
  findProduct: vi.fn(),
  readImage: vi.fn(),
}));

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: mocks.requirePermission,
  handleAuthError: mocks.handleAuthError,
}));
vi.mock("@pos/db", () => ({ db: { product: { findFirst: mocks.findProduct } } }));
vi.mock("@/features/upload/server/r2-media-storage", () => ({
  readProductImageFromR2: mocks.readImage,
}));

describe("GET /api/products/[id]/thumbnail", () => {
  const request = new Request("http://localhost/api/products/kertas/thumbnail");
  const params = { params: Promise.resolve({ id: "kertas" }) };
  const imageUrl = "https://assets.example.test/products/kertas.png";

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requirePermission.mockResolvedValue({ storeId: "store-1" });
    mocks.findProduct.mockResolvedValue({ imageUrl });
  });

  it("returns the authenticated store's product photo from storage", async () => {
    const body = new Response("product photo").body;
    mocks.readImage.mockResolvedValue({ body, contentType: "image/png" });

    const response = await GET(request, params);

    expect(mocks.requirePermission).toHaveBeenCalledWith("product", "read");
    expect(mocks.findProduct).toHaveBeenCalledWith({
      where: { id: "kertas", storeId: "store-1" },
      select: { imageUrl: true },
    });
    expect(mocks.readImage).toHaveBeenCalledWith(imageUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("product photo");
  });

  it("denies unauthorized readers before querying the product", async () => {
    const error = new Error("forbidden");
    mocks.requirePermission.mockRejectedValue(error);
    mocks.handleAuthError.mockReturnValue(NextResponse.json({}, { status: 403 }));

    const response = await GET(request, params);

    expect(response.status).toBe(403);
    expect(mocks.handleAuthError).toHaveBeenCalledWith(error);
    expect(mocks.findProduct).not.toHaveBeenCalled();
    expect(mocks.readImage).not.toHaveBeenCalled();
  });

  it("does not request storage for products outside the reader's store", async () => {
    mocks.findProduct.mockResolvedValue(null);

    expect((await GET(request, params)).status).toBe(404);
    expect(mocks.readImage).not.toHaveBeenCalled();
  });

  it("returns an error status so the browser can show its default image", async () => {
    mocks.readImage.mockRejectedValue(new Error("storage unavailable"));

    expect((await GET(request, params)).status).toBe(503);
  });
});
