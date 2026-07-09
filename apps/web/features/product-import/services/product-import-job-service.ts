import { db, Prisma } from "@pos/db";
import { z } from "zod";

import { getLogger } from "@/lib/logger";

import {
  commitProductImportChunk,
  productImportStartSchema,
  startProductImportCommit,
  type CommitCounts,
  type ProductImportActor,
} from "./product-import-commit-service";

const logger = getLogger("features:product-import:jobs");

const PRODUCT_IMPORT_JOB_CHUNK_SIZE = 400;
const PRODUCT_IMPORT_JOB_RETENTION_DAYS = 30;
const PRODUCT_IMPORT_JOB_STALE_MS = 180_000;
const PRODUCT_IMPORT_JOB_ROW_MAX_ATTEMPTS = 3;
const PRODUCT_IMPORT_JOB_INFRA_RETRY_BASE_MS = 5_000;
const PRODUCT_IMPORT_JOB_INFRA_RETRY_MAX_MS = 5 * 60_000;

const ACTIVE_JOB_STATUSES = ["PENDING", "RUNNING", "CANCEL_REQUESTED"] as const;
const TERMINAL_JOB_STATUSES = ["COMPLETED", "COMPLETED_WITH_ERRORS", "FAILED", "CANCELLED"] as const;

export interface ProductImportWorkerControl {
  shouldStop?: () => boolean;
}

export const productImportJobCreateSchema = productImportStartSchema.extend({
  chunkSize: z.number().int().min(1).max(250).optional(),
});

export const productImportJobIdSchema = z.object({
  id: z.string().min(1),
});

function storeIdFor(user: ProductImportActor) {
  return user.storeId || "store-main";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function readCounts(summary: Prisma.JsonValue | null | undefined): CommitCounts {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return {
      createdProductCount: 0,
      variantProductCount: 0,
      updatedProductCount: 0,
      skippedRowCount: 0,
      conversionReviewCount: 0,
      createdCategoryCount: 0,
      inventoryLogCount: 0,
      priceLogCount: 0,
    };
  }
  const source = summary as Record<string, unknown>;
  return {
    createdProductCount: Number(source.createdProductCount ?? 0),
    variantProductCount: Number(source.variantProductCount ?? 0),
    updatedProductCount: Number(source.updatedProductCount ?? 0),
    skippedRowCount: Number(source.skippedRowCount ?? 0),
    conversionReviewCount: Number(source.conversionReviewCount ?? 0),
    createdCategoryCount: Number(source.createdCategoryCount ?? 0),
    inventoryLogCount: Number(source.inventoryLogCount ?? 0),
    priceLogCount: Number(source.priceLogCount ?? 0),
  };
}

function classifyError(error: unknown) {
  const prismaCode =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  if (error instanceof Error) {
    const message = error.message;
    const lowerMessage = message.toLowerCase();
    const code = prismaCode || message.split(":")[0] || "IMPORT_ROW_FAILED";
    const retryableInfrastructure =
      code === "P1001" ||
      code === "P1002" ||
      code === "P1008" ||
      code === "P1017" ||
      code === "P2024" ||
      lowerMessage.includes("connection") ||
      lowerMessage.includes("closed") ||
      lowerMessage.includes("reset") ||
      lowerMessage.includes("pool") ||
      lowerMessage.includes("timeout") ||
      lowerMessage.includes("timed out");

    return {
      code,
      message,
      retryableInfrastructure,
      retryable: retryableInfrastructure,
    };
  }

  return {
    code: "IMPORT_ROW_FAILED",
    message: "Unknown import row error",
    retryableInfrastructure: false,
    retryable: false,
  };
}

function infrastructureRetryDelayMs(attemptCount: number) {
  const exponent = Math.max(0, Math.min(attemptCount - 1, 6));
  return Math.min(
    PRODUCT_IMPORT_JOB_INFRA_RETRY_BASE_MS * 2 ** exponent,
    PRODUCT_IMPORT_JOB_INFRA_RETRY_MAX_MS,
  );
}

async function summarizeJob(jobId: string, options: { clearLastError?: boolean } = {}) {
  const [job, rows] = await Promise.all([
    db.productImportJob.findUnique({
      where: { id: jobId },
      include: { batchOperation: true },
    }),
    db.productImportJobRow.groupBy({
      by: ["status"],
      where: { jobId },
      _count: { _all: true },
    }),
  ]);

  if (!job) throw new Error("IMPORT_JOB_NOT_FOUND");

  const rowCounts = new Map(rows.map((row) => [row.status, row._count._all]));
  const successRows = rowCounts.get("SUCCEEDED") ?? 0;
  const failedRows = rowCounts.get("FAILED") ?? 0;
  const skippedRows = rowCounts.get("SKIPPED") ?? 0;
  const processedRows = successRows + failedRows + skippedRows;
  const counts = readCounts(job.batchOperation.summary);

  await db.productImportJob.update({
    where: { id: jobId },
    data: {
      processedRows,
      successRows,
      failedRows,
      skippedRows,
      ...(options.clearLastError ? { lastError: null } : {}),
      summary: {
        ...(job.summary as Record<string, unknown>),
        ...counts,
        processedRows,
        successRows,
        failedRows,
        skippedRows,
      },
      lastHeartbeatAt: new Date(),
    },
  });

  return { job, counts, processedRows, successRows, failedRows, skippedRows };
}

export async function createProductImportJob(
  input: z.infer<typeof productImportJobCreateSchema>,
  user: ProductImportActor,
) {
  const storeId = storeIdFor(user);
  const existingActiveJob = await db.productImportJob.findFirst({
    where: {
      storeId,
      status: { in: [...ACTIVE_JOB_STATUSES] },
    },
    select: { id: true, status: true },
  });

  if (existingActiveJob) {
    throw new Error(`ACTIVE_PRODUCT_IMPORT_JOB:${existingActiveJob.id}:${existingActiveJob.status}`);
  }

  const chunkSize = input.chunkSize ?? PRODUCT_IMPORT_JOB_CHUNK_SIZE;
  const start = await startProductImportCommit({ ...input, chunkSize }, user);
  const plannedRows = await db.productImportPlannedRow.findMany({
    where: { batchOperationId: start.batchOperationId },
    orderBy: { cursorIndex: "asc" },
  });
  const now = new Date();
  const retainUntil = addDays(now, PRODUCT_IMPORT_JOB_RETENTION_DAYS);

  const job = await db.productImportJob.create({
    data: {
      storeId,
      createdBy: user.id,
      batchOperationId: start.batchOperationId,
      status: "PENDING",
      totalRows: start.totalRows,
      chunkSize,
      retainUntil,
      summary: {
        rowCount: start.totalRows,
        chunkSize,
        processedRows: 0,
        successRows: 0,
        failedRows: 0,
        skippedRows: 0,
      },
      rows: {
        createMany: {
          data: plannedRows.map((row) => ({
            rowNumber: row.sourceRowNumber,
            cursorIndex: row.cursorIndex,
            status: "PENDING",
            commitAction: row.commitAction,
            sku: row.sku,
            productId: row.productId,
            rowData: row.rowData as Prisma.InputJsonValue,
          })),
        },
      },
    },
  });

  logger.info("product.import.job.created", {
    jobId: job.id,
    batchOperationId: job.batchOperationId,
    storeId,
    totalRows: job.totalRows,
  });

  return job;
}

export async function getProductImportJobStatus(jobId: string, user: ProductImportActor) {
  const storeId = storeIdFor(user);
  const job = await db.productImportJob.findFirst({
    where: { id: jobId, storeId },
    include: {
      rows: {
        where: { status: "FAILED" },
        orderBy: { cursorIndex: "asc" },
        take: 100,
        select: {
          rowNumber: true,
          sku: true,
          commitAction: true,
          errorCode: true,
          errorMessage: true,
          attemptCount: true,
        },
      },
    },
  });

  if (!job) throw new Error("IMPORT_JOB_NOT_FOUND");

  return job;
}

export async function progressProductImportJobForPolling(
  jobId: string,
  user: ProductImportActor,
) {
  const storeId = storeIdFor(user);
  const job = await db.productImportJob.findFirst({
    where: { id: jobId, storeId },
    select: { id: true, status: true },
  });
  if (!job) throw new Error("IMPORT_JOB_NOT_FOUND");

  if ((ACTIVE_JOB_STATUSES as readonly string[]).includes(job.status)) {
    await processNextProductImportJob(storeId, { shouldStop: () => true });
  }

  return getProductImportJobStatus(jobId, user);
}

export async function getActiveProductImportJob(user: ProductImportActor) {
  const storeId = storeIdFor(user);
  return db.productImportJob.findFirst({
    where: {
      storeId,
      status: { in: [...ACTIVE_JOB_STATUSES] },
    },
    orderBy: { createdAt: "asc" },
    include: {
      rows: {
        where: { status: "FAILED" },
        orderBy: { cursorIndex: "asc" },
        take: 100,
        select: {
          rowNumber: true,
          sku: true,
          commitAction: true,
          errorCode: true,
          errorMessage: true,
          attemptCount: true,
        },
      },
    },
  });
}

export async function cancelProductImportJob(jobId: string, user: ProductImportActor) {
  const storeId = storeIdFor(user);
  const job = await db.productImportJob.findFirst({ where: { id: jobId, storeId } });
  if (!job) throw new Error("IMPORT_JOB_NOT_FOUND");
  if ((TERMINAL_JOB_STATUSES as readonly string[]).includes(job.status)) return job;

  return db.productImportJob.update({
    where: { id: job.id },
    data: {
      status: "CANCEL_REQUESTED",
      cancelRequestedAt: new Date(),
    },
  });
}

export async function retryProductImportJob(jobId: string, user: ProductImportActor) {
  const storeId = storeIdFor(user);
  const job = await db.productImportJob.findFirst({ where: { id: jobId, storeId } });
  if (!job) throw new Error("IMPORT_JOB_NOT_FOUND");

  await db.productImportJobRow.updateMany({
    where: { jobId: job.id, status: "FAILED" },
    data: {
      status: "PENDING",
      errorCode: null,
      errorMessage: null,
      nextAttemptAt: null,
      startedAt: null,
      finishedAt: null,
    },
  });
  await db.productImportPlannedRow.updateMany({
    where: { batchOperationId: job.batchOperationId, status: "FAILED" },
    data: { status: "PENDING" },
  });

  return db.productImportJob.update({
    where: { id: job.id },
    data: {
      status: "PENDING",
      lastError: null,
      finishedAt: null,
      cancelRequestedAt: null,
    },
  });

}

export async function claimNextProductImportJob(storeId: string) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PRODUCT_IMPORT_JOB_STALE_MS);
  const eligibility = {
    storeId,
    OR: [
      {
        status: "PENDING" as const,
        rows: {
          some: {
            status: "PENDING" as const,
            OR: [
              { nextAttemptAt: null },
              { nextAttemptAt: { lte: now } },
            ],
          },
        },
      },
      { status: "CANCEL_REQUESTED" as const },
      {
        status: "RUNNING" as const,
        OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: staleBefore } }],
      },
    ],
  };
  const candidate = await db.productImportJob.findFirst({
    where: eligibility,
    orderBy: { createdAt: "asc" },
  });

  if (!candidate) return null;

  const claim = await db.productImportJob.updateMany({
    where: { id: candidate.id, ...eligibility },
    data: {
      status: "RUNNING",
      startedAt: candidate.startedAt ?? now,
      lastHeartbeatAt: now,
    },
  });
  if (claim.count === 0) return null;

  await db.productImportJobRow.updateMany({
    where: { jobId: candidate.id, status: "RUNNING" },
    data: { status: "PENDING", startedAt: null },
  });

  return {
    ...candidate,
    status: "RUNNING" as const,
    startedAt: candidate.startedAt ?? now,
    lastHeartbeatAt: now,
  };
}

async function markJobRowsRunning(jobId: string, cursor: number, chunkSize: number) {
  const endCursor = cursor + chunkSize;
  await db.productImportJobRow.updateMany({
    where: {
      jobId,
      status: "PENDING",
      cursorIndex: { gte: cursor, lt: endCursor },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    data: {
      status: "RUNNING",
      attemptCount: { increment: 1 },
      startedAt: new Date(),
      errorCode: null,
      errorMessage: null,
    },
  });

  return db.productImportJobRow.findMany({
    where: {
      jobId,
      status: "RUNNING",
      cursorIndex: { gte: cursor, lt: endCursor },
    },
    orderBy: { cursorIndex: "asc" },
  });
}

async function findEligibleJobRowChunk(jobId: string, cursor: number, maxChunkSize: number) {
  const candidates = await db.productImportJobRow.findMany({
    where: {
      jobId,
      status: "PENDING",
      cursorIndex: { gte: cursor },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
    },
    orderBy: { cursorIndex: "asc" },
    take: maxChunkSize,
  });
  const contiguousRows: typeof candidates = [];
  let expectedCursor = cursor;
  for (const candidate of candidates) {
    if (candidate.cursorIndex !== expectedCursor) break;
    contiguousRows.push(candidate);
    expectedCursor += 1;
  }
  return contiguousRows;
}

async function markCommittedJobRows(input: {
  jobId: string;
  batchOperationId: string;
  rowNumbers: number[];
}) {
  const items = await db.batchOperationItem.findMany({
    where: {
      batchOperationId: input.batchOperationId,
      sourceRowNumber: { in: input.rowNumbers },
    },
    select: { sourceRowNumber: true, productId: true, action: true },
  });
  const itemByRowNumber = new Map(
    items
      .filter((item) => item.sourceRowNumber != null)
      .map((item) => [item.sourceRowNumber as number, item]),
  );
  const productIds = input.rowNumbers.map(
    (rowNumber) => itemByRowNumber.get(rowNumber)?.productId ?? null,
  );
  const statuses = input.rowNumbers.map((rowNumber) =>
    itemByRowNumber.get(rowNumber)?.action === "SKIP" ? "SKIPPED" : "SUCCEEDED",
  );

  await db.$executeRaw`
    UPDATE pos_product_import_job_rows AS r SET
      status = v.status::"ProductImportJobRowStatus",
      "productId" = COALESCE(v."productId", r."productId"),
      "finishedAt" = NOW(),
      "updatedAt" = NOW()
    FROM unnest(
      ${input.rowNumbers}::int4[],
      ${productIds}::text[],
      ${statuses}::text[]
    ) AS v("rowNumber", "productId", status)
    WHERE r."jobId" = ${input.jobId}
      AND r."rowNumber" = v."rowNumber"
  `;
}

async function markFailedJobRows(input: {
  jobId: string;
  batchOperationId: string;
  rows: Array<{ rowNumber: number; attemptCount: number; sku: string | null }>;
  error: unknown;
}) {
  const classified = classifyError(input.error);
  const failedRowNumbers: number[] = [];

  for (const row of input.rows) {
    const currentAttemptCount = row.attemptCount;
    const shouldRetry = classified.retryable && currentAttemptCount < PRODUCT_IMPORT_JOB_ROW_MAX_ATTEMPTS;

    await db.productImportJobRow.updateMany({
      where: { jobId: input.jobId, rowNumber: row.rowNumber },
      data: {
        status: shouldRetry ? "PENDING" : "FAILED",
        nextAttemptAt: shouldRetry ? new Date(Date.now() + currentAttemptCount * 5_000) : null,
        errorCode: classified.code,
        errorMessage: classified.message,
        finishedAt: shouldRetry ? null : new Date(),
      },
    });
    if (!shouldRetry) failedRowNumbers.push(row.rowNumber);

    logger.warn("product.import.job.row.failed", {
      jobId: input.jobId,
      rowNumber: row.rowNumber,
      sku: row.sku,
      errorCode: classified.code,
      retryable: shouldRetry,
    });
  }

  if (failedRowNumbers.length > 0) {
    await db.productImportPlannedRow.updateMany({
      where: {
        batchOperationId: input.batchOperationId,
        sourceRowNumber: { in: failedRowNumbers },
      },
      data: { status: "FAILED" },
    });
  }
}

async function markInfrastructureRetryJobRows(input: {
  jobId: string;
  rows: Array<{ rowNumber: number; attemptCount: number; sku: string | null }>;
  error: unknown;
}) {
  const classified = classifyError(input.error);
  const maxAttemptCount = input.rows.reduce(
    (max, row) => Math.max(max, row.attemptCount),
    1,
  );
  const nextAttemptAt = new Date(Date.now() + infrastructureRetryDelayMs(maxAttemptCount));

  await db.productImportJobRow.updateMany({
    where: { jobId: input.jobId, rowNumber: { in: input.rows.map((row) => row.rowNumber) } },
    data: {
      status: "PENDING",
      nextAttemptAt,
      errorCode: classified.code,
      errorMessage: classified.message,
      startedAt: null,
      finishedAt: null,
    },
  });

  await db.productImportJob.update({
    where: { id: input.jobId },
    data: {
      status: "PENDING",
      lastError: classified.message,
      lastHeartbeatAt: new Date(),
    },
  });

  logger.warn("product.import.job.rows.infrastructure_retry", {
    jobId: input.jobId,
    rowCount: input.rows.length,
    rowNumbers: input.rows.map((row) => row.rowNumber),
    errorCode: classified.code,
    nextAttemptAt: nextAttemptAt.toISOString(),
  });
}

async function processJobRowChunk(input: {
  job: NonNullable<Awaited<ReturnType<typeof db.productImportJob.findUnique>>>;
  cursor: number;
  chunkSize: number;
}): Promise<"processed" | "deferred" | false> {
  const job = input.job;
  const eligibleRows = await findEligibleJobRowChunk(job.id, input.cursor, input.chunkSize);
  if (eligibleRows.length === 0) return false;

  const rows = await markJobRowsRunning(job.id, input.cursor, eligibleRows.length);
  if (rows.length === 0) return false;

  try {
    await commitProductImportChunk(
      {
        batchOperationId: job.batchOperationId,
        cursor: input.cursor,
        chunkSize: rows.length,
      },
      { id: job.createdBy, storeId: job.storeId },
    );
    await markCommittedJobRows({
      jobId: job.id,
      batchOperationId: job.batchOperationId,
      rowNumbers: rows.map((row) => row.rowNumber),
    });
  } catch (error) {
    const classified = classifyError(error);
    if (classified.retryableInfrastructure) {
      await markInfrastructureRetryJobRows({
        jobId: job.id,
        rows,
        error,
      });
      return "deferred";
    }

    if (rows.length > 1) {
      await db.productImportJobRow.updateMany({
        where: { jobId: job.id, rowNumber: { in: rows.map((row) => row.rowNumber) } },
        data: {
          status: "PENDING",
          attemptCount: { decrement: 1 },
          startedAt: null,
          finishedAt: null,
        },
      });
      for (const row of rows) {
        const singleRow = await db.productImportJobRow.findFirst({
          where: { jobId: job.id, rowNumber: row.rowNumber, status: "PENDING" },
          select: { cursorIndex: true },
        });
        if (!singleRow) continue;
        const singleResult = await processJobRowChunk({ job, cursor: singleRow.cursorIndex, chunkSize: 1 });
        if (singleResult === "deferred") return "deferred";
      }
      return "processed";
    }

    await markFailedJobRows({
      jobId: job.id,
      batchOperationId: job.batchOperationId,
      rows,
      error,
    });
  }

  return "processed";
}

export async function processProductImportJob(
  jobId: string,
  control: ProductImportWorkerControl = {},
) {
  const initialJob = await db.productImportJob.findUnique({ where: { id: jobId } });
  if (!initialJob) throw new Error("IMPORT_JOB_NOT_FOUND");
  let job = initialJob;

  if (job.status === "PENDING") {
    job = await db.productImportJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", startedAt: job.startedAt ?? new Date(), lastHeartbeatAt: new Date() },
    });
  }

  while (job.status === "RUNNING") {
    const freshJob = await db.productImportJob.findUnique({ where: { id: job.id } });
    if (!freshJob) throw new Error("IMPORT_JOB_NOT_FOUND");
    job = freshJob;

    if (job.cancelRequestedAt || job.status === "CANCEL_REQUESTED") {
      await summarizeJob(job.id);
      return db.productImportJob.update({
        where: { id: job.id },
        data: { status: "CANCELLED", finishedAt: new Date(), lastHeartbeatAt: new Date() },
      });
    }

    const row = await db.productImportJobRow.findFirst({
      where: {
        jobId: job.id,
        status: "PENDING",
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      },
      orderBy: { cursorIndex: "asc" },
    });

    if (!row) break;

    const chunkSize = Math.max(1, Math.min(job.chunkSize, PRODUCT_IMPORT_JOB_CHUNK_SIZE));
    const result = await processJobRowChunk({ job, cursor: row.cursorIndex, chunkSize });
    if (!result) {
      break;
    }
    if (result === "deferred") {
      break;
    }

    await summarizeJob(job.id, { clearLastError: true });
    if (control.shouldStop?.()) {
      const remainingRows = await db.productImportJobRow.count({
        where: { jobId: job.id, status: { in: ["PENDING", "RUNNING"] } },
      });
      if (remainingRows > 0) {
        return db.productImportJob.update({
          where: { id: job.id },
          data: {
            status: "PENDING",
            lastHeartbeatAt: new Date(),
          },
        });
      }
    }
  }

  const summary = await summarizeJob(job.id);
  const pendingRows = await db.productImportJobRow.count({
    where: { jobId: job.id, status: { in: ["PENDING", "RUNNING"] } },
  });
  if (pendingRows > 0) {
    return db.productImportJob.update({
      where: { id: job.id },
      data: { lastHeartbeatAt: new Date() },
    });
  }

  const finalStatus = summary.failedRows > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
  await db.batchOperation.update({
    where: { id: job.batchOperationId },
    data: { status: "COMMITTED" },
  });

  return db.productImportJob.update({
    where: { id: job.id },
    data: {
      status: finalStatus,
      finishedAt: new Date(),
      lastHeartbeatAt: new Date(),
      lastError: null,
    },
  });
}

export async function processNextProductImportJob(
  storeId: string,
  control: ProductImportWorkerControl = {},
) {
  const job = await claimNextProductImportJob(storeId);
  if (!job) return null;
  return processProductImportJob(job.id, control);
}

export async function cleanupExpiredProductImportJobs(now = new Date()) {
  return db.productImportJob.deleteMany({
    where: {
      retainUntil: { lt: now },
      status: { in: [...TERMINAL_JOB_STATUSES] },
    },
  });
}
