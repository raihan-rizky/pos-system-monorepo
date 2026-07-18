import { describe, expect, it, vi } from "vitest";
import { removeStoredProofAsset } from "../remove-stored-proof";

describe("removeStoredProofAsset", () => {
  it("clears a legacy prnt.sc reference without deleting an object", async () => {
    const deleteR2 = vi.fn();
    await expect(
      removeStoredProofAsset("https://prnt.sc/abc123", deleteR2),
    ).resolves.toEqual({ storage: "legacy" });
    expect(deleteR2).not.toHaveBeenCalled();
  });

  it("deletes an R2 proof before its database reference is cleared", async () => {
    const deleteR2 = vi.fn().mockResolvedValue({ objectKey: "proofs/a.webp" });
    await expect(
      removeStoredProofAsset("https://pub-example.r2.dev/proofs/a.webp", deleteR2),
    ).resolves.toEqual({ storage: "r2", objectKey: "proofs/a.webp" });
  });

  it("rejects unknown proof hosts", async () => {
    const invalid = new Error("invalid");
    invalid.name = "InvalidProofObjectError";
    await expect(
      removeStoredProofAsset("https://evil.test/a.webp", vi.fn().mockRejectedValue(invalid)),
    ).rejects.toThrow("Tautan bukti tidak dikenali");
  });
});
