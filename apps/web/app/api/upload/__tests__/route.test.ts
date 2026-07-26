import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const uploadMediaToR2Mock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/upload/server/r2-media-storage", () => ({
  uploadMediaToR2: uploadMediaToR2Mock,
  isMediaStorageUnavailableError: (error: unknown) =>
    error instanceof Error && error.name === "MediaStorageUnavailableError",
}));

function makeRequest(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  return new Request("http://localhost/api/upload", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      storeId: "store-main",
    });
    uploadMediaToR2Mock.mockResolvedValue({
      objectKey: "products/0123456789abcdef.webp",
      url: "https://pub-example.r2.dev/products/0123456789abcdef.webp",
    });
  });

  it("uploads product and store media to R2", async () => {
    const response = await POST(
      makeRequest(
        new File([new Uint8Array([1, 2, 3])], "product.webp", {
          type: "image/webp",
        }),
      ),
    );

    expect(response.status).toBe(201);
    expect(uploadMediaToR2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: Buffer.from([1, 2, 3]),
        mimeType: "image/webp",
        objectKey: expect.stringMatching(/^products\/[a-f0-9]{16}\.webp$/),
      }),
    );
    await expect(response.json()).resolves.toEqual({
      url: "https://pub-example.r2.dev/products/0123456789abcdef.webp",
    });
  });

  it("returns 503 when R2 is unavailable", async () => {
    const error = new Error("R2 unavailable");
    error.name = "MediaStorageUnavailableError";
    uploadMediaToR2Mock.mockRejectedValue(error);

    const response = await POST(
      makeRequest(new File(["image"], "product.png", { type: "image/png" })),
    );

    expect(response.status).toBe(503);
    expect((await response.json()).message).toContain("R2");
  });
});
