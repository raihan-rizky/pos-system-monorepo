import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { createManagedProofR2Deleter } from "../managed-proof-r2";

const claim = {
  id: "proof-1", accountId: "account-1", bucket: "private-proofs",
  key: "managed-proofs/v1/0123456789abcdef0123456789abcdef.webp", leaseId: "lease-1",
};

describe("managed proof R2 deletion", () => {
  it("sends a DELETE for the registered key and bucket", async () => {
    const objects = new Set([claim.key]);
    const remove = createManagedProofR2Deleter({
      accountId: "account-1", bucket: "private-proofs",
      async send(command) {
        expect(command).toBeInstanceOf(DeleteObjectCommand);
        expect(command.input).toEqual({ Bucket: "private-proofs", Key: claim.key });
        objects.delete(command.input.Key!);
      },
    });
    await remove(claim);
    expect(objects.size).toBe(0);
  });

  it.each([
    { ...claim, accountId: "other-account" },
    { ...claim, bucket: "other-bucket" },
    { ...claim, key: "expenses/0123456789abcdef.pdf" },
    { ...claim, key: "managed-proofs/v1/%2e%2e/other.webp" },
  ])("refuses an object outside the configured managed storage: %o", async candidate => {
    const objects = new Set([claim.key]);
    const remove = createManagedProofR2Deleter({
      accountId: "account-1", bucket: "private-proofs",
      async send(command) { objects.delete(command.input.Key!); },
    });
    await expect(remove(candidate)).rejects.toThrow();
    expect(objects.has(claim.key)).toBe(true);
  });
});
