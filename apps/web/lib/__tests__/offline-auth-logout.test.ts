import { afterEach, expect, it, vi } from "vitest";
import { clearClientAuthState } from "@/lib/auth/pos-session";
import { readOfflineRevocation } from "@/public/offline-vault.mjs";

afterEach(() => vi.unstubAllGlobals());

it("invalidates the current cashier's offline vault while retaining queued data on logout", () => {
  const values = new Map<string, string>();
  const storage = {
    get length() { return values.size; },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  values.set("pos:offline-queue", "keep");
  vi.stubGlobal("document", { cookie: "x-pos-user-id=cashier-1; x-pos-store-id=store-1" });
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("sessionStorage", storage);
  clearClientAuthState();
  expect(readOfflineRevocation("cashier-1", "store-1")).toEqual(expect.any(String));
  expect(values.get("pos:offline-queue")).toBe("keep");
});
