import { describe, expect, it, vi } from "vitest";
import {
  deleteProofFromR2,
  getR2ProofStorageConfig,
  getR2ProofObjectKey,
  uploadProofToR2,
} from "../r2-proof-storage";

const VALID_ENV = {
  R2_ACCOUNT_ID: "account-1",
  R2_ACCESS_KEY_ID: "access-key",
  R2_SECRET_ACCESS_KEY: "secret-key",
  R2_BUCKET_NAME: "pos-media",
  R2_ENDPOINT: "https://account-1.r2.cloudflarestorage.com",
  R2_PUBLIC_BASE_URL: "https://pub-example.r2.dev",
};

describe("R2 proof storage", () => {
  it("rejects incomplete server configuration without exposing secret values", () => {
    expect(() => getR2ProofStorageConfig({ R2_BUCKET_NAME: "pos-media" })).toThrow(
      "Konfigurasi penyimpanan R2 belum lengkap.",
    );
  });

  it("uploads a proof with a server-generated key and returns its public URL", async () => {
    const send = vi.fn().mockResolvedValue({});
    const result = await uploadProofToR2(
      {
        body: Buffer.from([1, 2, 3]),
        mimeType: "image/webp",
        prefix: "proofs/expenses",
        scopeId: "store-main",
        extension: ".webp",
      },
      {
        env: VALID_ENV,
        randomHex: () => "0123456789abcdef0123456789abcdef",
        send,
      },
    );

    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0];
    expect(command.input).toMatchObject({
      Bucket: "pos-media",
      Key: "proofs/expenses/store-main/0123456789abcdef0123456789abcdef.webp",
      ContentType: "image/webp",
    });
    expect(result).toEqual({
      objectKey: "proofs/expenses/store-main/0123456789abcdef0123456789abcdef.webp",
      url: "https://pub-example.r2.dev/proofs/expenses/store-main/0123456789abcdef0123456789abcdef.webp",
    });
  });

  it("deletes only proof objects from the exact configured public origin", async () => {
    const send = vi.fn().mockResolvedValue({});
    const url = "https://pub-example.r2.dev/proofs/expenses/store-main/abc.webp";

    await expect(
      deleteProofFromR2(url, { env: VALID_ENV, send }),
    ).resolves.toEqual({ objectKey: "proofs/expenses/store-main/abc.webp" });
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: "pos-media",
      Key: "proofs/expenses/store-main/abc.webp",
    });
  });

  it("rejects lookalike origins, non-proof paths, and traversal", () => {
    expect(() =>
      getR2ProofObjectKey(
        "https://pub-example.r2.dev.evil.test/proofs/a.webp",
        VALID_ENV.R2_PUBLIC_BASE_URL,
      ),
    ).toThrow("Tautan bukan bukti R2 yang dapat dihapus.");
    expect(() =>
      getR2ProofObjectKey(
        "https://pub-example.r2.dev/products/a.webp",
        VALID_ENV.R2_PUBLIC_BASE_URL,
      ),
    ).toThrow("Tautan bukan bukti R2 yang dapat dihapus.");
    expect(() =>
      getR2ProofObjectKey(
        "https://pub-example.r2.dev/proofs/%2e%2e/secret.webp",
        VALID_ENV.R2_PUBLIC_BASE_URL,
      ),
    ).toThrow("Tautan bukan bukti R2 yang dapat dihapus.");
  });
});
