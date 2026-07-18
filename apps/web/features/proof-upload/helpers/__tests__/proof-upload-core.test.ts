import { describe, expect, it } from "vitest";
import {
  MAX_PROOF_FILE_SIZE_BYTES,
  getProofUploadPolicy,
  isConfiguredR2PublicUrl,
  shouldRevealPrntScFallback,
  validateProofFile,
} from "../proof-upload-core";

describe("proof upload core", () => {
  it("maps supported contexts to fixed permissions and prefixes", () => {
    expect(getProofUploadPolicy("expense")).toMatchObject({
      resource: "expense",
      action: "create",
      prefix: "proofs/expenses",
    });
    expect(getProofUploadPolicy("transaction")).toMatchObject({
      resource: "transaction",
      action: "update",
      prefix: "proofs/transactions",
    });
    expect(getProofUploadPolicy("damaged-product")).toMatchObject({
      resource: "inventory",
      action: "update",
      prefix: "proofs/damaged-products",
      requiresStore: true,
    });
    expect(getProofUploadPolicy("weekly-cleaning")).toMatchObject({
      resource: "inventory",
      action: "update",
      prefix: "proofs/weekly-cleaning",
      requiresStore: true,
    });
    expect(getProofUploadPolicy("unknown")).toBeNull();
  });

  it("accepts the configured image types up to and including 5 MB", () => {
    const result = validateProofFile({
      type: "image/webp",
      size: MAX_PROOF_FILE_SIZE_BYTES,
    });

    expect(result).toEqual({ ok: true, extension: ".webp" });
  });

  it("rejects unsupported image types without enabling fallback", () => {
    expect(validateProofFile({ type: "image/svg+xml", size: 100 })).toEqual({
      ok: false,
      status: 415,
      message: "Format file tidak didukung. Gunakan JPEG, PNG, WebP, GIF, atau AVIF.",
    });
    expect(shouldRevealPrntScFallback(415)).toBe(false);
  });

  it("rejects files over 5 MB without enabling fallback", () => {
    expect(
      validateProofFile({
        type: "image/png",
        size: MAX_PROOF_FILE_SIZE_BYTES + 1,
      }),
    ).toEqual({
      ok: false,
      status: 413,
      message: "Ukuran file terlalu besar. Maksimum 5 MB.",
    });
    expect(shouldRevealPrntScFallback(413)).toBe(false);
  });

  it("reveals fallback only for network or server-side upload failures", () => {
    expect(shouldRevealPrntScFallback(null)).toBe(true);
    expect(shouldRevealPrntScFallback(500)).toBe(true);
    expect(shouldRevealPrntScFallback(503)).toBe(true);
    expect(shouldRevealPrntScFallback(401)).toBe(false);
    expect(shouldRevealPrntScFallback(403)).toBe(false);
    expect(shouldRevealPrntScFallback(422)).toBe(false);
    expect(
      shouldRevealPrntScFallback(422, "PROOF_PREPROCESSING_FAILED"),
    ).toBe(true);
  });

  it("recognizes only URLs from the exact configured R2 public origin", () => {
    const baseUrl = "https://pub-example.r2.dev";

    expect(
      isConfiguredR2PublicUrl(
        "https://pub-example.r2.dev/proofs/weekly-cleaning/store-1/image.jpg",
        baseUrl,
      ),
    ).toBe(true);
    expect(
      isConfiguredR2PublicUrl("https://pub-example.r2.dev.evil.test/image.jpg", baseUrl),
    ).toBe(false);
    expect(isConfiguredR2PublicUrl("https://prnt.sc/abc123", baseUrl)).toBe(false);
  });
});
