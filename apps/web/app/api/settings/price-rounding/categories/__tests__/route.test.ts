import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => {
  class AuthError extends Error { constructor(public statusCode: number) { super("Forbidden"); } }
  return { AuthError, requirePermission: mocks.permission, handleAuthError: (error: unknown) => error instanceof AuthError ? new Response(null, { status: error.statusCode }) : null };
});
vi.mock("@pos/db", () => ({ db: { category: { findMany: mocks.findMany } } }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

describe("kategori untuk pengaturan pembulatan", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.findMany.mockResolvedValue([{ id: "paper", name: "Kertas" }]); });
  it.each(["read", "update"])("mengizinkan izin %s tanpa izin produk", async allowed => {
    const { AuthError } = await import("@/lib/rbac/guard");
    mocks.permission.mockImplementation(async (_resource, action) => { if (action !== allowed) throw new AuthError(403); return { role: "ADMIN" }; });
    const { GET } = await import("../route");
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: "paper", name: "Kertas" }]);
    expect(mocks.findMany).toHaveBeenCalledWith({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  });
  it("menolak pengguna tanpa izin melihat maupun mengubah", async () => {
    const { AuthError } = await import("@/lib/rbac/guard");
    mocks.permission.mockRejectedValue(new AuthError(403));
    const { GET } = await import("../route");
    expect((await GET()).status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("tidak mencoba izin lain setelah kegagalan autentikasi", async () => {
    const { AuthError } = await import("@/lib/rbac/guard");
    mocks.permission.mockRejectedValue(new AuthError(401));
    const { GET } = await import("../route");
    expect((await GET()).status).toBe(401);
    expect(mocks.permission).toHaveBeenCalledTimes(1);
  });
});
