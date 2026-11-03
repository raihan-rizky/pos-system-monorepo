import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const mocks = vi.hoisted(() => ({ user: vi.fn(), permissions: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requireRole: mocks.user, handleAuthError: () => null }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));

import { GET } from "../route";

describe("current permission snapshot", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mocks.user.mockResolvedValue({ id: "sales-1", role: "SALES", name: "Sales", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(buildDefaultRolePermissions());
  });

  it("returns current user identity and uncached effective permissions", async () => {
    const permissions = buildDefaultRolePermissions();
    permissions.SALES.resources.transaction.update = true;
    mocks.permissions.mockResolvedValueOnce(permissions);
    const response = await GET();
    const body = await response.json();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(body.user).toEqual({ id: "sales-1", role: "SALES", name: "Sales", storeId: "store-1" });
    expect(body.permissions.SALES.resources.transaction.update).toBe(true);
    expect(body.authorizationFingerprint).toMatch(/^[a-f0-9]{16}$/);
  });

  it("fails without a default permission fallback when the permission store is unavailable", async () => {
    mocks.permissions.mockRejectedValueOnce(new Error("database unavailable"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("permissions");
  });
});
