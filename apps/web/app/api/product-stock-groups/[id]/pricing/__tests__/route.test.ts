import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ permission: vi.fn(), auth: vi.fn(), preview: vi.fn(), apply: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.auth }));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction } }));
vi.mock("@/features/product-stock-groups/group-pricing-service", async () => ({ ...(await vi.importActual("@/features/product-stock-groups/group-pricing-service")), previewGroupPricingChange: mocks.preview, applyGroupPricingChange: mocks.apply }));
const ctx = { params: Promise.resolve({ id: "g" }) };
const request = (body: object) => new Request("http://localhost/api/product-stock-groups/g/pricing", { method: "POST", body: JSON.stringify(body) });
describe("group pricing preview/apply API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.permission.mockResolvedValue({ id: "u", storeId: "s" }); mocks.auth.mockReturnValue(null); mocks.transaction.mockImplementation(fn => fn({})); });
  it("previews using store-scoped read permission without apply", async () => {
    const { POST } = await import("../route"); mocks.preview.mockResolvedValue({ version: "v", after: {} });
    const response = await POST(request({ changes: { sourceProductId: "a" } }), ctx);
    expect(response.status).toBe(200); expect(mocks.permission).toHaveBeenCalledWith("product", "read");
    expect(mocks.preview).toHaveBeenCalledWith(expect.anything(), { storeId: "s", groupId: "g", changes: { sourceProductId: "a" } }); expect(mocks.apply).not.toHaveBeenCalled();
  });
  it("requires preview tokens and update permission for apply", async () => {
    const { PATCH } = await import("../route");
    expect((await PATCH(request({ changes: {} }), ctx)).status).toBe(422);
    mocks.apply.mockResolvedValue({ config: { revision: 2 } });
    expect((await PATCH(request({ changes: {}, expectedVersion: "v", expectedProjection: "p" }), ctx)).status).toBe(200);
    expect(mocks.permission).toHaveBeenCalledWith("product", "update");
  });
  it("returns actionable stale conflicts and permissions", async () => {
    const { PATCH } = await import("../route"); const { GroupPricingError } = await import("@/features/product-stock-groups/group-pricing-service");
    mocks.apply.mockRejectedValue(new GroupPricingError("Muat pratinjau terbaru.", 409));
    const response = await PATCH(request({ changes: {}, expectedVersion: "v", expectedProjection: "p" }), ctx);
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ message: "Muat pratinjau terbaru." });
    mocks.permission.mockRejectedValue(new Error("denied")); mocks.auth.mockReturnValue(new Response(null, { status: 403 }));
    expect((await PATCH(request({ changes: {} }), ctx)).status).toBe(403);
  });
});
