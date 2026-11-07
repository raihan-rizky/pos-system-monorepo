import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultRolePermissions, normalizeRolePermissions } from "@/features/rbac/helpers/rbac-core";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), permissions: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: mocks.permissions }));
vi.mock("@/features/suppliers/shopping-requests/services/shopping-request-correction-service", () => ({ listShoppingRequestCorrectionHistory: mocks.history }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

import { GET } from "../route";

const context = { params: Promise.resolve({ id: "request-1" }) };
const request = () => new Request("http://localhost/api/suppliers/shopping-requests/request-1/correction/history");

describe("akses riwayat koreksi daftar belanja", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.currentUser.mockResolvedValue({ id: "admin-1", name: "Admin", role: "ADMIN", storeId: "store-1" });
    mocks.permissions.mockResolvedValue(buildDefaultRolePermissions());
    mocks.history.mockResolvedValue([{ id: "correction-1", reason: "Salah catat" }]);
  });

  it("mengizinkan pembaca supplier melihat riwayat tanpa izin koreksi", async () => {
    const response = await GET(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ data: [{ id: "correction-1" }] });
    expect(mocks.history).toHaveBeenCalledWith("request-1", { id: "admin-1", name: "Admin", storeId: "store-1" });
  });

  it("menolak pengguna tanpa akses halaman supplier", async () => {
    mocks.permissions.mockResolvedValue(normalizeRolePermissions([
      { role: "ADMIN", scope: "page", target: "/suppliers", action: "access", allowed: false },
    ]));
    expect((await GET(request(), context)).status).toBe(403);
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it("menolak sesi tanpa toko atau izin yang tidak dapat diverifikasi", async () => {
    mocks.currentUser.mockResolvedValueOnce({ id: "admin-1", name: "Admin", role: "ADMIN", storeId: null });
    expect((await GET(request(), context)).status).toBe(403);
    mocks.permissions.mockRejectedValueOnce(new Error("offline"));
    expect((await GET(request(), context)).status).toBe(503);
    expect(mocks.history).not.toHaveBeenCalled();
  });
});
