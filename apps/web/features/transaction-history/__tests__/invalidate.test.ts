import { afterEach, describe, it, expect, vi } from "vitest";
import {
  invalidateTransactionViews,
  scheduleTransactionViewInvalidation,
  updateTransactionInHistoryCaches,
} from "../helpers/invalidate";

function createFakeQueryClient() {
  const invalidateQueries = vi.fn();
  const setQueriesData = vi.fn();
  const setQueryData = vi.fn();
  return {
    invalidateQueries,
    setQueriesData,
    setQueryData,
    client: { invalidateQueries, setQueriesData, setQueryData },
  };
}

describe("invalidateTransactionViews", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("invalidates the paginated history query so the page picks up the new state", () => {
    const { client, invalidateQueries } = createFakeQueryClient();
    invalidateTransactionViews(client as any);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["transaction-history"] });
  });

  it("invalidates the legacy transactions list used elsewhere in the app", () => {
    const { client, invalidateQueries } = createFakeQueryClient();
    invalidateTransactionViews(client as any);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["transactions"] });
  });

  it("invalidates products because approve mutates stock", () => {
    const { client, invalidateQueries } = createFakeQueryClient();
    invalidateTransactionViews(client as any);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["products"] });
  });

  it("invalidates job-orders because approving may move an order into production", () => {
    const { client, invalidateQueries } = createFakeQueryClient();
    invalidateTransactionViews(client as any);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["job-orders"] });
  });

  it("does not perform any other cache work", () => {
    const { client, invalidateQueries } = createFakeQueryClient();
    invalidateTransactionViews(client as any);
    expect(invalidateQueries).toHaveBeenCalledTimes(4);
  });

  it("updates visible history and transaction caches without a network refetch", () => {
    const { client, setQueriesData, setQueryData, invalidateQueries } = createFakeQueryClient();
    updateTransactionInHistoryCaches(client as any, {
      id: "tx-2",
      status: "COMPLETED",
      paymentMethod: "CASH",
    });

    const historyUpdater = setQueriesData.mock.calls[0][1];
    const transactionUpdater = setQueryData.mock.calls[0][1];

    expect(setQueriesData).toHaveBeenCalledWith(
      { queryKey: ["transaction-history"] },
      expect.any(Function),
    );
    expect(historyUpdater({
      data: [
        { id: "tx-1", status: "PENDING_APPROVAL" },
        { id: "tx-2", status: "PENDING_APPROVAL" },
      ],
      pagination: { total: 2 },
    })).toEqual({
      data: [
        { id: "tx-1", status: "PENDING_APPROVAL" },
        { id: "tx-2", status: "COMPLETED", paymentMethod: "CASH" },
      ],
      pagination: { total: 2 },
    });
    expect(transactionUpdater([
      { id: "tx-2", status: "PENDING_APPROVAL" },
    ])).toEqual([
      { id: "tx-2", status: "COMPLETED", paymentMethod: "CASH" },
    ]);
    expect(invalidateQueries).not.toHaveBeenCalled();
  });

  it("defers broad approval refresh work so the cashier can continue on the current page", () => {
    vi.useFakeTimers();
    const { client, invalidateQueries } = createFakeQueryClient();

    scheduleTransactionViewInvalidation(client as any);
    expect(invalidateQueries).not.toHaveBeenCalled();

    vi.advanceTimersByTime(250);
    expect(invalidateQueries).toHaveBeenCalledTimes(4);
  });
});
