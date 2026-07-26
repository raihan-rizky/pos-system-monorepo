import { describe, expect, it, vi } from "vitest";
import {
  deleteMediaFromR2,
  getR2MediaObjectKey,
  uploadMediaToR2,
} from "../r2-media-storage";

const VALID_ENV = {
  R2_ACCOUNT_ID: "account-1",
  R2_ACCESS_KEY_ID: "access-key",
  R2_SECRET_ACCESS_KEY: "secret-key",
  R2_BUCKET_NAME: "pos-media",
  R2_ENDPOINT: "https://account-1.r2.cloudflarestorage.com",
  R2_PUBLIC_BASE_URL: "https://pub-example.r2.dev",
};

describe("R2 media storage", () => {
  it("uploads product media with the requested object key", async () => {
    const send = vi.fn().mockResolvedValue({});

    await expect(
      uploadMediaToR2(
        {
          body: Buffer.from([1, 2, 3]),
          mimeType: "image/webp",
          objectKey: "products/0123456789abcdef.webp",
        },
        { env: VALID_ENV, send },
      ),
    ).resolves.toEqual({
      objectKey: "products/0123456789abcdef.webp",
      url: "https://pub-example.r2.dev/products/0123456789abcdef.webp",
    });

    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: "pos-media",
      Key: "products/0123456789abcdef.webp",
      ContentType: "image/webp",
    });
  });

  it("deletes only product or expense media keys", async () => {
    const send = vi.fn().mockResolvedValue({});

    await expect(
      deleteMediaFromR2("expenses/0123456789abcdef.pdf", {
        env: VALID_ENV,
        send,
      }),
    ).resolves.toEqual({ objectKey: "expenses/0123456789abcdef.pdf" });

    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: "pos-media",
      Key: "expenses/0123456789abcdef.pdf",
    });
    expect(() => getR2MediaObjectKey("../secret.txt")).toThrow(
      "Path media R2 tidak valid.",
    );
    expect(() => getR2MediaObjectKey("proofs/expense/a.webp")).toThrow(
      "Path media R2 tidak valid.",
    );
  });
});
