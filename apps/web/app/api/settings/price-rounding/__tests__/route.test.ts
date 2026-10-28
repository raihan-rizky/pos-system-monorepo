import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, PATCH } from "../route";
import { AuthError } from "@/lib/rbac/guard";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), requirePermission: vi.fn(), get: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/rbac/guard", async (original) => ({
  ...await original<typeof import("@/lib/rbac/guard")>(),
  requireRole: mocks.requireRole,
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/features/product-price-rounding/server/rounding-settings", () => ({ getPriceRoundingSettings: mocks.get, updatePriceRoundingSettings: mocks.update }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

const settings = { enabled: true, increment: 500, threshold: 50 };
const request = (body: unknown) => new Request("http://localhost/api/settings/price-rounding", { method: "PATCH", body: JSON.stringify(body) });

describe("/api/settings/price-rounding", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requireRole.mockResolvedValue({ role: "CASHIER" });
    mocks.requirePermission.mockResolvedValue({ role: "ADMIN" });
    mocks.get.mockResolvedValue(settings);
    mocks.update.mockImplementation(async (value) => value);
  });

  it("lets every authenticated role read the runtime pricing policy", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(settings);
    expect(mocks.requireRole).toHaveBeenCalledWith("OWNER", "ADMIN", "CASHIER", "SALES", "INVENTORY");
  });

  it("rejects an unauthenticated read", async () => {
    mocks.requireRole.mockRejectedValue(new AuthError(401));
    expect((await GET()).status).toBe(401);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("allows a delegated role to save using its update permission", async () => {
    const response = await PATCH(request(settings));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(settings);
    expect(mocks.requirePermission).toHaveBeenCalledWith("settings.price_rounding", "update");
    expect(mocks.update).toHaveBeenCalledWith(settings);
  });

  it("rejects a role without update permission before saving", async () => {
    mocks.requirePermission.mockRejectedValue(new AuthError(403));
    expect((await PATCH(request(settings))).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([
    { ...settings, enabled: "true" },
    { ...settings, increment: 0 },
    { ...settings, increment: 500.5 },
    { ...settings, increment: 1_000_000_001 },
    { ...settings, threshold: -1 },
    { ...settings, threshold: 501 },
    { ...settings, threshold: 0.5 },
  ])("rejects invalid policies with a useful validation response: %j", async (value) => {
    const response = await PATCH(request(value));
    expect(response.status).toBe(422);
    expect((await response.json()).message).toMatch(/tidak valid/i);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON as a client error", async () => {
    expect((await PATCH(new Request("http://localhost", { method: "PATCH", body: "{" }))).status).toBe(422);
  });

  it.each([null, {}, [], { enabled: true }, { increment: 500, threshold: 50 }])("rejects incomplete request bodies without persisting: %j", async body => {
    const response = await PATCH(request(body));
    expect(response.status).toBe(422);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not cache the authenticated runtime response", async () => {
    expect((await GET()).headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns a safe read failure when storage is unavailable", async () => {
    mocks.get.mockRejectedValue(new Error("internal-storage-details"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Gagal memuat pengaturan pembulatan harga." });
  });

  it("returns a safe save failure without reporting success", async () => {
    mocks.update.mockRejectedValue(new Error("internal-storage-details"));
    const response = await PATCH(request(settings));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Gagal menyimpan pengaturan pembulatan harga." });
  });
});
