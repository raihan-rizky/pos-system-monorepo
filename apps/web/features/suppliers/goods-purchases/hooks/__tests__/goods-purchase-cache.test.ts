import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  invalidateGoodsPurchaseMutationQueries,
  syncGoodsPurchaseCaches,
} from "../useGoodsPurchases";
import type {
  GoodsPurchaseDetail,
  GoodsPurchaseListResponse,
} from "../../types/goods-purchase";

const detail: GoodsPurchaseDetail = {
  id: "purchase-1",
  number: "PB-202607-001",
  shoppingRequestId: "request-1",
  shoppingRequestNumber: "DPB-202607-001",
  supplierId: "supplier-1",
  supplierName: "CV Kertas",
  status: "PENDING",
  itemCount: 1,
  pendingItemCount: 1,
  totalAmount: 20_000,
  createdByName: "Admin",
  createdAt: "2026-07-24T00:00:00.000Z",
  approvedAt: null,
  rejectedAt: null,
  approvedByName: null,
  rejectedByName: null,
  rejectionReason: null,
  items: [],
};

describe("goods purchase cache helpers", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
    queryClient.setQueryData<GoodsPurchaseListResponse>(
      ["goods-purchases", { page: 1 }],
      {
        data: [{ ...detail }],
        pagination: {
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
      },
    );
  });

  it("syncs item mutations into detail and history", () => {
    syncGoodsPurchaseCaches(queryClient, detail);

    expect(
      queryClient.getQueryData(["goods-purchases", detail.id]),
    ).toEqual({ data: detail });
    expect(
      queryClient.getQueryData(["goods-purchases", { page: 1 }]),
    ).toEqual(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            id: detail.id,
            pendingItemCount: detail.pendingItemCount,
            totalAmount: detail.totalAmount,
          }),
        ],
      }),
    );
  });

  it("invalidates finance and products only after finalization", () => {
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    invalidateGoodsPurchaseMutationQueries(queryClient, false);
    expect(invalidateSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["finance"] }),
    );

    invalidateGoodsPurchaseMutationQueries(queryClient, true);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["finance"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["products"],
    });
  });
});
