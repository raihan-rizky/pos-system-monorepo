import { describe, it, expect } from "vitest";
import { buildHistoryQueryOptions } from "../helpers/query-options";

describe("buildHistoryQueryOptions", () => {
  it("polls every 5 seconds so cashiers see new PENDING_APPROVAL rows without reloading", () => {
    const opts = buildHistoryQueryOptions();
    expect(opts.refetchInterval).toBe(5000);
  });

  it("pauses polling when the tab is hidden to avoid wasted requests", () => {
    const opts = buildHistoryQueryOptions();
    expect(opts.refetchIntervalInBackground).toBe(false);
  });

  it("refetches immediately when the cashier returns to the tab", () => {
    const opts = buildHistoryQueryOptions();
    expect(opts.refetchOnWindowFocus).toBe(true);
  });

  it("treats data as stale immediately so refetchInterval actually fires", () => {
    // The global QueryClient sets staleTime=5min; if we don't override here,
    // refetchInterval will see the data as fresh and skip the network call.
    const opts = buildHistoryQueryOptions();
    expect(opts.staleTime).toBe(0);
  });

  it("keeps the previous page's data visible during background refetches", () => {
    const opts = buildHistoryQueryOptions();
    const prev = { data: [{ id: "tx-1" }], pagination: { total: 1 } };
    expect(opts.placeholderData(prev)).toBe(prev);
    expect(opts.placeholderData(undefined)).toBeUndefined();
  });
});
