import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), snapshot: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requireRole: mocks.owner, handleAuthError: () => null }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({
  getGlobalRolePermissionEntries: async () => [],
  getGlobalRolePermissionSnapshot: mocks.snapshot,
  getRolePermissionAudit: async () => [],
  saveGlobalRolePermissions: mocks.save,
}));

import { GET, PUT } from "../route";

describe("Owner RBAC settings API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.owner.mockResolvedValue({ id: "owner-1", name: "Pemilik", storeId: "store-1" });
    mocks.snapshot.mockResolvedValue({ permissions: [], version: "a".repeat(64) });
    mocks.save.mockResolvedValue({ permissions: [], version: "b".repeat(64) });
  });

  it("returns a fresh no-store snapshot and its concurrency version", async () => {
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toMatchObject({ permissions: [], version: "a".repeat(64) });
  });

  it("rejects missing versions before any permission write", async () => {
    const response = await PUT(new Request("http://localhost/api/settings/rbac", {
      method: "PUT", body: JSON.stringify({ permissions: [] }),
    }));
    expect(response.status).toBe(422);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("passes the authenticated owner to the save and ignores spoofed audit identity", async () => {
    const response = await PUT(new Request("http://localhost/api/settings/rbac", {
      method: "PUT", body: JSON.stringify({ permissions: [], version: "a".repeat(64), actor: { id: "spoofed" } }),
    }));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith([], { version: "a".repeat(64), actor: { id: "owner-1", name: "Pemilik", storeId: "store-1" } });
  });

  it("reports concurrent changes as a recoverable conflict", async () => {
    mocks.save.mockRejectedValue(Object.assign(new Error("Konfigurasi berubah"), { statusCode: 409 }));
    const response = await PUT(new Request("http://localhost/api/settings/rbac", {
      method: "PUT", body: JSON.stringify({ permissions: [], version: "a".repeat(64) }),
    }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "Conflict" });
  });
});
