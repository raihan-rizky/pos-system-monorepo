import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";
import type { DatabaseResetPlan } from "@/features/database-reset/types/database-reset";

const requireRoleMock = vi.hoisted(() => vi.fn());
const handleAuthErrorMock = vi.hoisted(() => vi.fn());
const createDatabaseResetPlanMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rbac/guard", () => ({
  AuthError: class AuthError extends Error {
    statusCode: number;

    constructor(statusCode: number, message?: string) {
      super(message || "auth");
      this.statusCode = statusCode;
    }
  },
  requireRole: requireRoleMock,
  handleAuthError: handleAuthErrorMock,
}));

vi.mock("@/features/database-reset/helpers/database-reset-plan", () => ({
  createDatabaseResetPlan: createDatabaseResetPlanMock,
}));

vi.mock("@pos/db", () => ({ db: {} }));
vi.mock("@/lib/logger", () => ({
  getLogger: () => ({ error: vi.fn() }),
}));

const validPlan: DatabaseResetPlan = {
  storeId: "store-a",
  domains: ["salesFinance"],
  operations: [],
  cascades: [],
  requiredDependencies: [],
  preserved: [],
  canExecute: true,
};

function requestWith(body: unknown) {
  return new Request("http://localhost/api/settings/database-reset/preview", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/settings/database-reset/preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleAuthErrorMock.mockReturnValue(null);
    createDatabaseResetPlanMock.mockResolvedValue(validPlan);
  });

  it("returns a preview for the authenticated owner store", async () => {
    requireRoleMock.mockResolvedValue({ id: "owner-1", role: "OWNER", storeId: "store-a" });

    const response = await POST(requestWith({ domains: ["salesFinance"] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(validPlan);
    expect(createDatabaseResetPlanMock).toHaveBeenCalledWith({
      db: {},
      storeId: "store-a",
      domains: ["salesFinance"],
    });
  });

  it("returns auth errors for a non-owner", async () => {
    const authResponse = Response.json({ message: "Insufficient permissions" }, { status: 403 });
    requireRoleMock.mockRejectedValue(new Error("Insufficient permissions"));
    handleAuthErrorMock.mockReturnValue(authResponse);

    const response = await POST(requestWith({ domains: ["salesFinance"] }));

    expect(response.status).toBe(403);
    expect(createDatabaseResetPlanMock).not.toHaveBeenCalled();
  });

  it("rejects empty or unknown domain selections", async () => {
    requireRoleMock.mockResolvedValue({ id: "owner-1", role: "OWNER", storeId: "store-a" });

    const emptyResponse = await POST(requestWith({ domains: [] }));
    const unknownResponse = await POST(requestWith({ domains: ["everything"] }));

    expect(emptyResponse.status).toBe(422);
    expect(unknownResponse.status).toBe(422);
    expect(createDatabaseResetPlanMock).not.toHaveBeenCalled();
  });

  it("previews a single sub-data choice without expanding it into its category", async () => {
    requireRoleMock.mockResolvedValue({ id: "owner-1", role: "OWNER", storeId: "store-a" });
    const response = await POST(requestWith({ models: ["ProductPriceLog"], storeId: "other-store" }));
    expect(response.status).toBe(200);
    expect(createDatabaseResetPlanMock).toHaveBeenCalledWith({ db: {}, storeId: "store-a", models: ["ProductPriceLog"] });
  });

  it("rejects empty, unknown, unsafe child, and ambiguous selections", async () => {
    requireRoleMock.mockResolvedValue({ id: "owner-1", role: "OWNER", storeId: "store-a" });
    for (const body of [{ models: [] }, { models: ["User"] }, { models: ["TransactionItem"] }, { domains: ["productCatalog"], models: ["ProductPriceLog"] }]) {
      expect((await POST(requestWith(body))).status).toBe(422);
    }
    expect(createDatabaseResetPlanMock).not.toHaveBeenCalled();
  });
});
