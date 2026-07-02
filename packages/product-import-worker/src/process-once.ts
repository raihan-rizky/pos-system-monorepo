import { ONCE_RESULT_PREFIX, log } from "./runner.ts";
import { readProductImportWorkerConfig } from "./runtime.ts";

const productImportJobs = await import(
  "../../../apps/web/features/product-import/services/product-import-job-service.ts"
);

let stopping = false;
process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

const config = readProductImportWorkerConfig();
const job = await productImportJobs.processNextProductImportJob(config.storeId, {
  shouldStop: () => stopping,
});

if (job) {
  log("job.processed", { jobId: job.id, status: job.status });
}

console.log(
  `${ONCE_RESULT_PREFIX}${JSON.stringify({
    processed: Boolean(job),
  })}`
);
