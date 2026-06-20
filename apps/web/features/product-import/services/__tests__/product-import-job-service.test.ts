import { beforeEach, describe, expect, it, vi } from "vitest";

const commitProductImportChunkMock = vi.hoisted(() => vi.fn());

const dbMock = vi.hoisted(() => ({
  productImportJob: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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
  startProductImportCommit: vi.fn(),
}));

import {
  getActiveProductImportJob,
  processProductImportJob,
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
    dbMock.productImportJob.update.mockImplementation(async ({ data }) => ({
      ...runningJob,
      ...data,
    }));
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
