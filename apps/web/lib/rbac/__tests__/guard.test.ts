import { beforeEach, describe, expect, it, vi } from "vitest";
import { requirePermission } from "../guard";
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
});
