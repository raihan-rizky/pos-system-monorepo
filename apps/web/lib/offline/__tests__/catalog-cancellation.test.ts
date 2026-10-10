import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Dexie, { type Transaction } from "dexie";
import { cacheCatalogProducts, offlineDb } from "../offline-db";

type Row = { id: string; name: string; updatedAt?: string };

// Node has no IndexedDB runtime. Model only staging, abort and commit here;
// the controller also verifies this exported function against real Chromium IndexedDB.
function catalogStorage() {
  const rows = new Map<string, Row>([["paper", { id: "paper", name: "Lama" }]]);
  let staged: Map<string, Row> | undefined;
  let pending: (() => Promise<void>) | undefined;
  let beforeCommit: (() => void) | undefined;
  let beforeScope: (() => void) | undefined;
  let storageError: Error | undefined;
  const transaction = { active: true, abort: vi.fn(() => { transaction.active = false; }) };

  const bulkPut = vi.spyOn(offlineDb.catalogProducts, "bulkPut").mockImplementation((async (products: Row[]) => {
    if (storageError) throw storageError;
    const target = staged ?? rows;
    products.forEach(product => target.set(product.id, product));
    await pending?.();
    return products.at(-1)?.id;
  }) as typeof offlineDb.catalogProducts.bulkPut);

  const runTransaction = vi.spyOn(offlineDb, "transaction").mockImplementation((async (...args: unknown[]) => {
    staged = new Map(rows);
    beforeScope?.();
    const scope = args.at(-1) as (tx: Transaction) => Promise<unknown>;
    try {
      await scope(transaction as unknown as Transaction);
      beforeCommit?.();
      if (!transaction.active) throw new DOMException("Transaction aborted", "AbortError");
      rows.clear();
      staged.forEach((row, id) => rows.set(id, row));
      transaction.active = false;
    } catch (error) {
      // Dexie's transaction boundary maps native AbortErrors to DexieError.
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Dexie.AbortError(error.message, error);
      }
      throw error;
    } finally {
      staged = undefined;
      transaction.active = false;
    }
  }) as typeof offlineDb.transaction);

  return {
    rows, bulkPut, runTransaction, transaction,
    setPending: (callback: () => Promise<void>) => { pending = callback; },
    setBeforeCommit: (callback: () => void) => { beforeCommit = callback; },
    setBeforeScope: (callback: () => void) => { beforeScope = callback; },
    setStorageError: (error: Error) => { storageError = error; },
  };
}

describe("offline catalog cancellation", () => {
  let storage: ReturnType<typeof catalogStorage>;
  beforeEach(() => { storage = catalogStorage(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it.each([false, true])("persists products and timestamps (signal: %s)", async (signalled) => {
    await cacheCatalogProducts([{ id: "paper", name: "Baru" }], signalled ? new AbortController().signal : undefined);
    expect(storage.rows.get("paper")).toEqual({ id: "paper", name: "Baru", updatedAt: expect.any(String) });
    expect(Number.isNaN(Date.parse(storage.rows.get("paper")!.updatedAt!))).toBe(false);
  });

  it("rejects an already cancelled signal without changing existing rows", async () => {
    const controller = new AbortController();
    const reason = new Error("Obsolete search");
    controller.abort(reason);
    await expect(cacheCatalogProducts([{ id: "paper", name: "Baru" }], controller.signal)).rejects.toBe(reason);
    expect(storage.rows.get("paper")?.name).toBe("Lama");
    expect(storage.bulkPut).not.toHaveBeenCalled();
  });

  it("checks cancellation again when the transaction scope starts", async () => {
    const controller = new AbortController();
    const reason = new Error("Cancelled while opening database");
    storage.setBeforeScope(() => controller.abort(reason));
    await expect(cacheCatalogProducts([{ id: "paper", name: "Baru" }], controller.signal)).rejects.toBe(reason);
    expect(storage.bulkPut).not.toHaveBeenCalled();
    expect(storage.rows.get("paper")?.name).toBe("Lama");
  });

  it.each([
    ["default abort", undefined],
    ["explicit DOMException", new DOMException("Obsolete query", "AbortError")],
  ])("preserves the exact %s reason when cancelled before scope entry", async (_name, reason) => {
    const controller = new AbortController();
    storage.setBeforeScope(() => controller.abort(reason));
    const error = await cacheCatalogProducts([{ id: "paper", name: "Baru" }], controller.signal)
      .then(() => undefined, failure => failure);
    expect(error).toBe(controller.signal.reason);
    expect(storage.bulkPut).not.toHaveBeenCalled();
    expect(storage.rows.get("paper")?.name).toBe("Lama");
  });

  it("aborts pending writes atomically and permits subsequent persistence", async () => {
    const controller = new AbortController();
    const reason = { query: "obsolete" };
    let release!: () => void;
    storage.setPending(() => new Promise<void>(resolve => { release = resolve; }));
    const write = cacheCatalogProducts([{ id: "paper", name: "Baru" }, { id: "ink", name: "Tinta" }], controller.signal);
    const rejection = expect(write).rejects.toBe(reason);
    await Promise.resolve();
    controller.abort(reason);
    release();
    await rejection;
    expect(storage.transaction.abort).toHaveBeenCalledOnce();
    expect([...storage.rows.values()]).toEqual([{ id: "paper", name: "Lama" }]);
    storage.setPending(async () => {});
    await cacheCatalogProducts([{ id: "ink", name: "Tinta berikutnya" }]);
    expect(storage.rows.get("ink")?.name).toBe("Tinta berikutnya");
  });

  it("keeps cancellation active after bulkPut resolves until transaction commit", async () => {
    const controller = new AbortController();
    const reason = new Error("Cancelled before commit");
    storage.setBeforeCommit(() => controller.abort(reason));
    await expect(cacheCatalogProducts([{ id: "paper", name: "Baru" }], controller.signal)).rejects.toBe(reason);
    expect(storage.rows.get("paper")?.name).toBe("Lama");
  });

  it.each(["success", "cancellation", "failure"] as const)("removes the listener after %s", async (outcome) => {
    const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const reason = new Error(outcome);
    if (outcome === "failure") storage.setStorageError(reason);
    if (outcome === "cancellation") storage.setBeforeCommit(() => controller.abort(reason));
    const write = cacheCatalogProducts([{ id: "paper", name: "Baru" }], controller.signal);
    if (outcome === "success") await write;
    else await expect(write).rejects.toBe(reason);
    expect(add).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0][1]);
  });

  it("preserves a genuine storage error and allows a later abort without a listener", async () => {
    const controller = new AbortController();
    const error = new Error("Quota exhausted");
    storage.setStorageError(error);
    await expect(cacheCatalogProducts([{ id: "ink", name: "Tinta" }], controller.signal)).rejects.toBe(error);
    controller.abort(new Error("Later cancellation"));
    expect(storage.transaction.abort).not.toHaveBeenCalled();
    expect(storage.rows.has("ink")).toBe(false);
  });

  it("does not roll back committed writes on a later cancellation", async () => {
    const controller = new AbortController();
    await cacheCatalogProducts([{ id: "paper", name: "Baru" }], controller.signal);
    controller.abort();
    expect(storage.rows.get("paper")?.name).toBe("Baru");
    expect(storage.transaction.abort).not.toHaveBeenCalled();
  });
});
