import { beforeEach, describe, expect, it, vi } from "vitest";
import { requirePermission, requireRole } from "../guard";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const getUserMock = vi.hoisted(() => vi.fn());
const userFindFirstMock = vi.hoisted(() => vi.fn());
const getGlobalRolePermissionsMock = vi.hoisted(() => vi.fn());

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
