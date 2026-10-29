import { beforeEach, describe, expect, it, vi } from "vitest";

const settings = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { storeSettings: settings } }));
import { getSpecialPricingEnabled, updateSpecialPricingEnabled } from "../special-pricing-settings";

describe("pengaturan Harga Khusus", () => {
  beforeEach(() => vi.clearAllMocks());
  it("keeps the feature disabled for stores without saved settings", async () => {
    settings.findUnique.mockResolvedValue(null);
    expect(await getSpecialPricingEnabled()).toBe(false);
  });
  it("reads and persists the global setting", async () => {
    settings.findUnique.mockResolvedValue({ specialPricingEnabled: true });
    expect(await getSpecialPricingEnabled()).toBe(true);
    expect(await updateSpecialPricingEnabled(true)).toBe(true);
    expect(settings.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { specialPricingEnabled: true } }));
  });
});
