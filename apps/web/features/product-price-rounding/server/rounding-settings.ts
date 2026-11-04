import { db } from "@pos/db";
import { DEFAULT_PRICE_ROUNDING_SETTINGS, validatePriceRoundingSettings, type PriceRoundingSettings } from "../rounding";
import { InvalidPriceRoundingCategoriesError } from "./errors";

const SETTINGS_ID = "store-main";

export async function getPriceRoundingSettings(): Promise<PriceRoundingSettings> {
  const settings = await db.storeSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: {
      priceRoundingEnabled: true,
      priceRoundingIncrement: true,
      priceRoundingThreshold: true,
      priceRoundingExcludedCategories: { select: { id: true } },
    },
  });
  if (!settings) return { ...DEFAULT_PRICE_ROUNDING_SETTINGS, excludedCategoryIds: [] };
  return validatePriceRoundingSettings({
    enabled: settings.priceRoundingEnabled,
    increment: settings.priceRoundingIncrement,
    threshold: settings.priceRoundingThreshold,
    excludedCategoryIds: settings.priceRoundingExcludedCategories?.map((category) => category.id) ?? [],
  });
}

export async function updatePriceRoundingSettings(settings: PriceRoundingSettings): Promise<PriceRoundingSettings> {
  const validated = validatePriceRoundingSettings(settings);
  const categoryIds = validated.excludedCategoryIds;
  if (categoryIds?.length) {
    const categories = await db.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true },
    });
    if (categories.length !== categoryIds.length) {
      throw new InvalidPriceRoundingCategoriesError("Kategori pengecualian tidak ditemukan.");
    }
  }
  const data = {
    priceRoundingEnabled: validated.enabled,
    priceRoundingIncrement: validated.increment,
    priceRoundingThreshold: validated.threshold,
  };
  const categories = categoryIds?.map((id) => ({ id }));
  try {
    await db.storeSettings.upsert({
      where: { id: SETTINGS_ID },
      update: { ...data, ...(categories ? { priceRoundingExcludedCategories: { set: categories } } : {}) },
      create: { id: SETTINGS_ID, ...data, ...(categories ? { priceRoundingExcludedCategories: { connect: categories } } : {}) },
    });
  } catch (error) {
    if (categories && typeof error === "object" && error !== null && "code" in error &&
        (error.code === "P2025" || error.code === "P2003")) {
      throw new InvalidPriceRoundingCategoriesError("Kategori pengecualian tidak ditemukan.");
    }
    throw error;
  }
  return validated;
}
