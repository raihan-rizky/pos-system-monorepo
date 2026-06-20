import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const createBulkStockImportJobMock = vi.hoisted(() => vi.fn());
const startBulkStockImportJobProcessingMock = vi.hoisted(() => vi.fn());

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
  bulkStockImportJobCreateSchema: {
    parse: (value: unknown) => value,
  },
  createBulkStockImportJob: createBulkStockImportJobMock,
  startBulkStockImportJobProcessing: startBulkStockImportJobProcessingMock,
}));

describe("POST /api/inventory/bulk/import/commit/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      role: "OWNER",
      storeId: "store-1",
    });
    createBulkStockImportJobMock.mockResolvedValue({
      id: "job-1",
      status: "PENDING",
      phase: "QUEUED",
      totalRows: 1,
      processedRows: 0,
    });
  });

  it("creates a bulk stock import job and starts processing", async () => {
    const response = await POST(
      new Request("http://localhost/api/inventory/bulk/import/commit/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "ADD",
          rows: [
            {
              rowNumber: 2,
              name: "Kertas HVS A4",
              category: "ATK",
              unit: "Rim",
              stock: 5,
            },
          ],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.id).toBe("job-1");
    expect(createBulkStockImportJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "ADD" }),
      expect.objectContaining({ id: "owner-1" }),
    );
    expect(startBulkStockImportJobProcessingMock).toHaveBeenCalledWith("job-1");
  });
});
