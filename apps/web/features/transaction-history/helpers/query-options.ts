/**
 * History page polling contract.
 *
 * The cashier monitors PENDING_APPROVAL requests on this page and must not
 * have to reload to see new ones. We poll every 5 s while the tab is visible,
 * pause while it's hidden, and refetch immediately on focus.
 *
 * staleTime: 0 is required because the global QueryClient sets it to 5 min;
 * without this override, refetchInterval would see fresh cache and skip the
 * network call.
 */
export function buildHistoryQueryOptions() {
  return {
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
    placeholderData: <T>(prev: T): T => prev,
  } as const;
}
