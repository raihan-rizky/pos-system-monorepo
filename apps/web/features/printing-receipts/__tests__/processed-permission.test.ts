import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions, normalizeRolePermissions } from "@/features/rbac/helpers/rbac-core";
import { requireProcessedPrintingReceiptPermission as authorize } from "../server/processed-permission";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), getFreshGlobalRolePermissions: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({
  requireRole: mocks.requireRole,
  AuthError: class AuthError extends Error {
    constructor(public statusCode: number, message: string) { super(message); }
  },
}));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({
  getFreshGlobalRolePermissions: mocks.getFreshGlobalRolePermissions,
}));

describe("processed printing receipt server authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_AUTH_BYPASS", "0");
    mocks.requireRole.mockResolvedValue({ id: "user-1", role: "ADMIN", storeId: "store-1", isActive: true });
    mocks.getFreshGlobalRolePermissions.mockResolvedValue(buildDefaultRolePermissions());
  });
  afterEach(() => vi.unstubAllEnvs());

  it("allows Owner automatically", async () => {
    mocks.requireRole.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    await expect(authorize()).resolves.toMatchObject({ id: "owner", role: "OWNER" });
  });

  it.each(["ADMIN", "CASHIER", "SALES", "INVENTORY"])("denies %s without the processed receipt grant", async (role) => {
    mocks.requireRole.mockResolvedValue({ id: "user-1", role, storeId: "store-1" });
    await expect(authorize()).rejects.toMatchObject({ statusCode: 403 });
  });

  it("uses fresh explicit grants and denies immediately after revocation", async () => {
    const granted = normalizeRolePermissions([
      { role: "SALES", scope: "resource", target: "printing_receipt.processed", action: "update", allowed: true },
    ]);
    mocks.requireRole.mockResolvedValue({ id: "sales", role: "SALES", storeId: "store-1" });
    mocks.getFreshGlobalRolePermissions
      .mockResolvedValueOnce(granted)
      .mockResolvedValueOnce(buildDefaultRolePermissions());

    await expect(authorize()).resolves.toMatchObject({ id: "sales" });
    await expect(authorize()).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.getFreshGlobalRolePermissions).toHaveBeenCalledTimes(2);
    expect(mocks.requireRole).toHaveBeenCalledTimes(2);
  });

  it("propagates revoked authentication before reading permissions", async () => {
    mocks.requireRole.mockRejectedValue({ statusCode: 403, message: "Account deactivated" });
    await expect(authorize()).rejects.toMatchObject({ statusCode: 403, message: "Account deactivated" });
    expect(mocks.getFreshGlobalRolePermissions).not.toHaveBeenCalled();
  });

  it("fails closed when the live permission read fails", async () => {
    mocks.getFreshGlobalRolePermissions.mockRejectedValue(new Error("database unavailable"));
    await expect(authorize()).rejects.toThrow("database unavailable");
  });

  it("preserves default-only E2E authorization outside production", async () => {
    vi.stubEnv("E2E_AUTH_BYPASS", "1");
    await expect(authorize()).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.getFreshGlobalRolePermissions).not.toHaveBeenCalled();
    mocks.requireRole.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-1" });
    await expect(authorize()).resolves.toMatchObject({ id: "owner" });
  });

  it("ignores E2E bypass in production and uses the live grant", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("E2E_AUTH_BYPASS", "1");
    await expect(authorize()).rejects.toMatchObject({ statusCode: 403 });
    expect(mocks.getFreshGlobalRolePermissions).toHaveBeenCalledTimes(1);
  });
});
