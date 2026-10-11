import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hooks = vi.hoisted(() => ({
  client: null as QueryClient | null,
  onSuccess: null as ((result?: unknown) => void) | null,
}));
vi.mock("@tanstack/react-query", async (original) => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQueryClient: () => hooks.client,
  useMutation: (options: { onSuccess: (result?: unknown) => void }) => {
    hooks.onSuccess = options.onSuccess;
    return {};
  },
}));

import { useFinalizeShoppingRequest, useApproveShoppingRequest } from "../useShoppingRequests";
import { useCreateGoodsPurchase, useRejectGoodsPurchase, useApproveGoodsPurchaseItem } from "../../../goods-purchases/hooks/useGoodsPurchases";

const listKey = ["shopping-requests", { page: 1 }];
const detailKey = ["shopping-requests", "request-1"];
const financeKey = ["finance", "expense-list", "2026-10", 1];
const reportKey = ["financial-report", { dateFrom: "2026-10-01", dateTo: "2026-10-31" }];
const productsKey = ["products", { q: "kertas" }];
const unitsKey = ["shopping-request-unit-variants", "product-1"];
const priceLogsKey = ["product-price-logs", { productId: "product-1", field: "COST_PRICE" }];
const stockGroupKey = ["stock-group", "detail", "group-1"];
const receiptKey = ["inventory-management", "receipts"];

describe("purchase mutation cache coherence", () => {
  beforeEach(() => {
    hooks.client = new QueryClient();
    for (const key of [listKey, detailKey, financeKey, reportKey, productsKey, unitsKey, priceLogsKey, stockGroupKey, receiptKey]) {
      hooks.client.setQueryData(key, { data: [] });
    }
    hooks.onSuccess = null;
  });

  it.each([
    ["create", useCreateGoodsPurchase],
    ["reject", useRejectGoodsPurchase],
    ["review", useApproveGoodsPurchaseItem],
  ])("refreshes the combined request history after legacy purchase %s", (_name, useHook) => {
    useHook();
    hooks.onSuccess!({ data: { id: "purchase-1" }, finalized: false });
    expect(hooks.client!.getQueryState(listKey)?.isInvalidated).toBe(true);
    expect(hooks.client!.getQueryState(detailKey)?.isInvalidated).toBe(true);
    expect(hooks.client!.getQueryState(financeKey)?.isInvalidated).toBe(false);
    expect(hooks.client!.getQueryState(receiptKey)?.isInvalidated).toBe(false);
  });

  it("refreshes actual expense and HPP caches when unified approval succeeds", () => {
    useFinalizeShoppingRequest();
    hooks.onSuccess!();
    for (const key of [listKey, detailKey, financeKey, reportKey, productsKey, unitsKey, priceLogsKey, stockGroupKey]) {
      expect(hooks.client!.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    expect(hooks.client!.getQueryState(receiptKey)?.isInvalidated).toBe(false);
  });

  it("refreshes the same finance and HPP caches when a legacy purchase finishes", () => {
    useApproveGoodsPurchaseItem();
    hooks.onSuccess!({ data: { id: "purchase-1" }, finalized: true });
    for (const key of [listKey, detailKey, financeKey, reportKey, productsKey, unitsKey, priceLogsKey, stockGroupKey]) {
      expect(hooks.client!.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
    expect(hooks.client!.getQueryState(receiptKey)?.isInvalidated).toBe(false);
  });

  it("does not invalidate finance or stock when legacy quantity-only approval succeeds", () => {
    hooks.client!.removeQueries({ queryKey: ["shopping-requests"] });
    useApproveShoppingRequest();
    hooks.onSuccess!({ data: { id: "request-1", items: [] } });
    for (const key of [financeKey, productsKey, priceLogsKey, stockGroupKey, receiptKey]) {
      expect(hooks.client!.getQueryState(key)?.isInvalidated).toBe(false);
    }
  });
});
