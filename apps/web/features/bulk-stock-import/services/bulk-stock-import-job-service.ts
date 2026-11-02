import { db, Prisma } from "@pos/db";
import { after } from "next/server";
import { z } from "zod";

import { getLogger } from "@/lib/logger";
import { bulkStockImportRepository } from "../repositories/BulkStockImportRepository";
import {
  commitBulkStockImport,
  type BulkStockImportCommitRowInput,
} from "./bulk-stock-import-service";
import type { BulkStockImportMode } from "../helpers/import-core";
import type { BulkStockImportUser } from "../repositories/BulkStockImportRepository";

const logger = getLogger("features:bulk-stock-import:jobs");

const BULK_STOCK_IMPORT_JOB_RETENTION_DAYS = 7;
const BULK_STOCK_IMPORT_JOB_MAX_ATTEMPTS = 3;
const BULK_STOCK_IMPORT_JOB_RETRY_DELAY_MS = 750;
// Leave time to persist the outcome before the route's 300-second deadline.
const BULK_STOCK_IMPORT_JOB_RUN_BUDGET_MS = 260_000;
const BULK_STOCK_IMPORT_JOB_STALE_MS = 360_000;

export const bulkStockImportJobCreateSchema = z.object({
  mode: z.enum(["ADD", "SET"]),
  rows: z.array(
    z.object({
      rowNumber: z.number().int().min(1),
      name: z.string().trim().min(1),
      category: z.string().trim().optional().default(""),
      unit: z.string().trim().min(1),
      stock: z.coerce.number(),
      selectedProductId: z.string().trim().min(1).optional(),
    }),
  ).min(1).max(3000),
  supplierId: z.string().trim().min(1).optional(),
  note: z.string().optional(),
  allowNegativeStock: z.boolean().optional().default(false),
});

export const bulkStockImportJobIdSchema = z.object({
  id: z.string().min(1),
});

export type BulkStockImportJobPayload = {
  mode: BulkStockImportMode;
  rows: BulkStockImportCommitRowInput[];
  supplierId?: string;
  note?: string;
  allowNegativeStock?: boolean;
};

function storeIdFor(user: BulkStockImportUser) {
  return user.storeId || "store-main";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function errorMessageFor(error: unknown) {
  return error instanceof Error ? error.message : "Failed to process stock import";
}

function errorCodeFor(error: unknown) {
  if (typeof error === "object" && error && "code" in error) {
    return String((error as { code?: unknown }).code ?? "");
  }
  return error instanceof Error ? error.name : "UNKNOWN_ERROR";
}

function isRetryableInfrastructureError(error: unknown) {
  const code = errorCodeFor(error);
  const message = errorMessageFor(error).toLowerCase();
  return (
    code === "P1001" ||
    code === "P1002" ||
    code === "P1008" ||
    code === "P1017" ||
    code === "P2024" ||
    message.includes("server has closed the connection") ||
    message.includes("connection") ||
    message.includes("closed") ||
    message.includes("reset") ||
    message.includes("pool") ||
    message.includes("timeout") ||
    message.includes("timed out")
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createBulkStockImportJob(
  input: BulkStockImportJobPayload,
  user: BulkStockImportUser,
) {
  const now = new Date();
  const job = await db.bulkStockImportJob.create({
    data: {
      storeId: storeIdFor(user),
      createdBy: user.id,
      createdByName: user.name ?? null,
      createdByRole: user.role,
      status: "PENDING",
      phase: "QUEUED",
      totalRows: input.rows.length,
      processedRows: 0,
      successRows: 0,
      failedRows: 0,
      payload: input as unknown as Prisma.InputJsonValue,
      retainUntil: addDays(now, BULK_STOCK_IMPORT_JOB_RETENTION_DAYS),
    },
  });

  logger.info("bulk_stock_import.job.created", {
    jobId: job.id,
    storeId: job.storeId,
    rowCount: job.totalRows,
  });

  return job;
}

async function expireStoppedBulkStockImportJobs(storeId: string) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - BULK_STOCK_IMPORT_JOB_STALE_MS);
  await db.bulkStockImportJob.updateMany({
    where: {
      storeId,
      status: { in: ["PENDING", "RUNNING"] },
      OR: [
        { lastHeartbeatAt: { lt: staleBefore } },
        { lastHeartbeatAt: null, createdAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: "FAILED",
      phase: "FAILED",
      errorCode: "JOB_EXECUTION_EXPIRED",
      errorMessage: "Proses impor terhenti karena melewati batas waktu. Periksa stok dan riwayat sebelum mengimpor ulang.",
      finishedAt: now,
    },
  });
}

export async function getActiveBulkStockImportJob(user: BulkStockImportUser) {
  await expireStoppedBulkStockImportJobs(storeIdFor(user));
  return db.bulkStockImportJob.findFirst({
    where: {
      storeId: storeIdFor(user),
      status: { in: ["PENDING", "RUNNING"] },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getBulkStockImportJobStatus(
  jobId: string,
  user: BulkStockImportUser,
) {
  await expireStoppedBulkStockImportJobs(storeIdFor(user));
  const job = await db.bulkStockImportJob.findFirst({
    where: { id: jobId, storeId: storeIdFor(user) },
  });
  if (!job) throw new Error("BULK_STOCK_IMPORT_JOB_NOT_FOUND");
  return job;
}

async function updateJobProgress(
  jobId: string,
  data: {
    status?: string;
    phase?: string;
    processedRows?: number;
    successRows?: number;
    failedRows?: number;
    result?: Prisma.InputJsonValue;
    errorCode?: string | null;
    errorMessage?: string | null;
    startedAt?: Date;
    finishedAt?: Date;
    retryAttempt?: number;
  },
  context: { totalRows?: number } = {},
) {
  const { retryAttempt, ...persistedData } = data;
  const updated = await db.bulkStockImportJob.update({
    where: { id: jobId },
    data: {
      ...persistedData,
      lastHeartbeatAt: new Date(),
    },
  });
  logger.info("bulk_stock_import.job.progress", {
    jobId,
    status: data.status ?? updated.status,
    phase: data.phase ?? updated.phase,
    processedRows: data.processedRows ?? updated.processedRows,
    totalRows: context.totalRows ?? updated.totalRows,
    successRows: data.successRows ?? updated.successRows,
    failedRows: data.failedRows ?? updated.failedRows,
    retryAttempt,
  });
  return updated;
}

function readPayload(value: Prisma.JsonValue): BulkStockImportJobPayload {
  return bulkStockImportJobCreateSchema.parse(value);
}

export async function processBulkStockImportJob(jobId: string) {
  const job = await db.bulkStockImportJob.findUnique({ where: { id: jobId } });
  if (!job) throw new Error("BULK_STOCK_IMPORT_JOB_NOT_FOUND");
  if (job.status !== "PENDING") return job;

  const startedAt = new Date();
  const deadline = startedAt.getTime() + BULK_STOCK_IMPORT_JOB_RUN_BUDGET_MS;
  const claim = await db.bulkStockImportJob.updateMany({
    where: { id: job.id, status: "PENDING" },
    data: {
      status: "RUNNING",
      phase: "VALIDATING",
      startedAt,
      lastHeartbeatAt: startedAt,
    },
  });
  if (claim.count === 0) {
    return db.bulkStockImportJob.findUnique({ where: { id: job.id } });
  }

  try {
    await updateJobProgress(job.id, { phase: "VALIDATING" });
    const payload = readPayload(job.payload);
    await updateJobProgress(job.id, { phase: "BUILDING_IMPACTS" });
    await updateJobProgress(job.id, {
      phase: "UPDATING_STOCK",
      processedRows: 0,
    });

    const actor = {
      id: job.createdBy,
      name: job.createdByName,
      role: job.createdByRole,
      storeId: job.storeId,
    };
    let result: Awaited<ReturnType<typeof commitBulkStockImport>> | null = null;
    for (let attempt = 1; attempt <= BULK_STOCK_IMPORT_JOB_MAX_ATTEMPTS; attempt += 1) {
      try {
        const remainingMs = deadline - Date.now() - 10_000;
        if (remainingMs < 1000) {
          throw new Error("Waktu pemrosesan impor habis. Periksa stok dan riwayat sebelum mengimpor ulang.");
        }
        result = await commitBulkStockImport(bulkStockImportRepository, {
          ...payload,
          user: actor,
          transactionTimeoutMs: Math.min(240_000, remainingMs),
        });
        break;
      } catch (error) {
        if (
          attempt >= BULK_STOCK_IMPORT_JOB_MAX_ATTEMPTS ||
          !isRetryableInfrastructureError(error)
        ) {
          throw error;
        }
        logger.warn("bulk_stock_import.job.retrying", {
          jobId: job.id,
          attempt,
          maxAttempts: BULK_STOCK_IMPORT_JOB_MAX_ATTEMPTS,
          errorCode: errorCodeFor(error),
          errorMessage: errorMessageFor(error),
        });
        await updateJobProgress(
          job.id,
          {
            status: "RUNNING",
            phase: "UPDATING_STOCK",
            retryAttempt: attempt,
            errorCode: errorCodeFor(error),
            errorMessage: errorMessageFor(error),
          },
          { totalRows: job.totalRows },
        );
        await wait(BULK_STOCK_IMPORT_JOB_RETRY_DELAY_MS * attempt);
      }
    }
    if (!result) throw new Error("Failed to process stock import");

    await updateJobProgress(job.id, {
      phase: "CREATING_LOGS",
      processedRows: job.totalRows,
    });
    await updateJobProgress(job.id, {
      phase: "FINALIZING",
      processedRows: job.totalRows,
    });

    const status = result.pendingApproval ? "PENDING_APPROVAL" : "COMMITTED";
    return updateJobProgress(job.id, {
      status,
      phase: "DONE",
      processedRows: job.totalRows,
      successRows: job.totalRows,
      failedRows: 0,
      result: result as unknown as Prisma.InputJsonValue,
      errorCode: null,
      errorMessage: null,
      finishedAt: new Date(),
    });
  } catch (error) {
    const message = errorMessageFor(error);
    logger.error("bulk_stock_import.job.failed", { jobId: job.id, error });
    return updateJobProgress(job.id, {
      status: "FAILED",
      phase: "FAILED",
      failedRows: job.totalRows,
      errorCode: errorCodeFor(error),
      errorMessage: message,
      finishedAt: new Date(),
    });
  }
}

export function startBulkStockImportJobProcessing(jobId: string) {
  after(async () => {
    try {
      await processBulkStockImportJob(jobId);
    } catch (error) {
      logger.error("bulk_stock_import.job.background.failed", { jobId, error });
    }
  });
}
