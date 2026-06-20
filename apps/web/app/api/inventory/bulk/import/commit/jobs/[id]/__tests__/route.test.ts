import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const getBulkStockImportJobStatusMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/features/bulk-stock-import/services/bulk-stock-import-job-service", () => ({
  bulkStockImportJobIdSchema: {
    parse: (value: unknown) => value,
  },
  getBulkStockImportJobStatus: getBulkStockImportJobStatusMock,
}));

describe("GET /api/inventory/bulk/import/commit/jobs/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      role: "OWNER",
      storeId: "store-1",
    });
  });

  it("returns bulk stock import job progress", async () => {
    getBulkStockImportJobStatusMock.mockResolvedValue({
      id: "job-1",
      status: "RUNNING",
      phase: "UPDATING_STOCK",
      totalRows: 10,
      processedRows: 4,
      successRows: 0,
      failedRows: 0,
      result: null,
      errorMessage: null,
    });

    const response = await GET(
      new Request("http://localhost/api/inventory/bulk/import/commit/jobs/job-1"),
      { params: Promise.resolve({ id: "job-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        id: "job-1",
        status: "RUNNING",
        phase: "UPDATING_STOCK",
        totalRows: 10,
        processedRows: 4,
      }),
    );
  });

  it("returns 404 when the job is not in the user's store", async () => {
    getBulkStockImportJobStatusMock.mockRejectedValue(
      new Error("BULK_STOCK_IMPORT_JOB_NOT_FOUND"),
    );

    const response = await GET(
      new Request("http://localhost/api/inventory/bulk/import/commit/jobs/job-1"),
      { params: Promise.resolve({ id: "job-1" }) },
    );

    expect(response.status).toBe(404);
  });
});
