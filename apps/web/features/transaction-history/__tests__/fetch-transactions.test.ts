import { describe, it, expect } from "vitest";
import { fetchTransactionsAndCount } from "../helpers/fetch-transactions";

function delayed<T>(value: T, ms: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

describe("fetchTransactionsAndCount", () => {
  it("returns the items and total from the two underlying queries", async () => {
    const result = await fetchTransactionsAndCount({
      count: () => Promise.resolve(42),
      findMany: () => Promise.resolve([{ id: "tx-1" }]),
    });

    expect(result).toEqual({ items: [{ id: "tx-1" }], total: 42 });
  });

  it("runs count and findMany in parallel, not serially", async () => {
    const start = Date.now();

    await fetchTransactionsAndCount({
      count: () => delayed(0, 80),
      findMany: () => delayed([], 80),
    });

    const elapsed = Date.now() - start;
    // Serial would be ~160ms. Parallel should land near 80ms; allow generous
    // slack for slow CI machines but reject anything close to serial.
    expect(elapsed).toBeLessThan(140);
  });

  it("propagates rejection from either query", async () => {
    await expect(
      fetchTransactionsAndCount({
        count: () => Promise.reject(new Error("count failed")),
        findMany: () => Promise.resolve([]),
      }),
    ).rejects.toThrow("count failed");

    await expect(
      fetchTransactionsAndCount({
        count: () => Promise.resolve(0),
        findMany: () => Promise.reject(new Error("find failed")),
      }),
    ).rejects.toThrow("find failed");
  });
});
