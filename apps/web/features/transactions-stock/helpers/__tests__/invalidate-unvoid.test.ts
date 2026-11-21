import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import * as helpers from "@/features/transaction-history/helpers/invalidate";

describe("cache setelah pemulihan transaksi", () => {
  it("menandai transaksi, stok, surat jalan, pelanggan, dan piutang untuk dimuat ulang", () => {
    const client = new QueryClient();
    const keys = [["transaction", "tx-1"], ["transaction-history"], ["transactions"], ["products"], ["surat-jalans"], ["surat-jalan"], ["customers"], ["customer-receivables"], ["inventory-logs"], ["financial-report"], ["daily-financial-report"], ["finance"], ["customer-recap"]];
    for (const key of keys) client.setQueryData(key, { value: "stale" });
    const invalidate = (helpers as Record<string, any>).invalidateUnvoidViews;
    invalidate?.(client, "tx-1");
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated, key.join("/")).toBe(true);
  });
});
