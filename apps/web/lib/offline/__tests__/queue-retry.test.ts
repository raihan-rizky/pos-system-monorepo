import { afterEach, expect, it, vi } from "vitest";
import * as store from "../offline-db";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([
  [{ originCashierId: "cashier-1", originStoreId: "store-1" }, true],
  [{ originCashierId: "cashier-2", originStoreId: "store-1" }, false],
  [{}, false],
])("only retries a failed sale with matching origin: %o", async (payload, allowed) => {
  const retry = Reflect.get(store, "retryOfflineTransaction") as ((id: string, identity: object) => Promise<void>) | undefined;
  expect(retry).toBeTypeOf("function");
  vi.spyOn(store.offlineDb.offlineTransactions, "get").mockResolvedValue({
    clientMutationId: "sale-1", status: "FAILED_FINAL", payload, serverTransactionId: null,
  } as never);
  const update = vi.spyOn(store.offlineDb.offlineTransactions, "update").mockResolvedValue(1);
  vi.spyOn(store.offlineDb, "transaction").mockImplementation((async (...args: unknown[]) =>
    (args.at(-1) as () => Promise<unknown>)()) as typeof store.offlineDb.transaction);
  vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  vi.stubGlobal("CustomEvent", class {});

  const result = retry!("sale-1", { cashierId: "cashier-1", storeId: "store-1" });
  if (allowed) {
    await result;
    expect(update).toHaveBeenCalledWith("sale-1", expect.objectContaining({ status: "PENDING_SYNC" }));
  } else {
    await expect(result).rejects.toThrow();
    expect(update).not.toHaveBeenCalled();
  }
});
