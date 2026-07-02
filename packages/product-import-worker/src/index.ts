import { createProcessOnceRunner, log, sleep } from "./runner.ts";
import {
  readProductImportWorkerConfig,
  runProductImportWorkerLoop,
} from "./runtime.ts";

let stopping = false;
const runOnce = createProcessOnceRunner();

process.on("SIGINT", () => {
  stopping = true;
});

process.on("SIGTERM", () => {
  stopping = true;
});

const args = new Set(process.argv.slice(2));

if (args.has("--cleanup")) {
  const productImportJobs = await import(
    "../../../apps/web/features/product-import/services/product-import-job-service.ts"
  );
  const result = await productImportJobs.cleanupExpiredProductImportJobs();
  log("cleanup.completed", { deletedCount: result.count });
} else if (args.has("--once")) {
  await runOnce();
} else {
  const productImportJobs = await import(
    "../../../apps/web/features/product-import/services/product-import-job-service.ts"
  );
  const config = readProductImportWorkerConfig();
  await runProductImportWorkerLoop(config, {
    processNextJob: productImportJobs.processNextProductImportJob,
    sleep,
    log,
    isStopping: () => stopping,
  });
}
