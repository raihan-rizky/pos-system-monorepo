import { db } from "@pos/db";
import { DEFAULT_PRICE_ROUNDING_SETTINGS, validatePriceRoundingSettings, type PriceRoundingSettings } from "../rounding";

const SETTINGS_ID = "store-main";

export async function getPriceRoundingSettings(): Promise<PriceRoundingSettings> {
  const settings = await db.storeSettings.findUnique({
    where: { id: SETTINGS_ID },
    select: { priceRoundingEnabled: true, priceRoundingIncrement: true, priceRoundingThreshold: true },
  });
  if (!settings) return { ...DEFAULT_PRICE_ROUNDING_SETTINGS };
  return validatePriceRoundingSettings({
    enabled: settings.priceRoundingEnabled,
    increment: settings.priceRoundingIncrement,
    threshold: settings.priceRoundingThreshold,
  });
}

export async function updatePriceRoundingSettings(settings: PriceRoundingSettings): Promise<PriceRoundingSettings> {
  const validated = validatePriceRoundingSettings(settings);
  const data = {
    priceRoundingEnabled: validated.enabled,
    priceRoundingIncrement: validated.increment,
    priceRoundingThreshold: validated.threshold,
  };
  await db.storeSettings.upsert({ where: { id: SETTINGS_ID }, update: data, create: { id: SETTINGS_ID, ...data } });
  return validated;
}
