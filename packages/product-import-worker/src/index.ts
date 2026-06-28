const productImportJobs = await import(
  "../../../apps/web/features/product-import/services/product-import-job-service.ts"
);

const POLL_INTERVAL_MS = Number(process.env.PRODUCT_IMPORT_WORKER_POLL_MS ?? 2_000);
const ERROR_BACKOFF_MS = Number(process.env.PRODUCT_IMPORT_WORKER_ERROR_BACKOFF_MS ?? 30_000);

function getWorkerStoreId() {
  const storeId = process.env.PRODUCT_IMPORT_WORKER_STORE_ID;
  if (!storeId) throw new Error("PRODUCT_IMPORT_WORKER_STORE_ID env var is required");
  return storeId;
}

let stopping = false;

function log(message: string, meta?: Record<string, unknown>) {
  const payload = {
    time: new Date().toISOString(),
    name: "product-import-worker",
    message,
    ...(meta ?? {}),
  };
  console.warn(JSON.stringify(payload));
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOnce() {
  const job = await productImportJobs.processNextProductImportJob(getWorkerStoreId());
  if (job) {
    log("job.processed", { jobId: job.id, status: job.status });
    return true;
  }
  return false;
}

async function runLoop() {
  log("worker.started", { pollIntervalMs: POLL_INTERVAL_MS });
  while (!stopping) {
    try {
      const processed = await runOnce();
      if (!processed) {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (error) {
      log("worker.error", {
        error: error instanceof Error ? error.message : String(error),
        retryInMs: ERROR_BACKOFF_MS,
      });
      await sleep(ERROR_BACKOFF_MS);
    }
  }
  log("worker.stopped");
}

process.on("SIGINT", () => {
  stopping = true;
});

process.on("SIGTERM", () => {
  stopping = true;
});

const args = new Set(process.argv.slice(2));

if (args.has("--cleanup")) {
  const result = await productImportJobs.cleanupExpiredProductImportJobs();
  log("cleanup.completed", { deletedCount: result.count });
} else if (args.has("--once")) {
  await runOnce();
} else {
  await runLoop();
}
