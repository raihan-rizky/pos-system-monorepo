import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const mocks = vi.hoisted(() => ({ findMany: vi.fn(), permission: vi.fn(), authError: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { product: { findMany: mocks.findMany } } }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: mocks.permission, handleAuthError: mocks.authError }));

describe("GET /api/products/units", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue({ storeId: "store-2" });
    mocks.authError.mockReturnValue(null);
    mocks.findMany.mockResolvedValue([{ unit: "PCS" }, { unit: "dus" }, { unit: " pcs " }, { unit: "" }]);
  });

  it("lists distinct active units in the current store without a page limit", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: ["dus", "pcs"] });
    expect(mocks.permission).toHaveBeenCalledWith("product", "read");
    expect(mocks.findMany).toHaveBeenCalledWith({
      where: { storeId: "store-2", isActive: true },
      select: { unit: true }, distinct: ["unit"], orderBy: { unit: "asc" },
    });
  });

  it("returns authorization failures without querying product units", async () => {
    mocks.permission.mockRejectedValue(new Error("Forbidden"));
    mocks.authError.mockReturnValue(new Response("Forbidden", { status: 403 }));
    expect((await GET()).status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
