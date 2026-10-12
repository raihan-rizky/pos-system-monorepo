import { beforeEach, describe, expect, it, vi } from "vitest";

const countMock = vi.hoisted(() => vi.fn());
const findManyMock = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", () => ({ Prisma: {}, db: { shoppingRequest: { count: countMock, findMany: findManyMock } } }));

import { buildShoppingRequestWhere, countShoppingRequests, listShoppingRequests } from "../shopping-requests-repository";

describe("filter penerimaan Daftar Belanja", () => {
  beforeEach(() => { vi.clearAllMocks(); countMock.mockResolvedValue(0); findManyMock.mockResolvedValue([]); });

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
