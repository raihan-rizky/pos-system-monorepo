import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  handleAuthError: vi.fn(),
  findUnique: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/rbac/guard", () => ({
  requireRole: mocks.requireRole,
  handleAuthError: mocks.handleAuthError,
}));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock("@pos/db", () => ({
  db: { storeSettings: { findUnique: mocks.findUnique, upsert: mocks.upsert } },
}));

import { GET, PATCH } from "../route";

function request(body: unknown) {
  return new Request("http://localhost/api/settings/special-pricing", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

describe("/api/settings/special-pricing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ role: "OWNER" });
    mocks.handleAuthError.mockReturnValue(null);
  });

  it("reports Harga Khusus off for a store without saved settings", async () => {
    mocks.findUnique.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: false });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.requireRole).toHaveBeenCalledWith("OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY");
  });

  it.each([true, false])("returns the owner's saved choice: %s", async (enabled) => {
    mocks.findUnique.mockResolvedValue({ specialPricingEnabled: enabled });
    expect(await (await GET()).json()).toEqual({ enabled });
  });

  it.each([true, false])("lets an owner save the switch as %s", async (enabled) => {
    const response = await PATCH(request({ enabled }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled });
    expect(mocks.requireRole).toHaveBeenCalledWith("OWNER");
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { id: "store-main" },
      update: { specialPricingEnabled: enabled },
      create: { id: "store-main", specialPricingEnabled: enabled },
    });
  });

  it("rejects a non-owner before changing the setting", async () => {
    const denied = new Error("not allowed");
    mocks.requireRole.mockRejectedValue(denied);
    mocks.handleAuthError.mockReturnValue(Response.json({ message: "Forbidden" }, { status: 403 }));
    expect((await PATCH(request({ enabled: true }))).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it.each([null, {}, { enabled: "true" }, { enabled: 1 }, { enabled: true, extra: 1 }])(
    "rejects an invalid switch value without persisting: %j",
    async (body) => {
      const response = await PATCH(request(body));
      expect(response.status).toBe(422);
      expect(mocks.upsert).not.toHaveBeenCalled();
    },
  );

  it("rejects malformed JSON", async () => {
    const response = await PATCH(new Request("http://localhost", { method: "PATCH", body: "{" }));
    expect(response.status).toBe(422);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("does not expose a database error when saving fails", async () => {
    mocks.upsert.mockRejectedValue(new Error("internal database detail"));
    const response = await PATCH(request({ enabled: true }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Pengaturan Harga Khusus belum dapat disimpan." });
  });
});
