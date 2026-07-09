import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const getProductImportJobStatusMock = vi.hoisted(() => vi.fn());
const progressProductImportJobForPollingMock = vi.hoisted(() => vi.fn());

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

vi.mock("@/features/product-import/services/product-import-job-service", () => ({
  getProductImportJobStatus: getProductImportJobStatusMock,
  productImportJobIdSchema: {
    parse: (value: unknown) => value,
  },
  progressProductImportJobForPolling: progressProductImportJobForPollingMock,
}));

describe("GET /api/products/import/jobs/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-main",
    });
  });

  it("nudges pending import work while polling job status", async () => {
    getProductImportJobStatusMock.mockResolvedValue({
      id: "job-1",
      status: "PENDING",
      totalRows: 2516,
      processedRows: 0,
    });
    progressProductImportJobForPollingMock.mockResolvedValue({
      id: "job-1",
      status: "RUNNING",
      totalRows: 2516,
      processedRows: 400,
    });

    const response = await GET(
      new Request("http://localhost/api/products/import/jobs/job-1"),
      { params: Promise.resolve({ id: "job-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(progressProductImportJobForPollingMock).toHaveBeenCalledWith(
      "job-1",
      { id: "owner-1", name: "Owner", storeId: "store-main" },
    );
    expect(getProductImportJobStatusMock).not.toHaveBeenCalled();
    expect(body).toEqual({
      id: "job-1",
      status: "RUNNING",
      totalRows: 2516,
      processedRows: 400,
    });
  });
});
