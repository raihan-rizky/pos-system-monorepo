import type { GroupPricingConfig } from "../automatic-pricing";

/** Explicit Auto configuration for tests that exercise price and HPP cascades. */
export function configuredAutoGroup(sourceId: string, followerId: string): GroupPricingConfig {
  return {
    sourceProductId: sourceId, revision: 1, initializationVersion: 1,
    members: {
      [sourceId]: { mode: "AUTO", factor: { numerator: "1", denominator: "1" }, review: { price: [], costPrice: [] } },
      [followerId]: { mode: "AUTO", factor: { numerator: "9", denominator: "10" }, review: { price: [], costPrice: [] } },
    },
  };
}
