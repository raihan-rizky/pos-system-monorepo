import { db, type Prisma } from "@pos/db";

const SETTINGS_ID = "store-main";

export async function getSpecialPricingEnabled(client: Pick<Prisma.TransactionClient, "storeSettings"> = db): Promise<boolean> {
  const settings = await client.storeSettings.findUnique({ where: { id: SETTINGS_ID }, select: { specialPricingEnabled: true } });
  return settings?.specialPricingEnabled ?? false;
}

export async function updateSpecialPricingEnabled(enabled: boolean): Promise<boolean> {
  await db.storeSettings.upsert({ where: { id: SETTINGS_ID }, update: { specialPricingEnabled: enabled }, create: { id: SETTINGS_ID, specialPricingEnabled: enabled } });
  return enabled;
}
