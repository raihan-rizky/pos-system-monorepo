import { afterEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ effect: undefined as (() => void | (() => void)) | undefined, warm: vi.fn(), shell: vi.fn(), access: vi.fn() }));
vi.mock("react", () => ({ useEffect: (effect: () => void | (() => void)) => { harness.effect = effect; } }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ role: "CASHIER", userId: "cashier-1", storeId: "store-1", authorizationFingerprint: "0123456789abcdef" }) }));
vi.mock("@/features/rbac/helpers/permission-refresh", () => ({ loadCurrentRoleAccess: harness.access }));
vi.mock("../offline-module-preparation", () => ({ warmOfflineCheckoutModules: harness.warm }));
vi.mock("../offline-shell-preparation", () => ({ warmOfflineShellModules: harness.shell }));

import { OfflinePreparationBeacon } from "../OfflinePreparationBeacon";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

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
  const permissions = buildDefaultRolePermissions();
  harness.access.mockResolvedValue({ user: { id: "cashier-1", storeId: "store-1", role: "CASHIER" }, authorizationFingerprint: "0123456789abcdef", permissions });
  OfflinePreparationBeacon();
  harness.effect?.();
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
    type: "POS_OFFLINE_READY", token, cashierId: "cashier-1", storeId: "store-1", role: "CASHIER", authorizationFingerprint: "0123456789abcdef", permissions: expect.any(Object), assets: ["https://pos.example/_next/static/chunks/checkout.js"],
  }), "https://pos.example"));
  expect(harness.shell).toHaveBeenCalledOnce();
});

it.each(["identity", "fingerprint", "permission"])("rejects preparation when %s is no longer valid", async (problem) => {
  const postMessage = vi.fn();
  const token = "a".repeat(32);
  const permissions = buildDefaultRolePermissions();
  if (problem === "permission") permissions.CASHIER.resources.transaction.create = false;
  harness.access.mockResolvedValue({
    user: { id: problem === "identity" ? "other" : "cashier-1", storeId: "store-1", role: "CASHIER" },
    authorizationFingerprint: problem === "fingerprint" ? "fedcba9876543210" : "0123456789abcdef",
    permissions,
  });
  vi.stubGlobal("location", new URL(`https://pos.example/pos?__offline_prepare=${token}`));
  vi.stubGlobal("window", { parent: { postMessage } });
  vi.stubGlobal("performance", { getEntriesByType: () => [] });
  vi.stubGlobal("document", { querySelectorAll: () => [] });
  harness.warm.mockResolvedValue(undefined);
  harness.shell.mockResolvedValue(undefined);
  OfflinePreparationBeacon();
  harness.effect?.();
  await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({ type: "POS_OFFLINE_ERROR", token }, "https://pos.example"));
});
