import { afterEach, beforeEach, expect, it, vi } from "vitest";

let values: Map<string, string>;

beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  });
});

afterEach(() => vi.unstubAllGlobals());

it("blocks only the cashier and store whose access was revoked", async () => {
  const { readOfflineRevocation, revokeOfflineAccess } = await import("../../../public/offline-vault.mjs");
  expect(readOfflineRevocation("cashier-1", "store-1")).toBeNull();
  revokeOfflineAccess("cashier-1", "store-1");
  expect(readOfflineRevocation("cashier-1", "store-1")).toEqual(expect.any(String));
  expect(readOfflineRevocation("cashier-2", "store-1")).toBeNull();
  expect(readOfflineRevocation("cashier-1", "store-2")).toBeNull();
});

it("does not accept a vault bound to an older revocation marker", async () => {
  const { offlineRevocationMatches, readOfflineRevocation, revokeOfflineAccess } = await import("../../../public/offline-vault.mjs");
  revokeOfflineAccess("cashier-1", "store-1");
  const previous = readOfflineRevocation("cashier-1", "store-1");
  revokeOfflineAccess("cashier-1", "store-1");
  expect(offlineRevocationMatches("cashier-1", "store-1", previous)).toBe(false);
  const current = readOfflineRevocation("cashier-1", "store-1");
  expect(current).not.toBeNull();
  expect(offlineRevocationMatches("cashier-1", "store-1", current)).toBe(true);
  revokeOfflineAccess("cashier-1", "store-1");
  expect(offlineRevocationMatches("cashier-1", "store-1", current)).toBe(false);
});

it("fails closed when persistent storage cannot be read", async () => {
  const { readOfflineRevocation } = await import("../../../public/offline-vault.mjs");
  vi.stubGlobal("localStorage", { getItem: () => { throw new Error("storage unavailable"); } });
  expect(() => readOfflineRevocation("cashier-1", "store-1")).toThrow("storage unavailable");
});
