import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), authError: vi.fn(), preview: vi.fn(), apply: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));
vi.mock("@/features/product-classification/server/classification-move", () => ({
  previewClassificationMove: mocks.preview,
  applyClassificationMove: mocks.apply,
  ClassificationMoveError: class ClassificationMoveError extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));

import { POST } from "../route";

const actor = { id: "admin", role: "ADMIN", storeId: "store-a" };
const request = (body: unknown) => new Request("http://localhost/api/product-classification/move", { method: "POST", body: JSON.stringify(body) });

describe("classification move API permissions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.permission.mockResolvedValue(actor);
    mocks.authError.mockReturnValue(null);
    mocks.preview.mockResolvedValue({ token: "preview", totals: { selected: 1 } });
    mocks.apply.mockResolvedValue({ moved: 1, unchanged: 0 });
  });

  it.each(["preview", "apply"])("requires product update permission before %s", async (action) => {
    const response = await POST(request({ action, productIds: ["pcs"], subcategoryId: "print", ...(action === "apply" ? { token: "preview" } : {}) }));
    expect(response.status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("product", "update");
    expect(action === "preview" ? mocks.preview : mocks.apply).toHaveBeenCalledWith(actor, expect.objectContaining({ productIds: ["pcs"], subcategoryId: "print" }));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it.each(["preview", "apply"])("denies %s without permission", async (action) => {
    mocks.permission.mockRejectedValue(new Error("forbidden"));
    mocks.authError.mockReturnValue(NextResponse.json({ message: "Akses ditolak" }, { status: 403 }));
    expect((await POST(request({ action, productIds: ["pcs"], subcategoryId: "print" }))).status).toBe(403);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });

  it("rejects an unknown action without changing products", async () => {
    expect((await POST(request({ action: "other" }))).status).toBe(422);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.apply).not.toHaveBeenCalled();
  });
});
