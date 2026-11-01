import { afterEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ effect: undefined as (() => void | (() => void)) | undefined, warm: vi.fn(), shell: vi.fn() }));
vi.mock("react", () => ({ useEffect: (effect: () => void | (() => void)) => { harness.effect = effect; } }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ userId: "cashier-1", storeId: "store-1" }) }));
vi.mock("../offline-module-preparation", () => ({ warmOfflineCheckoutModules: harness.warm }));
vi.mock("../offline-shell-preparation", () => ({ warmOfflineShellModules: harness.shell }));

import { OfflinePreparationBeacon } from "../OfflinePreparationBeacon";

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("reports the prepared POS identity and loaded static assets to its parent frame", async () => {
  const postMessage = vi.fn();
  const token = "a".repeat(32);
  vi.stubGlobal("location", new URL(`https://pos.example/pos?__offline_prepare=${token}`));
  vi.stubGlobal("window", { parent: { postMessage } });
  vi.stubGlobal("performance", { getEntriesByType: () => [{ name: "https://pos.example/_next/static/chunks/checkout.js" }, { name: "https://pos.example/api/private" }] });
  vi.stubGlobal("document", { querySelectorAll: () => [] });
  harness.warm.mockResolvedValue(undefined);
  harness.shell.mockResolvedValue(undefined);
  OfflinePreparationBeacon();
  harness.effect?.();
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({
    type: "POS_OFFLINE_READY", token, cashierId: "cashier-1", storeId: "store-1", assets: ["https://pos.example/_next/static/chunks/checkout.js"],
  }, "https://pos.example"));
  expect(harness.shell).toHaveBeenCalledOnce();
});
