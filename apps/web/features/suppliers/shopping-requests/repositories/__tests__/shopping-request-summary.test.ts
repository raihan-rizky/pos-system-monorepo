import { beforeEach, describe, expect, it, vi } from "vitest";

const groupByMock = vi.hoisted(() => vi.fn());
const aggregateMock = vi.hoisted(() => vi.fn());

vi.mock("@pos/db", () => ({
  Prisma: {},
  db: {
    shoppingRequest: { groupBy: groupByMock },
    shoppingRequestItem: { aggregate: aggregateMock },
  },
}));

import * as repository from "../shopping-requests-repository";

type SummaryLoader = (storeId: string) => Promise<{
  pendingRequestCount: number;
  pendingRequestedQty: number;
  approvedRequestCount: number;
  fulfillmentRate: number;
}>;

function summaryLoader(): SummaryLoader {
  expect(repository).toHaveProperty("getShoppingRequestKpiSummary");
  return (
    repository as unknown as {
      getShoppingRequestKpiSummary: SummaryLoader;
    }
  ).getShoppingRequestKpiSummary;
}

describe("getShoppingRequestKpiSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns actionable request counts and quantities scoped to one store", async () => {
    groupByMock.mockResolvedValue([
      { status: "REQUESTED", _count: { _all: 4 } },
      { status: "APPROVED", _count: { _all: 3 } },
      { status: "CANCELLED", _count: { _all: 1 } },
    ]);
    aggregateMock
      .mockResolvedValueOnce({ _sum: { requestedQty: 37.5 } })
      .mockResolvedValueOnce({
        _sum: { requestedQty: 20, approvedQty: 15.1 },
      });

    await expect(summaryLoader()("store-utama")).resolves.toEqual({
      pendingRequestCount: 4,
      pendingRequestedQty: 37.5,
      approvedRequestCount: 3,
      fulfillmentRate: 75.5,
    });

    expect(groupByMock).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: "store-utama" } }),
    );
    expect(aggregateMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          shoppingRequest: { storeId: "store-utama" },
          decisionStatus: "PENDING",
        },
      }),
    );
    expect(aggregateMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          shoppingRequest: { storeId: "store-utama" },
          decisionStatus: { in: ["APPROVED", "REJECTED"] },
        },
      }),
    );
  });

  it("returns zero percent when no approved quantity exists", async () => {
    groupByMock.mockResolvedValue([]);
    aggregateMock
      .mockResolvedValueOnce({ _sum: { requestedQty: null } })
      .mockResolvedValueOnce({
        _sum: { requestedQty: null, approvedQty: null },
      });

    await expect(summaryLoader()("store-kosong")).resolves.toEqual({
      pendingRequestCount: 0,
      pendingRequestedQty: 0,
      approvedRequestCount: 0,
      fulfillmentRate: 0,
    });
  });
});
