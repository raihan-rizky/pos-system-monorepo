import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "../route";
import { InvalidPriceRoundingCategoriesError } from "@/features/product-price-rounding/server/errors";

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/rbac/guard", async (original) => ({
  ...await original<typeof import("@/lib/rbac/guard")>(),
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/features/product-price-rounding/server/rounding-settings", () => ({
  getPriceRoundingSettings: vi.fn(),
  updatePriceRoundingSettings: mocks.update,
}));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));

const settings = { enabled: true, increment: 500, threshold: 50 };
const request = (body: unknown) => new Request("http://localhost/api/settings/price-rounding", {
  method: "PATCH",
  body: JSON.stringify(body),
});

describe("API pengecualian kategori pembulatan", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.requirePermission.mockResolvedValue({ role: "OWNER" });
    mocks.update.mockImplementation(async (value) => value);
  });

  it("meneruskan beberapa kategori yang dipilih ke penyimpanan", async () => {
    const payload = { ...settings, excludedCategoryIds: ["kertas", "tinta"] };
    const response = await PATCH(request(payload));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(payload);
  });

  it("menolak identitas kategori kosong", async () => {
    const response = await PATCH(request({ ...settings, excludedCategoryIds: [""] }));
    expect(response.status).toBe(422);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("memberi kesalahan yang dapat diperbaiki saat kategori sudah tidak ada", async () => {
    mocks.update.mockRejectedValue(new InvalidPriceRoundingCategoriesError("Kategori pengecualian tidak ditemukan."));
    const response = await PATCH(request({ ...settings, excludedCategoryIds: ["hilang"] }));
    expect(response.status).toBe(422);
    expect((await response.json()).message).toMatch(/kategori/i);
  });
});
