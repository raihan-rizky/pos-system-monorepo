export interface ProductImportWorkerConfig {
  storeId: string;
  pollIntervalMs: number;
  errorBackoffMs: number;
}

type ProductImportWorkerEnvironment = Record<string, string | undefined>;

function positiveInteger(name: string, value: string | undefined, fallback: number) {
  if (value == null || value.trim() === "") return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} harus berupa bilangan bulat positif.`);
  }
  return parsed;
}

export function readProductImportWorkerConfig(
  environment: ProductImportWorkerEnvironment = process.env,
): ProductImportWorkerConfig {
  return {
    storeId: environment.PRODUCT_IMPORT_WORKER_STORE_ID?.trim() || "store-main",
    pollIntervalMs: positiveInteger(
      "PRODUCT_IMPORT_WORKER_POLL_MS",
      environment.PRODUCT_IMPORT_WORKER_POLL_MS,
      2_000,
    ),
    errorBackoffMs: positiveInteger(
      "PRODUCT_IMPORT_WORKER_ERROR_BACKOFF_MS",
      environment.PRODUCT_IMPORT_WORKER_ERROR_BACKOFF_MS,
      30_000,
    ),
  };
}

interface ProductImportWorkerJob {
  id: string;
  status: string;
}

interface ProductImportWorkerLoopDependencies {
  processNextJob: (
    storeId: string,
    control: { shouldStop: () => boolean },
  ) => Promise<ProductImportWorkerJob | null>;
  sleep: (milliseconds: number) => Promise<void>;
  log: (message: string, meta?: Record<string, unknown>) => void;
  isStopping: () => boolean;
}

export async function runProductImportWorkerLoop(
  config: ProductImportWorkerConfig,
  dependencies: ProductImportWorkerLoopDependencies,
) {
  dependencies.log("worker.started", {
    storeId: config.storeId,
    pollIntervalMs: config.pollIntervalMs,
  });

  while (!dependencies.isStopping()) {
    try {
      const job = await dependencies.processNextJob(config.storeId, {
        shouldStop: dependencies.isStopping,
      });
      if (job) {
        dependencies.log("job.processed", { jobId: job.id, status: job.status });
      } else if (!dependencies.isStopping()) {
        await dependencies.sleep(config.pollIntervalMs);
      }
    } catch (error) {
      dependencies.log("worker.error", {
        error: error instanceof Error ? error.message : String(error),
        retryInMs: config.errorBackoffMs,
      });
      if (!dependencies.isStopping()) {
        await dependencies.sleep(config.errorBackoffMs);
      }
    }
  }

  dependencies.log("worker.stopped");
}
