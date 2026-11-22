import { describe, expect, it } from "vitest";
import { runManagedProofCleanupOnce, type ManagedProofCleanupStore } from "../managed-proof-cleanup";

function fixture() {
  const item = {
    id: "proof-1", accountId: "account-1", bucket: "private-proofs",
    key: "managed-proofs/v1/0123456789abcdef0123456789abcdef.webp",
    state: "deleting", leaseId: null as string | null, leaseUntil: 0,
    retryAt: 0, attempts: 0,
  };
  const objects = new Set([item.key]);
  let now = 0;
  let enabled = true;
  let failConfirmation = false;
  const store: ManagedProofCleanupStore = {
    async claim() {
      if (!enabled || item.state !== "deleting" || item.retryAt > now || item.leaseUntil > now) return null;
      item.attempts += 1;
      item.leaseId = `lease-${item.attempts}`;
      item.leaseUntil = now + 120_000;
      return { id: item.id, accountId: item.accountId, bucket: item.bucket, key: item.key, leaseId: item.leaseId };
    },
    async confirmDeleted(claim) {
      if (failConfirmation) throw new Error("database disconnected");
      if (item.state !== "deleting" || item.leaseId !== claim.leaseId) return false;
      item.state = "deleted";
      item.leaseId = null;
      item.leaseUntil = 0;
      return true;
    },
    async retry(claim) {
      if (item.state !== "deleting" || item.leaseId !== claim.leaseId) return false;
      item.leaseId = null;
      item.leaseUntil = 0;
      item.retryAt = now + 60_000;
      return true;
    },
  };
  return {
    item, objects, store,
    advance(ms: number) { now += ms; },
    disable() { enabled = false; },
    failConfirmation(value: boolean) { failConfirmation = value; },
    async remove(claim: { key: string }) { objects.delete(claim.key); },
  };
}

describe("managed proof cleanup worker", () => {
  it("does not delete an object while cleanup is disabled", async () => {
    const f = fixture();
    f.disable();
    expect(await runManagedProofCleanupOnce(f.store, f.remove)).toBe("idle");
    expect(f.objects.has(f.item.key)).toBe(true);
    expect(f.item.state).toBe("deleting");
  });

  it("retries after a lost DELETE response and completes idempotently", async () => {
    const f = fixture();
    expect(await runManagedProofCleanupOnce(f.store, async claim => {
      await f.remove(claim);
      throw new Error("response lost");
    })).toBe("retry");
    expect(f.item.state).toBe("deleting");
    expect(await runManagedProofCleanupOnce(f.store, f.remove)).toBe("idle");
    f.advance(60_000);
    expect(await runManagedProofCleanupOnce(f.store, f.remove)).toBe("deleted");
    expect(f.item.state).toBe("deleted");
    expect(f.item.attempts).toBe(2);
    expect(f.objects.has(f.item.key)).toBe(false);
  });

  it("recovers after a crash between DELETE and database confirmation", async () => {
    const f = fixture();
    f.failConfirmation(true);
    await expect(runManagedProofCleanupOnce(f.store, f.remove)).rejects.toThrow("database disconnected");
    expect(f.item.state).toBe("deleting");
    f.failConfirmation(false);
    expect(await runManagedProofCleanupOnce(f.store, f.remove)).toBe("idle");
    f.advance(120_000);
    expect(await runManagedProofCleanupOnce(f.store, f.remove)).toBe("deleted");
    expect(f.item.attempts).toBe(2);
  });

  it("does not allow an expired worker lease to overwrite a newer completion", async () => {
    const f = fixture();
    let release!: () => void;
    let started!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const entered = new Promise<void>(resolve => { started = resolve; });
    const first = runManagedProofCleanupOnce(f.store, async claim => {
      started();
      await pending;
      await f.remove(claim);
    });
    await entered;
    f.advance(120_000);
    expect(await runManagedProofCleanupOnce(f.store, f.remove)).toBe("deleted");
    release();
    expect(await first).toBe("superseded");
    expect(f.item.state).toBe("deleted");
  });
});
