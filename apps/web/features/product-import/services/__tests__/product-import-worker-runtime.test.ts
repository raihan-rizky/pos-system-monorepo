import { describe, expect, it, vi } from "vitest";

describe("product import worker runtime", () => {
  it("rejects invalid polling configuration before the worker starts", async () => {
    const runtime = await import(
      "../../../../../../packages/product-import-worker/src/runtime"
    ).catch(() => null);

    expect(runtime?.readProductImportWorkerConfig).toBeTypeOf("function");
    expect(() =>
      runtime?.readProductImportWorkerConfig({
        PRODUCT_IMPORT_WORKER_POLL_MS: "0",
        PRODUCT_IMPORT_WORKER_ERROR_BACKOFF_MS: "not-a-number",
      }),
    ).toThrow("PRODUCT_IMPORT_WORKER_POLL_MS harus berupa bilangan bulat positif.");
  });

  it("uses the configured store id when one is provided", async () => {
    const runtime = await import(
      "../../../../../../packages/product-import-worker/src/runtime"
    );

    expect(
      runtime.readProductImportWorkerConfig({
        PRODUCT_IMPORT_WORKER_STORE_ID: "store-cabang",
      }).storeId,
    ).toBe("store-cabang");
  });

  it("passes the shutdown signal into active job processing", async () => {
    const runtime = await import(
      "../../../../../../packages/product-import-worker/src/runtime"
    );
    let stopping = false;
    const processNextJob = vi.fn(async (
      _storeId: string,
      control: { shouldStop?: () => boolean },
    ) => {
      stopping = true;
      expect(control.shouldStop?.()).toBe(true);
      return { id: "job-1", status: "PENDING" };
    });

    expect(runtime.runProductImportWorkerLoop).toBeTypeOf("function");
    await runtime.runProductImportWorkerLoop(
      {
        storeId: "store-main",
        pollIntervalMs: 2_000,
        errorBackoffMs: 30_000,
      },
      {
        processNextJob,
        sleep: vi.fn(),
        log: vi.fn(),
        isStopping: () => stopping,
      },
    );

    expect(processNextJob).toHaveBeenCalledTimes(1);
  });
});
