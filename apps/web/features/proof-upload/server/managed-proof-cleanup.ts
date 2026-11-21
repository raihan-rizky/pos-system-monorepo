export type ManagedProofCleanupClaim = {
  id: string;
  accountId: string;
  bucket: string;
  key: string;
  leaseId: string;
};

export type ManagedProofCleanupStore = {
  claim(): Promise<ManagedProofCleanupClaim | null>;
  confirmDeleted(claim: ManagedProofCleanupClaim): Promise<boolean>;
  retry(claim: ManagedProofCleanupClaim): Promise<boolean>;
};

export async function runManagedProofCleanupOnce(
  store: ManagedProofCleanupStore,
  deleteObject: (claim: ManagedProofCleanupClaim) => Promise<void>,
): Promise<"idle" | "deleted" | "retry" | "superseded"> {
  const claim = await store.claim();
  if (!claim) return "idle";

  try {
    await deleteObject(claim);
  } catch {
    return await store.retry(claim) ? "retry" : "superseded";
  }

  return await store.confirmDeleted(claim) ? "deleted" : "superseded";
}
