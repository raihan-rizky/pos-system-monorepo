import { beforeEach, describe, expect, it, vi } from "vitest";

const commitProductImportChunkMock = vi.hoisted(() => vi.fn());
const startProductImportCommitMock = vi.hoisted(() => vi.fn());

const dbMock = vi.hoisted(() => ({
  $executeRaw: vi.fn(),
  productImportJob: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
  productImportJobRow: {
    groupBy: vi.fn(),
    updateMany: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
  },
  productImportPlannedRow: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
  },
  batchOperationItem: {
    findMany: vi.fn(),
  },
  batchOperation: {
    update: vi.fn(),
  },
}));

vi.mock("@pos/db", () => ({
  db: dbMock,
  Prisma: {},
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../product-import-commit-service", () => ({
  commitProductImportChunk: commitProductImportChunkMock,
  productImportStartSchema: {
    extend: (shape: unknown) => ({
      parse: (value: unknown) => value,
      shape,
    }),
  },
  startProductImportCommit: startProductImportCommitMock,
}));

import {
  claimNextProductImportJob,
  createProductImportJob,
  getActiveProductImportJob,
  processProductImportJob,
  retryProductImportJob,
} from "../product-import-job-service";

describe("product import job worker", () => {
  const runningJob = {
    id: "job-1",
    storeId: "store-main",
    createdBy: "user-1",
    batchOperationId: "batch-1",
    status: "RUNNING",
    totalRows: 1,
    processedRows: 0,
    successRows: 0,
    failedRows: 0,
    skippedRows: 0,
    chunkSize: 100,
    summary: {},
    lastError: null,
    startedAt: null,
    finishedAt: null,
    lastHeartbeatAt: null,
    cancelRequestedAt: null,
    retainUntil: new Date("2026-07-19"),
    createdAt: new Date("2026-06-19"),
    updatedAt: new Date("2026-06-19"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    commitProductImportChunkMock.mockResolvedValue({});
    dbMock.productImportJob.update.mockImplementation(async ({ data }) => ({
      ...runningJob,
      ...data,
    }));
    dbMock.productImportJob.updateMany.mockResolvedValue({ count: 0 });
    startProductImportCommitMock.mockResolvedValue({
      batchOperationId: "batch-1",
      totalRows: 1,
      nextCursor: 0,
      chunkSize: 100,
      undoAvailable: true,
    });
    dbMock.productImportJobRow.groupBy.mockResolvedValue([]);
    dbMock.productImportJobRow.count.mockResolvedValue(1);
    dbMock.productImportJobRow.findFirst.mockResolvedValue({
      jobId: "job-1",
      rowNumber: 7,
      cursorIndex: 0,
      status: "PENDING",
      attemptCount: 1,
      sku: "SKU-7",
    });
    dbMock.productImportJobRow.findMany.mockResolvedValue([
      {
        jobId: "job-1",
        rowNumber: 7,
        cursorIndex: 0,
        status: "RUNNING",
        attemptCount: 1,
        sku: "SKU-7",
      },
    ]);
  });

  it("leaves a newly created import pending for the dedicated worker", async () => {
    dbMock.productImportJob.findFirst.mockResolvedValue(null);
    dbMock.productImportPlannedRow.findMany.mockResolvedValue([
      {
        sourceRowNumber: 2,
        cursorIndex: 0,
        commitAction: "create",
        sku: "AMP-001",
        productId: null,
        rowData: { rowNumber: 2, name: "Amplop Rahasia", sku: "AMP-001" },
      },
    ]);
    dbMock.productImportJob.create.mockResolvedValue({
      ...runningJob,
      id: "job-1",
      status: "PENDING",
      totalRows: 1,
      batchOperationId: "batch-1",
    });

    const job = await createProductImportJob(
      {
        rows: [
          {
            rowNumber: 2,
            name: "Amplop Rahasia",
            sku: "AMP-001",
            category: "ATK",
            price: 1000,
            stock: 5,
            unit: "pcs",
          },
        ],
        decisions: {},
        createMissingCategories: false,
      },
      { id: "user-1", storeId: "store-main" },
    );

    expect(job.status).toBe("PENDING");
    expect(startProductImportCommitMock).toHaveBeenCalledWith(
      expect.objectContaining({ chunkSize: 400 }),
      { id: "user-1", storeId: "store-main" },
    );
  });

  it("requeues a failed import for the dedicated worker without dispatching externally", async () => {
    dbMock.productImportJob.findFirst.mockResolvedValue({
      ...runningJob,
      id: "job-1",
      status: "COMPLETED_WITH_ERRORS",
      batchOperationId: "batch-1",
      totalRows: 3,
    });
    dbMock.productImportJob.update.mockResolvedValue({
      ...runningJob,
      id: "job-1",
      status: "PENDING",
      batchOperationId: "batch-1",
      totalRows: 3,
    });
    dbMock.productImportJobRow.updateMany.mockResolvedValue({ count: 1 });
    dbMock.productImportPlannedRow.updateMany.mockResolvedValue({ count: 1 });

    const job = await retryProductImportJob(
      "job-1",
      { id: "user-1", storeId: "store-main" },
    );

    expect(job.status).toBe("PENDING");
  });

  it("keeps rows pending when a DB connection failure interrupts chunk processing", async () => {
    dbMock.productImportJob.findUnique
      .mockResolvedValueOnce({ ...runningJob, status: "PENDING" })
      .mockResolvedValueOnce(runningJob)
      .mockResolvedValueOnce({
        ...runningJob,
        batchOperation: {
          summary: {},
        },
      });
    commitProductImportChunkMock.mockRejectedValue(
      Object.assign(new Error("Connection closed by database"), { code: "P1017" }),
    );

    await processProductImportJob("job-1");

    expect(dbMock.productImportJobRow.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobId: "job-1", rowNumber: { in: [7] } },
        data: expect.objectContaining({
          status: "PENDING",
          errorCode: "P1017",
          errorMessage: "Connection closed by database",
          finishedAt: null,
        }),
      }),
    );
    expect(dbMock.productImportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "PENDING",
          lastError: "Connection closed by database",
        }),
      }),
    );
    expect(dbMock.productImportPlannedRow.updateMany).not.toHaveBeenCalled();
  });

  it("reconciles a committed chunk with one set-based job-row update", async () => {
    const jobWithBatch = {
      ...runningJob,
      batchOperation: { summary: {} },
    };
    dbMock.productImportJob.findUnique
      .mockResolvedValueOnce({ ...runningJob, status: "PENDING" })
      .mockResolvedValueOnce(runningJob)
      .mockResolvedValueOnce(jobWithBatch)
      .mockResolvedValueOnce(runningJob)
      .mockResolvedValueOnce(jobWithBatch);
    dbMock.productImportJobRow.findFirst
      .mockResolvedValueOnce({
        jobId: "job-1",
        rowNumber: 7,
        cursorIndex: 0,
        status: "PENDING",
        attemptCount: 0,
        sku: "SKU-7",
      })
      .mockResolvedValueOnce(null);
    dbMock.productImportJobRow.findMany.mockResolvedValue([
      {
        jobId: "job-1",
        rowNumber: 7,
        cursorIndex: 0,
        status: "RUNNING",
        attemptCount: 1,
        sku: "SKU-7",
      },
    ]);
    dbMock.batchOperationItem.findMany.mockResolvedValue([
      {
        sourceRowNumber: 7,
        productId: "product-7",
        action: "CREATE",
      },
    ]);
    dbMock.productImportJobRow.groupBy.mockResolvedValue([
      { status: "SUCCEEDED", _count: { _all: 1 } },
    ]);
    dbMock.productImportJobRow.count.mockResolvedValue(0);

    await processProductImportJob("job-1");

    expect(dbMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(dbMock.productImportJobRow.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobId: "job-1", rowNumber: 7 },
        data: { productId: "product-7" },
      }),
    );
  });

  it("releases unfinished work at a chunk boundary during graceful shutdown", async () => {
    const jobWithBatch = {
      ...runningJob,
      chunkSize: 1,
      totalRows: 2,
      batchOperation: { summary: {} },
    };
    dbMock.productImportJob.findUnique
      .mockResolvedValueOnce({ ...jobWithBatch, status: "PENDING" })
      .mockResolvedValueOnce(jobWithBatch)
      .mockResolvedValueOnce(jobWithBatch)
      .mockResolvedValueOnce(jobWithBatch)
      .mockResolvedValueOnce(jobWithBatch);
    dbMock.productImportJobRow.findFirst
      .mockResolvedValueOnce({
        jobId: "job-1",
        rowNumber: 7,
        cursorIndex: 0,
        status: "PENDING",
        attemptCount: 0,
        sku: "SKU-7",
      })
      .mockResolvedValueOnce({
        jobId: "job-1",
        rowNumber: 8,
        cursorIndex: 1,
        status: "PENDING",
        attemptCount: 0,
        sku: "SKU-8",
      })
      .mockResolvedValueOnce(null);
    dbMock.batchOperationItem.findMany.mockResolvedValue([
      { sourceRowNumber: 7, productId: "product-7", action: "CREATE" },
    ]);
    dbMock.productImportJobRow.count.mockResolvedValue(1);

    const job = await processProductImportJob("job-1", {
      shouldStop: () => true,
    });

    expect(commitProductImportChunkMock).toHaveBeenCalledTimes(1);
    expect(job.status).toBe("PENDING");
    expect(dbMock.productImportJob.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "PENDING",
        lastHeartbeatAt: expect.any(Date),
      },
    });
  });

  it("does not process a candidate when another worker wins the conditional claim", async () => {
    dbMock.productImportJob.findFirst.mockResolvedValue({
      ...runningJob,
      status: "PENDING",
    });
    dbMock.productImportJob.updateMany.mockResolvedValue({ count: 0 });

    const job = await claimNextProductImportJob("store-main");

    expect(job).toBeNull();
    expect(dbMock.productImportJob.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: "job-1" }),
      }),
    );
    expect(dbMock.productImportJobRow.updateMany).not.toHaveBeenCalled();
    expect(dbMock.productImportJob.update).not.toHaveBeenCalled();
  });

  it("claims a cancellation requested before processing starts", async () => {
    dbMock.productImportJob.findFirst.mockResolvedValue({
      ...runningJob,
      status: "CANCEL_REQUESTED",
      cancelRequestedAt: new Date("2026-07-01T12:00:00.000Z"),
    });
    dbMock.productImportJob.updateMany.mockResolvedValue({ count: 1 });

    const job = await claimNextProductImportJob("store-main");

    expect(job?.status).toBe("RUNNING");
    expect(job?.cancelRequestedAt).toEqual(new Date("2026-07-01T12:00:00.000Z"));
    expect(dbMock.productImportJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { status: "CANCEL_REQUESTED" },
          ]),
        }),
      }),
    );
  });

  it("does not select a pending job until at least one row is retry-eligible", async () => {
    dbMock.productImportJob.findFirst.mockResolvedValue(null);

    await claimNextProductImportJob("store-main");

    expect(dbMock.productImportJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({
              status: "PENDING",
              rows: {
                some: {
                  status: "PENDING",
                  OR: [
                    { nextAttemptAt: null },
                    { nextAttemptAt: { lte: expect.any(Date) } },
                  ],
                },
              },
            }),
          ]),
        }),
      }),
    );
  });

  it("only recovers a running job after the 180 second stale threshold", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T12:00:00.000Z"));
    dbMock.productImportJob.findFirst.mockResolvedValue(null);

    try {
      await claimNextProductImportJob("store-main");

      expect(dbMock.productImportJob.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              {
                status: "RUNNING",
                OR: [
                  { lastHeartbeatAt: null },
                  { lastHeartbeatAt: { lt: new Date("2026-07-01T11:57:00.000Z") } },
                ],
              },
            ]),
          }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("loads the active import job for the user's store", async () => {
    dbMock.productImportJob.findFirst.mockResolvedValue({
      ...runningJob,
      status: "RUNNING",
      rows: [],
    });

    const job = await getActiveProductImportJob({
      id: "user-1",
      storeId: "store-main",
    });

    expect(job?.id).toBe("job-1");
    expect(dbMock.productImportJob.findFirst).toHaveBeenCalledWith({
      where: {
        storeId: "store-main",
        status: { in: ["PENDING", "RUNNING", "CANCEL_REQUESTED"] },
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
  });
});
