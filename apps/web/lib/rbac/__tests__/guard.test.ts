import { beforeEach, describe, expect, it, vi } from "vitest";
import { requirePermission, requireRole } from "../guard";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const getUserMock = vi.hoisted(() => vi.fn());
const userFindFirstMock = vi.hoisted(() => vi.fn());
const getGlobalRolePermissionsMock = vi.hoisted(() => vi.fn());
const cookieGetMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: cookieGetMock,
  }),
}));

vi.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: getUserMock,
    },
  }),
}));

vi.mock("@pos/db", () => ({
  db: {
    user: {
      findFirst: userFindFirstMock,
    },
  },
}));

vi.mock("@/features/rbac/helpers/rbac-server", () => ({
  getGlobalRolePermissions: getGlobalRolePermissionsMock,
}));

describe("RBAC server guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    cookieGetMock.mockReturnValue(undefined);
    getUserMock.mockResolvedValue({
      data: { user: { email: "inventory@pos.local" } },
    });
    userFindFirstMock.mockResolvedValue({
      id: "user-inventory",
      username: "inventory",
      name: "Inventory Staff",
      role: "INVENTORY",
      storeId: "store-main",
      isActive: true,
    });
    getGlobalRolePermissionsMock.mockResolvedValue(buildDefaultRolePermissions());
  });

  it("allows INVENTORY users through resource permission checks", async () => {
    await expect(requirePermission("inventory", "read")).resolves.toMatchObject({
      role: "INVENTORY",
    });
  });

  it("uses scoped E2E cookies without calling Supabase outside production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("E2E_AUTH_BYPASS", "1");
    cookieGetMock.mockImplementation((name: string) => {
      const values: Record<string, string> = {
        "x-pos-role": "OWNER",
        "x-pos-user-id": "e2e-owner",
        "x-pos-user-name": "E2E%20Owner",
        "x-pos-store-id": "store-main",
      };
      return values[name] ? { value: values[name] } : undefined;
    });

    await expect(requirePermission("inventory", "read")).resolves.toMatchObject({
      id: "e2e-owner",
      name: "E2E Owner",
      role: "OWNER",
      storeId: "store-main",
      isActive: true,
    });
    expect(getUserMock).not.toHaveBeenCalled();
    expect(userFindFirstMock).not.toHaveBeenCalled();
  });

  it("re-checks active status for each authorization decision", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { email: "revoked@pos.local" } },
    });
    userFindFirstMock
      .mockResolvedValueOnce({
        id: "user-revoked",
        username: "revoked",
        name: "Revoked User",
        role: "INVENTORY",
        storeId: "store-main",
        isActive: true,
      })
      .mockResolvedValueOnce({
        id: "user-revoked",
        username: "revoked",
        name: "Revoked User",
        role: "INVENTORY",
        storeId: "store-main",
        isActive: false,
      });

    await expect(requirePermission("inventory", "read")).resolves.toMatchObject({
      id: "user-revoked",
      isActive: true,
    });
    await expect(requirePermission("inventory", "read")).rejects.toMatchObject({
      statusCode: 403,
      message: "Account deactivated",
    });
    expect(userFindFirstMock).toHaveBeenCalledTimes(2);
  });

  it("re-checks role changes for each authorization decision", async () => {
    getUserMock.mockResolvedValue({
      data: { user: { email: "downgraded@pos.local" } },
    });
    userFindFirstMock
      .mockResolvedValueOnce({
        id: "user-downgraded",
        username: "downgraded",
        name: "Downgraded User",
        role: "OWNER",
        storeId: "store-main",
        isActive: true,
      })
      .mockResolvedValueOnce({
        id: "user-downgraded",
        username: "downgraded",
        name: "Downgraded User",
        role: "CASHIER",
        storeId: "store-main",
        isActive: true,
      });

    await expect(requireRole("OWNER")).resolves.toMatchObject({
      id: "user-downgraded",
      role: "OWNER",
    });
    await expect(requireRole("OWNER")).rejects.toMatchObject({
      statusCode: 403,
      message: "Insufficient permissions",
    });
    expect(userFindFirstMock).toHaveBeenCalledTimes(2);
  });
});
