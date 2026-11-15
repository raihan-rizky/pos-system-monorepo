import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), manage: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@/features/product-classification/server/classification-catalog", () => ({
  manageClassificationSubcategory: mocks.manage,
  ClassificationCatalogError: class ClassificationCatalogError extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));

import { POST } from "../route";

const request = (body: unknown) => new Request("http://localhost/api/product-classification/manage", { method: "POST", body: JSON.stringify(body) });

describe("subcategory management API permissions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue({ id: "owner", role: "OWNER", storeId: "store-a" });
    mocks.authError.mockReturnValue(null);
    mocks.manage.mockResolvedValue({ id: "bot", group: "ATK", name: "BOT" });
  });

  it.each(["create", "update", "delete"])("requires product %s permission", async (action) => {
    const response = await POST(request({ action, id: "bot", name: "BOT" }));
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("product", action);
    expect(mocks.manage).toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each(["create", "update", "delete"])("denies %s without permission", async (action) => {
    mocks.permission.mockRejectedValue(new Error("forbidden"));
    mocks.authError.mockReturnValue(NextResponse.json({ message: "Akses ditolak" }, { status: 403 }));
    expect((await POST(request({ action }))).status).toBe(403);
    expect(mocks.manage).not.toHaveBeenCalled();
  });

  it("rejects unsupported actions", async () => {
    expect((await POST(request({ action: "other" }))).status).toBe(422);
    expect(mocks.manage).not.toHaveBeenCalled();
  });
});
