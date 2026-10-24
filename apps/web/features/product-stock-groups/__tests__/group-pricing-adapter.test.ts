import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@pos/db";
import { createGroupPricingInitializationAdapter } from "../../../scripts/group-pricing-backfill-adapter";
import { createPricingTestDatabase } from "./pricing-test-database";

describe("backfill transaction adapter", () => {
  it("uses one supplied transaction per group, records HPP audit and skips a repeat", async () => {
    const data = createPricingTestDatabase(); const transaction = vi.fn(fn => fn(data.tx));
    const apply = createGroupPricingInitializationAdapter({ $transaction: transaction } as unknown as Pick<PrismaClient, "$transaction">);
    const request = { storeId: "store-main", groupId: "group-1", expectedInitializationVersion: null } as const;
    expect((await apply(request)).initialized).toBe(true);
    expect(data.products[1].price).toBe("225000.00"); expect(data.products[1].costPrice).toBe("200000.00");
    expect(data.logs).toHaveLength(1); expect(data.activities).toHaveLength(1);
    expect((await apply(request)).initialized).toBe(false);
    expect(data.logs).toHaveLength(1); expect(transaction).toHaveBeenCalledTimes(2);
  });
});
