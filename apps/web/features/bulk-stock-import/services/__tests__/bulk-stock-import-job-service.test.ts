import { beforeEach, describe, expect, it, vi } from "vitest";

const commitBulkStockImportMock = vi.hoisted(() => vi.fn());
const loggerInfoMock = vi.hoisted(() => vi.fn());
const loggerWarnMock = vi.hoisted(() => vi.fn());
const loggerErrorMock = vi.hoisted(() => vi.fn());

const dbMock = vi.hoisted(() => ({
  bulkStockImportJob: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@pos/db", () => ({
  db: dbMock,
  Prisma: {},
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    info: loggerInfoMock,
    warn: loggerWarnMock,
    error: loggerErrorMock,
  }),
}));

vi.mock("../bulk-stock-import-service", () => ({
  commitBulkStockImport: commitBulkStockImportMock,
}));

import {
  createBulkStockImportJob,
  getBulkStockImportJobStatus,
  processBulkStockImportJob,
} from "../bulk-stock-import-job-service";

const user = {
  id: "owner-1",
  name: "Owner",
  role: "OWNER",
  storeId: "store-1",
};

const payload = {
  mode: "ADD" as const,
  rows: [
    {
      rowNumber: 2,
      name: "Kertas HVS A4",
      category: "ATK",
      unit: "Rim",
      stock: 5,
    },
  ],
  supplierId: "supplier-1",
  note: "restock",
  allowNegativeStock: false,
};

describe("bulk stock import job service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commitBulkStockImportMock.mockReset();
    dbMock.bulkStockImportJob.create.mockImplementation(async ({ data }) => ({
      id: "job-1",
      ...data,
    }));
    dbMock.bulkStockImportJob.update.mockImplementation(async ({ data }) => ({
      id: "job-1",
      storeId: "store-1",
      createdBy: "owner-1",
      status: data.status ?? "RUNNING",
      phase: data.phase ?? "VALIDATING",
      totalRows: data.totalRows ?? 1,
      processedRows: data.processedRows ?? 0,
      payload,
      result: data.result ?? null,
      errorMessage: data.errorMessage ?? null,
    }));
  });

  it("creates a queued job with the commit payload and row count", async () => {
    const job = await createBulkStockImportJob(payload, user);

    expect(job.id).toBe("job-1");
    expect(dbMock.bulkStockImportJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: "store-1",
          createdBy: "owner-1",
          status: "PENDING",
          phase: "QUEUED",
          totalRows: 1,
          processedRows: 0,
          payload,
          retainUntil: expect.any(Date),
        }),
      }),
    );
  });

  it("loads job status scoped to the user's store", async () => {
    dbMock.bulkStockImportJob.findFirst.mockResolvedValue({
      id: "job-1",
      storeId: "store-1",
      status: "RUNNING",
    });

    const job = await getBulkStockImportJobStatus("job-1", user);

    expect(job?.id).toBe("job-1");
    expect(dbMock.bulkStockImportJob.findFirst).toHaveBeenCalledWith({
      where: { id: "job-1", storeId: "store-1" },
    });
  });

  it("processes a job and stores the terminal commit result", async () => {
    dbMock.bulkStockImportJob.findUnique.mockResolvedValue({
      id: "job-1",
      storeId: "store-1",
      createdBy: "owner-1",
      status: "PENDING",
      phase: "QUEUED",
      totalRows: 1,
      processedRows: 0,
      payload,
    });
    commitBulkStockImportMock.mockResolvedValue({
      updatedProductCount: 1,
      inventoryLogCount: 1,
      batchOperationId: "batch-1",
      status: "COMMITTED",
      pendingApproval: false,
      undoAvailable: true,
    });

    await processBulkStockImportJob("job-1");

    expect(commitBulkStockImportMock).toHaveBeenCalledWith(expect.any(Object), {
      ...payload,
      user: expect.objectContaining({
        id: "owner-1",
        storeId: "store-1",
      }),
    });
    expect(dbMock.bulkStockImportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "COMMITTED",
          phase: "DONE",
          processedRows: 1,
          result: expect.objectContaining({
            batchOperationId: "batch-1",
          }),
          finishedAt: expect.any(Date),
        }),
      }),
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "bulk_stock_import.job.progress",
      expect.objectContaining({
        jobId: "job-1",
        phase: "VALIDATING",
        status: "RUNNING",
        processedRows: 0,
        totalRows: 1,
      }),
    );
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "bulk_stock_import.job.progress",
      expect.objectContaining({
        jobId: "job-1",
        phase: "DONE",
        status: "COMMITTED",
        processedRows: 1,
        totalRows: 1,
      }),
    );
  });

  it("retries transient database connection failures before completing the job", async () => {
    dbMock.bulkStockImportJob.findUnique.mockResolvedValue({
      id: "job-1",
      storeId: "store-1",
      createdBy: "owner-1",
      status: "PENDING",
      phase: "QUEUED",
      totalRows: 1,
      processedRows: 0,
      payload,
    });
    commitBulkStockImportMock
      .mockRejectedValueOnce(
        Object.assign(new Error("Server has closed the connection."), {
          code: "P1017",
        }),
      )
      .mockResolvedValueOnce({
        updatedProductCount: 1,
        inventoryLogCount: 1,
        batchOperationId: "batch-1",
        status: "COMMITTED",
        pendingApproval: false,
        undoAvailable: true,
      });

    await processBulkStockImportJob("job-1");

    expect(commitBulkStockImportMock).toHaveBeenCalledTimes(2);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      "bulk_stock_import.job.retrying",
      expect.objectContaining({
        jobId: "job-1",
        attempt: 1,
        maxAttempts: 3,
        errorMessage: "Server has closed the connection.",
      }),
    );
    expect(dbMock.bulkStockImportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "COMMITTED",
          phase: "DONE",
        }),
      }),
    );
    expect(
      dbMock.bulkStockImportJob.update.mock.calls.some(
        ([arg]) => "retryAttempt" in arg.data,
      ),
    ).toBe(false);
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "bulk_stock_import.job.progress",
      expect.objectContaining({
        jobId: "job-1",
        phase: "UPDATING_STOCK",
        retryAttempt: 1,
      }),
    );
  });

  it("marks failed jobs with an error message", async () => {
    dbMock.bulkStockImportJob.findUnique.mockResolvedValue({
      id: "job-1",
      storeId: "store-1",
      createdBy: "owner-1",
      status: "PENDING",
      phase: "QUEUED",
      totalRows: 1,
      processedRows: 0,
      payload,
    });
    commitBulkStockImportMock.mockRejectedValue(new Error("Supplier was not found"));

    await processBulkStockImportJob("job-1");

    expect(dbMock.bulkStockImportJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "FAILED",
          phase: "FAILED",
          errorMessage: "Supplier was not found",
          finishedAt: expect.any(Date),
        }),
      }),
    );
  });
});
