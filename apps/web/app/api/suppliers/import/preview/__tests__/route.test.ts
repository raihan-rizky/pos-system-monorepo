import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const previewSupplierImportMock = vi.hoisted(() => vi.fn());

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

vi.mock("@/features/supplier-import/services/supplier-import-service", () => ({
  previewSupplierImport: previewSupplierImportMock,
  SupplierImportMissingColumnsError: class SupplierImportMissingColumnsError extends Error {
    missingColumns = ["name"];
    unknownColumns = [];
    suggestions = {};
    removedEmptyRowCount = 0;
  },
}));

describe("POST /api/suppliers/import/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "admin-1",
      name: "Admin",
      role: "ADMIN",
    });
    previewSupplierImportMock.mockResolvedValue({
      rows: [],
      missingColumns: [],
      unknownColumns: [],
      warnings: [],
      errors: [],
      existingNameMatches: [],
      removedEmptyRowCount: 2,
      requiredColumns: ["name"],
      suggestions: {},
    });
  });

  it("requires supplier create permission and returns preview payload", async () => {
    const response = await POST(requestWithFile("supplier.xlsx"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith("supplier", "create");
    expect(previewSupplierImportMock).toHaveBeenCalled();
    expect(body.removedEmptyRowCount).toBe(2);
  });

  it("rejects unsupported file types with canonical error", async () => {
    const response = await POST(requestWithFile("supplier.txt"));
    const body = await response.json();

    expect(response.status).toBe(415);
    expect(body.code).toBe("UnsupportedMediaType");
    expect(previewSupplierImportMock).not.toHaveBeenCalled();
  });
});

function requestWithFile(name: string): Request {
  const formData = new FormData();
  formData.set("file", new File(["name\nCV Sinar"], name));
  return new Request("http://localhost/api/suppliers/import/preview", {
    method: "POST",
    body: formData,
  });
}
