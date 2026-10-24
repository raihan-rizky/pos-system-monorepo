import type { PrismaClient } from "@pos/db";
import type { ApplyGroupPricingInitialization } from "./backfill-group-pricing";
import { initializeGroupPricingInTransaction } from "../features/product-stock-groups/group-pricing-service";

export function createGroupPricingInitializationAdapter(database: Pick<PrismaClient, "$transaction">): ApplyGroupPricingInitialization {
  return request => database.$transaction(tx => initializeGroupPricingInTransaction(tx, {
    storeId: request.storeId, groupId: request.groupId,
    source: "SYSTEM", note: "Inisialisasi HPP dan harga otomatis grup satuan",
  }));
}

export const applyGroupPricingInitialization: ApplyGroupPricingInitialization = async request => {
  const { db } = await import("@pos/db");
  return createGroupPricingInitializationAdapter(db)(request);
};
