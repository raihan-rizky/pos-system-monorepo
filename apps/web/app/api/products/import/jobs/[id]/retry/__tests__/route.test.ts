import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const retryProductImportJobMock = vi.hoisted(() => vi.fn());

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
  productImportJobIdSchema: {
    parse: (value: unknown) => value,
  },
  retryProductImportJob: retryProductImportJobMock,
}));

describe("POST /api/products/import/jobs/[id]/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "owner-1",
      name: "Owner",
      storeId: "store-main",
    });
  });

  it("returns the job requeued for the dedicated worker", async () => {
    retryProductImportJobMock.mockResolvedValue({
      id: "job-1",
      status: "PENDING",
    });

    const response = await POST(
      new Request("http://localhost/api/products/import/jobs/job-1/retry", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "job-1" }) },
    );
    const body = await response.json();

    expect(body).toEqual({
      id: "job-1",
      status: "PENDING",
    });
  });
});
