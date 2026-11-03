import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rbac/guard", () => ({
  requireRole: vi.fn(async () => ({ id: "owner-1", role: "OWNER" })),
  requirePermission: vi.fn(async () => ({ id: "owner-1", role: "OWNER" })),
  handleAuthError: () => null,
}));

import { POST } from "../route";

describe("retired inbound receipt revision action", () => {
  it("returns Gone without entering a removed approval workflow", async () => {
    const response = await POST(new Request("http://localhost/api/inventory-management/inbound-receipts/receipt-1/needs-revision", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "receipt-1" }) });
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ message: expect.stringContaining("persetujuan per item") });
  });
});
