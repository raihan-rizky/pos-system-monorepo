import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPriceRoundingSettings, updatePriceRoundingSettings } from "../server/rounding-settings";

const storage = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock("@pos/db", () => ({ db: { storeSettings: storage } }));

describe("persisted price rounding settings", () => {
  beforeEach(() => vi.resetAllMocks());

  it("provides the active default when no store settings exist", async () => {
    storage.findUnique.mockResolvedValue(null);
    await expect(getPriceRoundingSettings()).resolves.toEqual({ enabled: true, increment: 500, threshold: 50 });
  });

  it("loads the saved disabled policy without substituting defaults", async () => {
    storage.findUnique.mockResolvedValue({ priceRoundingEnabled: false, priceRoundingIncrement: 1000, priceRoundingThreshold: 0 });
    await expect(getPriceRoundingSettings()).resolves.toEqual({ enabled: false, increment: 1000, threshold: 0 });
  });

  it("upserts the singleton policy without changing other store settings", async () => {
    const settings = { enabled: true, increment: 1000, threshold: 100 };
    await expect(updatePriceRoundingSettings(settings)).resolves.toEqual(settings);
    expect(storage.upsert).toHaveBeenCalledWith({
      where: { id: "store-main" },
      update: { priceRoundingEnabled: true, priceRoundingIncrement: 1000, priceRoundingThreshold: 100 },
      create: { id: "store-main", priceRoundingEnabled: true, priceRoundingIncrement: 1000, priceRoundingThreshold: 100 },
    });
  });

  it.each([
    { enabled: true, increment: 0, threshold: 0 },
    { enabled: true, increment: 500, threshold: 501 },
    { enabled: true, increment: 500, threshold: -1 },
    { enabled: true, increment: 500.5, threshold: 50 },
    { enabled: true, increment: 1_000_000_001, threshold: 50 },
  ])("rejects invalid policies before writing: %j", async (settings) => {
    await expect(updatePriceRoundingSettings(settings)).rejects.toThrow();
    expect(storage.upsert).not.toHaveBeenCalled();
  });
});
