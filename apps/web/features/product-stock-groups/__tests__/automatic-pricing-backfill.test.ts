import { describe, expect, it } from "vitest";
import { runGroupPricingBackfill } from "../../../scripts/backfill-group-pricing";
import { initializeGroupPricing, type GroupPricingInput } from "../automatic-pricing";

const group = (storeId: string): GroupPricingInput => ({
  groupId: `group-${storeId}`, storeId, baseUnit: "pcs",
  members: [
    { id: `pcs-${storeId}`, groupId: `group-${storeId}`, storeId, unit: "pcs", price: "3000", costPrice: "2000", unitMultiplierToBase: 1, isActive: true, conversionNeedsReview: false },
    { id: `pak-${storeId}`, groupId: `group-${storeId}`, storeId, unit: "pak", price: "32400", costPrice: "10000", unitMultiplierToBase: 12, isActive: true, conversionNeedsReview: false },
  ],
});
async function* groups(values: GroupPricingInput[]) { yield* values; }

describe("group pricing backfill", () => {
  it("previews all stores and HPP audit deltas without invoking an available writer", async () => {
    let writes = 0;
    const result = await runGroupPricingBackfill({
      groups: groups([group("a"), group("b")]),
      applyGroup: async () => { writes++; throw new Error("Pratinjau tidak boleh menulis"); },
    });
    expect(writes).toBe(0);
    expect(result).toMatchObject({ scanned: 2, initialized: 0, pending: 2, skipped: 0 });
    expect(result.groups[0].costChanges).toEqual([{ productId: "pak-a", before: "10000.00", after: "24000.00" }]);
    expect(result.groups[0].projection.members[1].price).toBe("32400.00");
  });

  it("applies through the transaction adapter and skips initialized groups on rerun", async () => {
    const initial = group("a");
    const already = group("b");
    already.config = initializeGroupPricing(already).config;
    const lockedRequests: unknown[] = [];
    const result = await runGroupPricingBackfill({
      groups: groups([initial, already]), apply: true,
      applyGroup: async request => {
        lockedRequests.push(request);
        return initializeGroupPricing(initial);
      },
    });
    expect(lockedRequests).toEqual([{ storeId: "a", groupId: "group-a", expectedInitializationVersion: null }]);
    expect(result).toMatchObject({ initialized: 1, skipped: 1, pending: 0 });
  });

  it("refuses apply without the transactional adapter before reading any groups", async () => {
    let reads = 0;
    async function* lazy() { reads++; yield group("a"); }
    await expect(runGroupPricingBackfill({ groups: lazy(), apply: true })).rejects.toThrow(/transaksi/i);
    expect(reads).toBe(0);
  });

  it("reports a concurrent initialization as skipped when the adapter rereads it", async () => {
    const input = group("a");
    const existing = initializeGroupPricing(input);
    const result = await runGroupPricingBackfill({
      groups: groups([input]), apply: true,
      applyGroup: async () => ({ ...existing, initialized: false }),
    });
    expect(result).toMatchObject({ scanned: 1, initialized: 0, pending: 0, skipped: 1 });
  });
});
