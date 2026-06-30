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

  it("rejects oversized import files before supplier preview parsing", async () => {
    const response = await POST(requestWithFile("supplier.xlsx", new Uint8Array(5 * 1024 * 1024 + 1)));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.message).toContain("terlalu besar");
    expect(previewSupplierImportMock).not.toHaveBeenCalled();
  });
});

function requestWithFile(name: string, content: BlobPart = "name\nCV Sinar"): Request {
  const formData = new FormData();
  formData.set("file", new File([content], name));
  return new Request("http://localhost/api/suppliers/import/preview", {
    method: "POST",
    body: formData,
  });
}
