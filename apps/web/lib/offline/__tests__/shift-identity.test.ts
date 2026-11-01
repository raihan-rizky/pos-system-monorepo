import { afterEach, expect, it, vi } from "vitest";
import { getOfflineActiveShift, offlineDb } from "../offline-db";

afterEach(() => vi.restoreAllMocks());

it("only returns an open local shift belonging to the current cashier and store", async () => {
  const rows = [
    { id: "other-cashier", status: "OPEN", cashierId: "cashier-2", storeId: "store-1" },
    { id: "other-store", status: "OPEN", cashierId: "cashier-1", storeId: "store-2" },
    { id: "mine", status: "OPEN", cashierId: "cashier-1", storeId: "store-1" },
  ];
  let selected = rows;
  const collection = {
    equals: (status: string) => { selected = rows.filter(row => row.status === status); return collection; },
    filter: (predicate: (row: typeof rows[number]) => boolean) => { selected = selected.filter(predicate); return collection; },
    first: async () => selected[0],
  };
  vi.spyOn(offlineDb.offlineShifts, "where").mockReturnValue(collection as never);

  expect(await getOfflineActiveShift({ cashierId: "cashier-1", storeId: "store-1" })).toMatchObject({ id: "mine" });
});
