import { describe, expect, it, vi } from "vitest";

const queryRaw = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@pos/db")>();
  return { ...actual, db: { $queryRaw: queryRaw } };
});

import { listMergedPurchases } from "../backdated-purchase-list";

describe("filter gabungan daftar yang dibatalkan", () => {
  it("menyertakan pembelian yang sebelumnya disetujui pada filter penerimaan dan pembayaran", async () => {
    queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0n }]);
    await listMergedPurchases({ storeId: "store-1", status: "CANCELLED", fulfillmentStatus: "RECEIVED", paymentMethod: "GIRO", skip: 0, take: 10 });
    const sql = queryRaw.mock.calls[0][1].sql as string;
    expect(sql).toContain("gp.status::text = 'CANCELLED'");
    expect(sql).toContain(`gp."statusBeforeCancellation"::text = 'APPROVED'`);
  });
});
