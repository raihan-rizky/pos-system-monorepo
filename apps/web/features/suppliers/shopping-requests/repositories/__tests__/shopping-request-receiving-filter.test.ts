import { beforeEach, describe, expect, it, vi } from "vitest";

const countMock = vi.hoisted(() => vi.fn());
const findManyMock = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", () => ({ Prisma: {}, db: { shoppingRequest: { count: countMock, findMany: findManyMock } } }));

import { buildShoppingRequestWhere, countShoppingRequests, listShoppingRequests } from "../shopping-requests-repository";

describe("filter penerimaan Daftar Belanja", () => {
  beforeEach(() => { vi.clearAllMocks(); countMock.mockResolvedValue(0); findManyMock.mockResolvedValue([]); });

  it("returns stored payment details with the purchase on shopping request cards", async () => {
    findManyMock.mockResolvedValue([{
      id: "request-1", number: "DPB-1", name: "Belanja Kertas", status: "APPROVED", approvalFlowVersion: 2,
      supplierId: "supplier-1", supplier: { id: "supplier-1", name: "Supplier" }, requestedByName: "Admin", approvedByName: "Owner",
      createdAt: new Date("2026-10-19T00:00:00Z"), approvedAt: new Date("2026-10-19T01:00:00Z"),
      rejectedAt: null, rejectedByName: null, rejectionReason: null, note: null, stockAppliedAt: null,
      items: [], _count: { items: 0 }, goodsPurchases: [{
        id: "purchase-1", number: "PB-1", status: "APPROVED", fulfillmentStatus: "NOT_RECEIVED", totalAmount: 1000,
        paymentMethod: "GIRO", paymentDueDate: new Date("2026-11-02T00:00:00Z"),
      }],
    }]);
    const rows = await listShoppingRequests({ storeId: "store-1", skip: 0, take: 10 });
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({
      goodsPurchases: expect.objectContaining({ select: expect.objectContaining({ paymentMethod: true, paymentDueDate: true }) }),
    }) }));
    expect(rows[0].purchase).toMatchObject({ paymentMethod: "GIRO", paymentDueDate: "2026-11-02" });
    expect(rows[0].purchaseHistory?.[0]).toMatchObject({ paymentMethod: "GIRO", paymentDueDate: "2026-11-02" });
  });

  it.each(["NOT_RECEIVED", "PARTIALLY_RECEIVED", "RECEIVED"] as const)("filters approved purchases by %s before pagination for both rows and count", async (fulfillmentStatus) => {
    const filters = { storeId: "store-utama", status: "APPROVED" as const, supplierId: "supplier-1", q: "Data Print", fulfillmentStatus, skip: 10, take: 10 };
    const where = buildShoppingRequestWhere(filters);
    expect(where).toMatchObject({
      storeId: "store-utama", status: "APPROVED", supplierId: "supplier-1",
      goodsPurchases: { some: { status: "APPROVED", fulfillmentStatus } },
      OR: expect.arrayContaining([{ name: { contains: "Data Print", mode: "insensitive" } }]),
    });
    await countShoppingRequests(filters);
    await listShoppingRequests(filters);
    expect(countMock).toHaveBeenCalledWith({ where });
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ where, skip: 10, take: 10 }));
  });

  it("keeps all requests when no receiving filter is selected", () => {
    expect(buildShoppingRequestWhere({ storeId: "store-utama", skip: 0, take: 10 })).toEqual({ storeId: "store-utama" });
  });
});
