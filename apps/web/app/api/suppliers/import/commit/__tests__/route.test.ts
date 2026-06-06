import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const commitSupplierImportMock = vi.hoisted(() => vi.fn());
const MockSupplierImportConflictError = vi.hoisted(
  () =>
    class MockSupplierImportConflictError extends Error {
      readonly extra: Record<string, unknown>;

      constructor(message: string, extra: Record<string, unknown>) {
        super(message);
        this.name = "SupplierImportConflictError";
        this.extra = extra;
      }
    },
);
const MockSupplierImportValidationError = vi.hoisted(
  () =>
    class MockSupplierImportValidationError extends Error {
      readonly errors: Record<string, string[]>;

      constructor(message: string, errors: Record<string, string[]>) {
        super(message);
        this.name = "SupplierImportValidationError";
        this.errors = errors;
      }
    },
);

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/lib/logger", () => ({
  getLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/features/supplier-import/services/supplier-import-service", () => ({
  commitSupplierImport: commitSupplierImportMock,
  SupplierImportConflictError: MockSupplierImportConflictError,
  SupplierImportValidationError: MockSupplierImportValidationError,
}));

describe("POST /api/suppliers/import/commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      name: "Admin",
      role: "ADMIN",
    });
    commitSupplierImportMock.mockResolvedValue({
      createdSupplierCount: 1,
      updatedSupplierCount: 0,
      skippedRowCount: 0,
      failedRowCount: 0,
    });
  });

  it("requires supplier create permission and returns summary counts", async () => {
    const response = await POST(
      jsonRequest({
        rows: [commitRow()],
        decisions: {},
        selectedExistingSupplierIds: {},
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(requirePermissionMock).toHaveBeenCalledWith("supplier", "create");
    expect(commitSupplierImportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rows: [expect.objectContaining({ normalizedName: "cv sinar" })],
      }),
    );
    expect(body.createdSupplierCount).toBe(1);
  });

  it("maps import conflicts to canonical 409 responses", async () => {
    commitSupplierImportMock.mockRejectedValue(
      new MockSupplierImportConflictError(
        "Rows with multiple supplier matches require a selected supplier",
        { rowNumber: 2 },
      ),
    );

    const response = await POST(
      jsonRequest({
        rows: [commitRow()],
        decisions: { "2": "update" },
        selectedExistingSupplierIds: {},
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("Conflict");
    expect(body.rowNumber).toBe(2);
  });
});

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/suppliers/import/commit", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

function commitRow() {
  return {
    rowNumber: 2,
    name: "CV Sinar",
    normalizedName: "cv sinar",
    type: "DISTRIBUTOR",
    phone: null,
    contactPerson: null,
    address: null,
    notes: null,
    duplicateInFile: false,
    existingMatches: [],
    warnings: [],
    errors: [],
  };
}
