import { describe, expect, it, vi } from "vitest";

const findMany = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", () => ({
  Prisma: {},
  db: { shoppingRequest: { findMany } },
}));

import { buildShoppingRequestWhere, listShoppingRequests } from "../shopping-requests-repository";

describe("shopping request flow metadata", () => {
  it("finds old purchase documents by purchase number in the combined list", () => {
    expect(buildShoppingRequestWhere({ storeId: "store-1", q: "PB-2026", skip: 0, take: 10 }))
      .toMatchObject({ OR: expect.arrayContaining([{ goodsPurchases: { some: { number: { contains: "PB-2026", mode: "insensitive" } } } }]) });
  });
  it("returns the flow version and rejection details for list rows", async () => {
    findMany.mockResolvedValueOnce([{
      id: "request-1", number: "DB-1", name: "Belanja", status: "REJECTED",
      approvalFlowVersion: 2, supplierId: null, supplier: null,
      requestedByName: "A", approvedByName: null, approvedById: null,
      rejectedByName: "B", rejectionReason: "Perlu revisi",
      rejectedAt: new Date("2026-10-10T01:00:00.000Z"),
      _count: { items: 0 }, items: [],
      goodsPurchases: [
        { id: "purchase-1", number: "PB-1", status: "APPROVED", fulfillmentStatus: "NOT_RECEIVED", totalAmount: { toString: () => "15000" } },
        { id: "purchase-old", number: "PB-OLD", status: "REJECTED", fulfillmentStatus: "NOT_RECEIVED", totalAmount: { toString: () => "12000" } },
      ],
      createdAt: new Date("2026-10-10T00:00:00.000Z"),
      approvedAt: null, note: null, stockAppliedAt: null,
    }]);

    const [row] = await listShoppingRequests({ storeId: "store-1", skip: 0, take: 10 });

    expect(row).toMatchObject({
      approvalFlowVersion: 2,
      rejectedByName: "B",
      rejectionReason: "Perlu revisi",
      rejectedAt: "2026-10-10T01:00:00.000Z",
      purchase: { id: "purchase-1", number: "PB-1", status: "APPROVED", totalAmount: 15000 },
      purchaseHistory: [
        { id: "purchase-1", number: "PB-1" },
        { id: "purchase-old", number: "PB-OLD" },
      ],
    });
  });
});
