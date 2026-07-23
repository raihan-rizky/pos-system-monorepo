"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import {
  addGoodsPurchaseItem,
  approveGoodsPurchaseItem,
  createGoodsPurchase,
  editGoodsPurchaseItem,
  getEligibleShoppingRequests,
  getGoodsPurchase,
  getLargeUnitProducts,
  listGoodsPurchases,
  rejectGoodsPurchase,
  removeGoodsPurchaseItem,
} from "../api/goods-purchases-api";
import type {
  AddGoodsPurchaseItemInput,
  CreateGoodsPurchaseInput,
  EditGoodsPurchaseItemInput,
  GoodsPurchaseDetail,
  GoodsPurchaseListParams,
  GoodsPurchaseListResponse,
  GoodsPurchaseMutationResult,
} from "../types/goods-purchase";

export function useGoodsPurchases(
  params: GoodsPurchaseListParams = {},
) {
  return useQuery({
    queryKey: ["goods-purchases", params],
    queryFn: () => listGoodsPurchases(params),
    placeholderData: keepPreviousData,
  });
}

export function useGoodsPurchase(id: string | null) {
  return useQuery({
    queryKey: ["goods-purchases", id],
    queryFn: () => getGoodsPurchase(id!),
    enabled: Boolean(id),
  });
}

export function useEligibleShoppingRequests(q = "") {
  return useQuery({
    queryKey: ["goods-purchases", "eligible", q],
    queryFn: () => getEligibleShoppingRequests(q || undefined),
  });
}

export function useLargeUnitProducts(q = "", enabled = true) {
  return useQuery({
    queryKey: ["goods-purchases", "large-unit-products", q],
    queryFn: () => getLargeUnitProducts(q || undefined),
    enabled,
  });
}

export function useCreateGoodsPurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoodsPurchaseInput) =>
      createGoodsPurchase(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goods-purchases"] });
      queryClient.invalidateQueries({
        queryKey: ["goods-purchases", "eligible"],
      });
    },
  });
}

function useItemMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<GoodsPurchaseMutationResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (result) => {
      syncGoodsPurchaseCaches(queryClient, result.data);
      invalidateGoodsPurchaseMutationQueries(
        queryClient,
        result.finalized,
      );
    },
  });
}

export function useApproveGoodsPurchaseItem() {
  return useItemMutation(
    ({ id, itemId }: { id: string; itemId: string }) =>
      approveGoodsPurchaseItem(id, itemId),
  );
}

export function useEditGoodsPurchaseItem() {
  return useItemMutation(
    ({
      id,
      itemId,
      input,
    }: {
      id: string;
      itemId: string;
      input: EditGoodsPurchaseItemInput;
    }) => editGoodsPurchaseItem(id, itemId, input),
  );
}

export function useRemoveGoodsPurchaseItem() {
  return useItemMutation(
    ({ id, itemId }: { id: string; itemId: string }) =>
      removeGoodsPurchaseItem(id, itemId),
  );
}

export function useAddGoodsPurchaseItem() {
  return useItemMutation(
    ({
      id,
      input,
    }: {
      id: string;
      input: AddGoodsPurchaseItemInput;
    }) => addGoodsPurchaseItem(id, input),
  );
}

export function useRejectGoodsPurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      rejectGoodsPurchase(id, reason),
    onSuccess: ({ data }) => {
      syncGoodsPurchaseCaches(queryClient, data);
      queryClient.invalidateQueries({ queryKey: ["goods-purchases"] });
      queryClient.invalidateQueries({
        queryKey: ["goods-purchases", "eligible"],
      });
    },
  });
}

export function syncGoodsPurchaseCaches(
  queryClient: QueryClient,
  detail: GoodsPurchaseDetail,
): void {
  queryClient.setQueryData(["goods-purchases", detail.id], {
    data: detail,
  });
  queryClient.setQueriesData<GoodsPurchaseListResponse>(
    {
      queryKey: ["goods-purchases"],
      predicate: (query) => {
        const scope = query.queryKey[1];
        return typeof scope === "object" && scope !== null;
      },
    },
    (current) => {
      if (!current) return current;
      return {
        ...current,
        data: current.data.map((row) =>
          row.id === detail.id
            ? {
                ...row,
                status: detail.status,
                pendingItemCount: detail.pendingItemCount,
                itemCount: detail.itemCount,
                totalAmount: detail.totalAmount,
                approvedAt: detail.approvedAt,
                rejectedAt: detail.rejectedAt,
              }
            : row,
        ),
      };
    },
  );
}

export function invalidateGoodsPurchaseMutationQueries(
  queryClient: QueryClient,
  finalized: boolean,
): void {
  if (!finalized) return;
  for (const queryKey of [
    ["finance"],
    ["financial-report"],
    ["products"],
    ["dashboard"],
    ["goods-purchases", "eligible"],
  ]) {
    queryClient.invalidateQueries({ queryKey });
  }
}
