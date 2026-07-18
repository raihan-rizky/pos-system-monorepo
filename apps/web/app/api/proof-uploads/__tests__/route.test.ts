import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const uploadProofToR2Mock = vi.hoisted(() => vi.fn());
const preprocessProofImageMock = vi.hoisted(() => vi.fn());
const deleteProofFromR2Mock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/proof-upload/server/r2-proof-storage", () => ({
  uploadProofToR2: uploadProofToR2Mock,
  deleteProofFromR2: deleteProofFromR2Mock,
  isProofStorageUnavailableError: (error: unknown) =>
    error instanceof Error && error.name === "ProofStorageUnavailableError",
  isInvalidProofObjectError: (error: unknown) =>
    error instanceof Error && error.name === "InvalidProofObjectError",
}));

vi.mock("@/features/proof-upload/server/preprocess-proof-image", () => ({
  preprocessProofImage: preprocessProofImageMock,
  isProofPreprocessingError: (error: unknown) =>
    error instanceof Error && error.name === "ProofPreprocessingError",
}));

function makeRequest(input: { context?: string; file?: File; rotation?: string }) {
  const formData = new FormData();
  if (input.context) formData.set("context", input.context);
  if (input.file) formData.set("file", input.file);
  if (input.rotation) formData.set("rotation", input.rotation);
  return new Request("http://localhost/api/proof-uploads", {
    method: "POST",
    body: formData,
  });
}

describe("POST /api/proof-uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      storeId: "store-main",
    });
    uploadProofToR2Mock.mockResolvedValue({
      objectKey: "proofs/weekly-cleaning/store-main/abc123.webp",
      url: "https://pub-example.r2.dev/proofs/weekly-cleaning/store-main/abc123.webp",
    });
    preprocessProofImageMock.mockResolvedValue({
      buffer: Buffer.from([4, 5]),
      mimeType: "image/webp",
      extension: ".webp",
      width: 1200,
      height: 800,
      inputBytes: 3,
      outputBytes: 2,
    });
    deleteProofFromR2Mock.mockResolvedValue({ objectKey: "proofs/expenses/store-main/abc.webp" });
  });

  it("uploads a valid proof using the context permission and store scope", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "proof.jpg", {
      type: "image/jpeg",
    });

    const response = await POST(
      makeRequest({ context: "weekly-cleaning", file, rotation: "90" }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(requirePermissionMock).toHaveBeenCalledWith("inventory", "update");
    expect(preprocessProofImageMock).toHaveBeenCalledWith(
      Buffer.from([1, 2, 3]),
      "image/jpeg",
      90,
    );
    expect(uploadProofToR2Mock).toHaveBeenCalledWith(
      expect.objectContaining({
        body: Buffer.from([4, 5]),
        mimeType: "image/webp",
        prefix: "proofs/weekly-cleaning",
        scopeId: "store-main",
        extension: ".webp",
      }),
    );
    expect(body.data.url).toContain("pub-example.r2.dev");
    expect(body.data).toMatchObject({
      width: 1200,
      height: 800,
      inputBytes: 3,
      outputBytes: 2,
    });
  });

  it("rejects a rotation that is not a quarter turn", async () => {
    const response = await POST(
      makeRequest({
        context: "expense",
        file: new File(["x"], "proof.png", { type: "image/png" }),
        rotation: "45",
      }),
    );

    expect(response.status).toBe(422);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(preprocessProofImageMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown context before checking permissions", async () => {
    const response = await POST(
      makeRequest({
        context: "unknown",
        file: new File(["x"], "proof.png", { type: "image/png" }),
      }),
    );

    expect(response.status).toBe(422);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(uploadProofToR2Mock).not.toHaveBeenCalled();
  });

  it("rejects an oversized file without calling R2", async () => {
    const oversizedFile = {
      name: "proof.png",
      type: "image/png",
      size: 5 * 1024 * 1024 + 1,
      arrayBuffer: vi.fn(),
    } as unknown as File;
    const formData = {
      get: (key: string) => {
        if (key === "context") return "expense";
        if (key === "file") return oversizedFile;
        return null;
      },
    };
    const request = {
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(413);
    expect(uploadProofToR2Mock).not.toHaveBeenCalled();
  });

  it("returns a retryable 503 when R2 storage is unavailable", async () => {
    const error = new Error("R2 unavailable");
    error.name = "ProofStorageUnavailableError";
    uploadProofToR2Mock.mockRejectedValue(error);

    const response = await POST(
      makeRequest({
        context: "transaction",
        file: new File(["x"], "proof.webp", { type: "image/webp" }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.message).toBe("Penyimpanan R2 sedang tidak tersedia. Silakan coba lagi.");
  });

  it("returns a fallback-enabled code when preprocessing fails", async () => {
    const error = new Error("cannot process");
    error.name = "ProofPreprocessingError";
    preprocessProofImageMock.mockRejectedValue(error);

    const response = await POST(
      makeRequest({
        context: "expense",
        file: new File(["valid-enough-for-mock"], "proof.png", {
          type: "image/png",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.code).toBe("PROOF_PREPROCESSING_FAILED");
    expect(uploadProofToR2Mock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/proof-uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({ id: "owner-1", storeId: "store-main" });
    deleteProofFromR2Mock.mockResolvedValue({ objectKey: "proofs/expenses/store-main/abc.webp" });
  });

  it("requires proof delete permission and deletes the R2 object", async () => {
    const url = "https://pub-example.r2.dev/proofs/expenses/store-main/abc.webp";
    const response = await DELETE(
      new Request("http://localhost/api/proof-uploads", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      }),
    );

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("proof_upload", "delete");
    expect(deleteProofFromR2Mock).toHaveBeenCalledWith(url);
  });

  it("rejects URLs outside the configured proof namespace", async () => {
    const error = new Error("invalid");
    error.name = "InvalidProofObjectError";
    deleteProofFromR2Mock.mockRejectedValue(error);
    const response = await DELETE(
      new Request("http://localhost/api/proof-uploads", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://prnt.sc/legacy" }),
      }),
    );

    expect(response.status).toBe(422);
    expect((await response.json()).message).toContain("bukti R2");
  });
});
