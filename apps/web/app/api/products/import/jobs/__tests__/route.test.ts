import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const createProductImportJobMock = vi.hoisted(() => vi.fn());

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
  createProductImportJob: createProductImportJobMock,
  productImportJobCreateSchema: {
    parse: (value: unknown) => value,
  },
}));

vi.mock("../commit/errors", () => ({
  productImportCommitErrorResponse: () => null,
}));

describe("POST /api/products/import/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-main",
    });
  });

  it("returns the pending job created for the dedicated worker", async () => {
    createProductImportJobMock.mockResolvedValue({
      id: "job-1",
      status: "PENDING",
      totalRows: 1,
    });

    const response = await POST(
      new Request("http://localhost/api/products/import/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: [
            {
              rowNumber: 2,
              name: "Amplop",
              sku: "AMP-001",
              category: "ATK",
              price: 1000,
              stock: 5,
              unit: "pcs",
            },
          ],
          decisions: {},
          createMissingCategories: false,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      id: "job-1",
      status: "PENDING",
      totalRows: 1,
    });
  });
});
