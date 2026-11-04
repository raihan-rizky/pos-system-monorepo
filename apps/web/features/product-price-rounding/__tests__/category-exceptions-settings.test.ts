import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPriceRoundingSettings, updatePriceRoundingSettings } from "../server/rounding-settings";
import { InvalidPriceRoundingCategoriesError } from "../server/errors";

const storage = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  findCategories: vi.fn(),
}));

vi.mock("@pos/db", () => ({
  db: {
    storeSettings: { findUnique: storage.findUnique, upsert: storage.upsert },
    category: { findMany: storage.findCategories },
  },
}));

const base = { enabled: true, increment: 500, threshold: 50 };

describe("penyimpanan pengecualian kategori", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    storage.findCategories.mockResolvedValue([{ id: "kertas" }, { id: "tinta" }]);
  });

  it("mengembalikan daftar kosong untuk pengaturan lama", async () => {
    storage.findUnique.mockResolvedValue(null);
    await expect(getPriceRoundingSettings()).resolves.toEqual({ ...base, excludedCategoryIds: [] });
  });

  it("memuat seluruh kategori yang tersimpan", async () => {
    storage.findUnique.mockResolvedValue({
      priceRoundingEnabled: true,
      priceRoundingIncrement: 500,
      priceRoundingThreshold: 50,
      priceRoundingExcludedCategories: [{ id: "kertas" }, { id: "tinta" }],
    });
    await expect(getPriceRoundingSettings()).resolves.toEqual({ ...base, excludedCategoryIds: ["kertas", "tinta"] });
  });

  it("menyimpan beberapa kategori bersama kebijakan pembulatan", async () => {
    const settings = { ...base, excludedCategoryIds: ["kertas", "tinta"] };
    await expect(updatePriceRoundingSettings(settings)).resolves.toEqual(settings);
    expect(storage.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        priceRoundingExcludedCategories: { set: [{ id: "kertas" }, { id: "tinta" }] },
      }),
      create: expect.objectContaining({
        priceRoundingExcludedCategories: { connect: [{ id: "kertas" }, { id: "tinta" }] },
      }),
    }));
  });

  it("tidak menghapus pilihan saat permintaan lama tidak membawa daftar kategori", async () => {
    await updatePriceRoundingSettings(base);
    const args = storage.upsert.mock.calls[0][0];
    expect(args.update).not.toHaveProperty("priceRoundingExcludedCategories");
  });

  it("menolak kategori yang tidak ada sebelum mengubah kebijakan", async () => {
    storage.findCategories.mockResolvedValue([{ id: "kertas" }]);
    await expect(updatePriceRoundingSettings({ ...base, excludedCategoryIds: ["kertas", "hilang"] })).rejects.toThrow(/kategori/i);
    expect(storage.upsert).not.toHaveBeenCalled();
  });

  it("melaporkan kategori yang dihapus saat pengaturan sedang disimpan", async () => {
    storage.upsert.mockRejectedValue(Object.assign(new Error("record missing"), { code: "P2025" }));
    await expect(updatePriceRoundingSettings({ ...base, excludedCategoryIds: ["kertas", "tinta"] }))
      .rejects.toBeInstanceOf(InvalidPriceRoundingCategoriesError);
  });
});
