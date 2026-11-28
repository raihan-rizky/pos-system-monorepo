import { describe, expect, it, vi } from "vitest";
import {
  deleteMediaFromR2,
  getR2MediaObjectKey,
  readProductImageFromR2,
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
  it("reads a raster photo from the configured bucket without using the public URL", async () => {
    const body = new Response("product photo").body;
    const send = vi.fn().mockResolvedValue({
      ContentType: "image/png",
      Body: { transformToWebStream: () => body },
    });

    await expect(readProductImageFromR2(
      "https://pub-example.r2.dev/products/kertas%20baru.png",
      { env: VALID_ENV, send },
    )).resolves.toEqual({ body, contentType: "image/png" });
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: "pos-media",
      Key: "products/kertas baru.png",
    });
  });

  it.each([
    "https://other.example/products/kertas.png",
    "https://pub-example.r2.dev/expenses/document.png",
    "https://pub-example.r2.dev/products/..%2Fexpenses/document.png",
  ])("ignores photo URLs outside the product namespace: %s", async (imageUrl) => {
    const send = vi.fn();
    await expect(readProductImageFromR2(imageUrl, { env: VALID_ENV, send })).resolves.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects active image types before returning a same-origin response", async () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn().mockResolvedValue({
      ContentType: "image/svg+xml",
      Body: { transformToWebStream: () => ({ cancel }) },
    });

    await expect(readProductImageFromR2(
      "https://pub-example.r2.dev/products/invalid.svg",
      { env: VALID_ENV, send },
    )).resolves.toBeNull();
    expect(cancel).toHaveBeenCalled();
  });

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
