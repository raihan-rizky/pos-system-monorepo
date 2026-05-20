import type { QueryClient } from "@tanstack/react-query";

type TransactionLike = {
  id: string;
};

type PaginatedTransactionResult<T extends TransactionLike> = {
  data: T[];
  pagination: unknown;
};

/**
 * Cache invalidations that approve / reject / update / delete must trigger.
 *
 * Replaces the previous `window.location.reload()` in the approve and reject
 * modals so the cashier never loses scroll position, modal state, or the
 * sub-second feel of the page after acting on a row.
 *
 * - transaction-history: the paginated list rendered on /history
 * - transactions: the unpaginated list used by other dashboards
 * - products: approve decrements stock
 * - job-orders: a completed approval can promote a row into production
 */
export function invalidateTransactionViews(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["transaction-history"] });
  queryClient.invalidateQueries({ queryKey: ["transactions"] });
  queryClient.invalidateQueries({ queryKey: ["products"] });
  queryClient.invalidateQueries({ queryKey: ["job-orders"] });
}

function replaceTransaction<T extends TransactionLike>(
  rows: T[],
  transaction: T,
): T[] {
  let changed = false;
  const next = rows.map((row) => {
    if (row.id !== transaction.id) return row;
    changed = true;
    return { ...row, ...transaction };
  });

  return changed ? next : rows;
}

export function updateTransactionInHistoryCaches<T extends TransactionLike>(
  queryClient: QueryClient,
  transaction: T,
): void {
  queryClient.setQueriesData<PaginatedTransactionResult<T>>(
    { queryKey: ["transaction-history"] },
    (old) => {
      if (!old || !Array.isArray(old.data)) return old;
      return {
        ...old,
        data: replaceTransaction(old.data, transaction),
      };
    },
  );

  queryClient.setQueryData<T[]>(["transactions"], (old) => {
    if (!Array.isArray(old)) return old;
    return replaceTransaction(old, transaction);
  });
}

export function scheduleTransactionViewInvalidation(queryClient: QueryClient): void {
  const schedule: (callback: () => void) => void =
    typeof window !== "undefined" &&
    typeof (window as unknown as { requestIdleCallback?: unknown }).requestIdleCallback === "function"
      ? (callback) =>
          (window as unknown as {
            requestIdleCallback: (
              callback: () => void,
              opts?: { timeout: number },
            ) => number;
          }).requestIdleCallback(callback, { timeout: 1000 })
      : (callback) => {
          setTimeout(callback, 250);
        };

  schedule(() => invalidateTransactionViews(queryClient));
}
