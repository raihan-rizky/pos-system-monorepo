import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  permission: vi.fn(), authError: vi.fn(), execute: vi.fn(), categories: vi.fn(), log: vi.fn(),
}));

vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@/features/product-categories/server/category-management", () => ({
  executeCategoryAction: mocks.execute,
  CategoryManagementError: class CategoryManagementError extends Error {
    constructor(public status: number, message: string, public errors?: Record<string, string[]>) { super(message); }
  },
}));
vi.mock("@pos/db", () => ({ db: { category: { findMany: mocks.categories } } }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: mocks.log }) }));

import { POST } from "../route";
import { GET } from "../../route";
import { CategoryManagementError } from "@/features/product-categories/server/category-management";

const actor = { id: "owner", role: "OWNER", storeId: "store-1" };
const request = (body: unknown) => new Request("http://localhost/api/categories/manage", { method: "POST", body: JSON.stringify(body) });

describe("category management API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue(actor);
    mocks.authError.mockReturnValue(null);
    mocks.execute.mockResolvedValue({ message: "Berhasil", created: 1 });
    mocks.categories.mockResolvedValue([]);
  });

  it.each([
    ["create", ["create"], 201],
    ["update", ["update"], 200],
    ["preview-delete", ["delete", "update"], 200],
    ["delete", ["delete", "update"], 200],
    ["preview-move", ["update"], 200],
    ["move", ["update"], 200],
  ] as const)("checks all required permissions for %s and forwards the actor", async (action, permissions, status) => {
    const payload = { action, categories: [], productIds: ["product-1"] };
    const response = await POST(request(payload));
    expect(response.status).toBe(status);
    expect(mocks.permission.mock.calls).toEqual(permissions.map(permission => ["product", permission]));
    expect(mocks.execute).toHaveBeenCalledWith(payload, actor);
    expect(await response.json()).toEqual({ message: "Berhasil", created: 1 });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each(["create", "update", "preview-delete", "delete", "preview-move", "move"])("does not execute %s without permission", async action => {
    const error = new Error("forbidden");
    mocks.permission.mockRejectedValue(error);
    mocks.authError.mockReturnValue(NextResponse.json({ message: "Akses ditolak", code: "Forbidden" }, { status: 403 }));
    const response = await POST(request({ action }));
    expect(response.status).toBe(403);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each(["preview-delete", "delete"])("does not execute %s when update permission is missing", async action => {
    mocks.permission.mockResolvedValueOnce(actor).mockRejectedValueOnce(new Error("forbidden"));
    mocks.authError.mockReturnValue(NextResponse.json({ message: "Akses ditolak" }, { status: 403 }));
    expect((await POST(request({ action }))).status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([401, 403])("returns Indonesian access guidance for status %s", async status => {
    mocks.permission.mockRejectedValue(new Error("authorization failed"));
    mocks.authError.mockReturnValue(NextResponse.json({ message: status === 401 ? "Unauthorized" : "Insufficient permissions" }, { status }));
    const response = await POST(request({ action: "create" }));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({
      message: status === 401 ? "Sesi Anda berakhir. Silakan masuk kembali." : "Anda belum memiliki izin untuk tindakan kategori ini.",
      code: status === 401 ? "Unauthorized" : "Forbidden",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([{}, { action: "unknown" }, { action: "toString" }, null, [], "create"])("rejects unknown action without executing the service: %j", async body => {
    const response = await POST(request(body));
    expect(response.status).toBe(422);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns a friendly 400 for malformed JSON", async () => {
    const response = await POST(new Request("http://localhost/api/categories/manage", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ message: expect.stringMatching(/JSON/) });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([403, 409, 422, 503])("preserves a safe service error with status %s", async status => {
    mocks.execute.mockRejectedValue(new CategoryManagementError(status, "Muat ulang dan periksa pilihan kategori."));
    const response = await POST(request({ action: "update" }));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ message: "Muat ulang dan periksa pilihan kategori." });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("preserves field validation errors for the category editor", async () => {
    const errors = { "categories.0.name": ["Nama kategori wajib diisi"] };
    mocks.execute.mockRejectedValue(new CategoryManagementError(422, "Periksa isian kategori.", errors));
    const response = await POST(request({ action: "create" }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ errors });
  });

  it.each(["P2034", "P2002", "P2003"])("returns a safe conflict for Prisma %s", async code => {
    mocks.execute.mockRejectedValue(Object.assign(new Error("private database details"), { code }));
    const response = await POST(request({ action: "update" }));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({ message: expect.any(String), code: "Conflict" });
    expect(JSON.stringify(body)).not.toContain("private database details");
  });

  it("does not expose or log raw internal errors", async () => {
    mocks.execute.mockRejectedValue(new Error("postgres://secret"));
    const response = await POST(request({ action: "update" }));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("postgres://secret");
    expect(mocks.log).toHaveBeenCalled();
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("postgres://secret");
  });

  it("never caches the category list after a mutation", async () => {
    const response = await GET();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.permission).toHaveBeenCalledWith("product", "read");
  });
});

describe("category API trust boundaries and list contract", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue(actor);
    mocks.authError.mockReturnValue(null);
    mocks.execute.mockResolvedValue({ message: "Berhasil" });
    mocks.categories.mockResolvedValue([]);
  });

  it("uses the authenticated actor instead of identity fields supplied in the payload", async () => {
    const payload = {
      action: "create",
      categories: [{ name: "Minuman" }],
      actor: { id: "attacker", role: "OWNER", storeId: "other-store" },
      storeId: "other-store",
    };
    mocks.permission.mockResolvedValue({ ...actor, email: "owner@example.test", sessionToken: "private-session" });

    const response = await POST(request(payload));

    expect(response.status).toBe(201);
    expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(payload, {
      id: "owner", role: "OWNER", storeId: "store-1",
    });
    expect(await response.json()).toEqual({ message: "Berhasil" });
  });

  it.each(["preview-delete", "delete"])("keeps the deletion actor when checking the additional update permission for %s", async action => {
    mocks.permission.mockResolvedValueOnce(actor).mockResolvedValueOnce({
      id: "other-user", role: "CASHIER", storeId: "other-store",
    });

    const payload = { action, categoryIds: ["category-1"], targetCategoryId: "category-2" };
    const response = await POST(request(payload));

    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledExactlyOnceWith(payload, actor);
  });

  it.each(["preview-delete", "delete"])("stops permission checks when delete permission is denied for %s", async action => {
    const denied = new Error("delete permission denied");
    mocks.permission.mockRejectedValueOnce(denied);
    mocks.authError.mockReturnValue(NextResponse.json({ code: "Forbidden" }, { status: 403 }));

    const response = await POST(request({ action, categoryIds: ["category-1"] }));

    expect(response.status).toBe(403);
    expect(mocks.permission.mock.calls).toEqual([["product", "delete"]]);
    expect(mocks.authError).toHaveBeenCalledWith(denied);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each([null, undefined, "postgres://private-host"])("handles a non-Error service rejection without exposing it: %j", async failure => {
    mocks.execute.mockRejectedValueOnce(failure);

    const response = await POST(request({ action: "move", productIds: ["product-1"], targetCategoryId: "category-2" }));

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      message: "Kategori belum berhasil diproses. Silakan coba lagi.", code: "InternalError",
    });
    expect(JSON.stringify(mocks.log.mock.calls)).not.toContain("private-host");
  });

  it.each([401, 403])("does not read category data when read authorization fails with %s", async status => {
    const denied = new Error("read permission denied");
    mocks.permission.mockRejectedValueOnce(denied);
    mocks.authError.mockReturnValue(NextResponse.json({ code: status === 401 ? "Unauthorized" : "Forbidden" }, { status }));

    const response = await GET();

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code: status === 401 ? "Unauthorized" : "Forbidden" });
    expect(mocks.categories).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("returns an empty collection for a shop without categories", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [] });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("includes category ordering and assigned product counts in the list contract", async () => {
    const categories = [
      { id: "category-1", name: "Minuman", description: null, order: 0, _count: { products: 3 } },
      { id: "category-2", name: "Makanan", description: "Siap saji", order: 1, _count: { products: 0 } },
    ];
    mocks.categories.mockResolvedValueOnce(categories);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: categories });
    expect(mocks.categories).toHaveBeenCalledExactlyOnceWith({
      orderBy: { order: "asc" },
      include: { _count: { select: { products: true } } },
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
