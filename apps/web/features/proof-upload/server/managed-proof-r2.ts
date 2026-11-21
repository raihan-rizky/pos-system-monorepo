import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { ManagedProofCleanupClaim } from "./managed-proof-cleanup";

export function createManagedProofR2Deleter(config: {
  accountId: string;
  bucket: string;
  send(command: DeleteObjectCommand): Promise<unknown>;
}): (claim: ManagedProofCleanupClaim) => Promise<void> {
  return async claim => {
    if (claim.accountId !== config.accountId || claim.bucket !== config.bucket ||
        !/^managed-proofs\/v1\/[0-9a-f]{32}\.webp$/.test(claim.key)) {
      throw new Error("Objek bukti terkelola tidak cocok dengan penyimpanan yang dikonfigurasi.");
    }
    await config.send(new DeleteObjectCommand({ Bucket: claim.bucket, Key: claim.key }));
  };
}
