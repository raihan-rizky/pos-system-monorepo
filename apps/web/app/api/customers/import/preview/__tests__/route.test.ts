import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../route";

const requirePermissionMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const customerFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: requirePermissionMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@pos/db", () => ({
  db: {
    customer: {
      findMany: customerFindManyMock,
    },
  },
}));

describe("POST /api/customers/import/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    requirePermissionMock.mockResolvedValue({
      id: "user-1",
      name: "Owner",
      storeId: "store-main",
    });
    customerFindManyMock.mockResolvedValue([]);
  });

  it("rejects oversized import files before parsing customers", async () => {
    const response = await POST(requestWithFile(
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "customers.xlsx"),
    ));
    const body = await response.json();

    expect(response.status).toBe(413);
    expect(body.message).toContain("terlalu besar");
    expect(customerFindManyMock).not.toHaveBeenCalled();
  });
});

function requestWithFile(file: File): Request {
  const formData = new FormData();
  formData.set("file", file);
  return new Request("http://localhost/api/customers/import/preview", {
    method: "POST",
    body: formData,
  });
}
