import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const uploadMediaToR2Mock = vi.hoisted(() => vi.fn());
const deleteMediaFromR2Mock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/upload/server/r2-media-storage", () => ({
  uploadMediaToR2: uploadMediaToR2Mock,
  deleteMediaFromR2: deleteMediaFromR2Mock,
  isMediaStorageUnavailableError: (error: unknown) =>
    error instanceof Error && error.name === "MediaStorageUnavailableError",
}));

function makeUploadRequest(file: File) {
  const formData = new FormData();
  formData.set("file", file);
  return new Request("http://localhost/api/finance/expenses/attachments", {
    method: "POST",
    body: formData,
  });
}

describe("expense attachment R2 storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      storeId: "store-main",
    });
    uploadMediaToR2Mock.mockResolvedValue({
      objectKey: "expenses/0123456789abcdef.pdf",
      url: "https://pub-example.r2.dev/expenses/0123456789abcdef.pdf",
    });
    deleteMediaFromR2Mock.mockResolvedValue({
      objectKey: "expenses/0123456789abcdef.pdf",
    });
  });

  it("uploads a legacy expense attachment to R2", async () => {
    const response = await POST(
      makeUploadRequest(
        new File([new Uint8Array([1, 2, 3])], "invoice.pdf", {
          type: "application/pdf",
        }),
      ),
    );

    expect(response.status).toBe(201);
    expect(uploadMediaToR2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        mimeType: "application/pdf",
        objectKey: expect.stringMatching(/^expenses\/[a-f0-9]{16}\.pdf$/),
      }),
    );
    await expect(response.json()).resolves.toEqual({
      data: {
        url: "https://pub-example.r2.dev/expenses/0123456789abcdef.pdf",
        path: "expenses/0123456789abcdef.pdf",
      },
    });
  });

  it("deletes a legacy expense attachment from R2", async () => {
    const response = await DELETE(
      new Request(
        "http://localhost/api/finance/expenses/attachments?path=expenses%2F0123456789abcdef.pdf",
        { method: "DELETE" },
      ),
    );

    expect(response.status).toBe(200);
    expect(deleteMediaFromR2Mock).toHaveBeenCalledWith(
      "expenses/0123456789abcdef.pdf",
    );
  });
});
