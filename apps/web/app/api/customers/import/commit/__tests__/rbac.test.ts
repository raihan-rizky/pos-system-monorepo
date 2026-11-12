import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";

const mocks = vi.hoisted(() => ({ permission: vi.fn(), identity: vi.fn(), transaction: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock("@/features/customer-debt/server/customer-identity-authorization",()=>({requireCustomerDebtIdentityPermission:mocks.identity}));
vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: mocks.permission,
  handleAuthError: (error: unknown) => error instanceof Error && error.message === "Forbidden" ? new Response(null, { status: 403 }) : null,
}));
vi.mock("@pos/db", () => ({ db: { $transaction: mocks.transaction }, Prisma: {} }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

function request(rows: object[], decisions: Record<string, string>) {
  return new Request("http://localhost/api/customers/import/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows, decisions }) });
}
const base = { type: "UMUM", duplicateInFile: false, warnings: [], errors: [] };

describe("customer import authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.permission.mockImplementation(async (_target: string, action: string) => {
      if (action === "update") throw new Error("Forbidden");
      return { id: "user-1", role: "SALES", storeId: "store-1" };
    });
    mocks.findMany.mockResolvedValue([{ id: "existing-1", phone: "0811111111" }]);
    mocks.create.mockResolvedValue({});
    mocks.update.mockResolvedValue({});
    mocks.identity.mockResolvedValue(undefined);
    mocks.transaction.mockImplementation(async (callback) => callback({ $queryRaw:vi.fn(), customer: {findFirst:async()=>({id:"existing-1",name:"Lama"}), findMany: mocks.findMany, create: mocks.create, update: mocks.update } }));
  });

  it("denies a mixed import before creating or updating any customer", async () => {
    const rows = [
      { ...base, rowNumber: 1, name: "Baru", phone: "0822222222" },
      { ...base, rowNumber: 2, name: "Lama", phone: "0811111111", existingCustomerId: "existing-1" },
    ];
    const response = await POST(request(rows, { "2": "update" }));
    expect(response.status).toBe(403);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("allows a create-only import with customer-create permission", async () => {
    mocks.findMany.mockResolvedValue([]);
    const response = await POST(request([{ ...base, rowNumber: 1, name: "Baru", phone: "0822222222" }], {}));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("checks debt attribution before renaming an existing customer through import",async()=>{
    mocks.permission.mockResolvedValue({id:"sales",role:"SALES",storeId:"store-1"});
    mocks.identity.mockRejectedValue(new Error("Forbidden"));
    const response=await POST(request([{...base,rowNumber:1,name:"Nama baru",phone:"0811111111",existingCustomerId:"existing-1"}],{"1":"update"}));
    expect(response.status).toBe(403);expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.identity).toHaveBeenCalledWith(
      expect.anything(),
      "store-1",
      expect.objectContaining({ id: "sales", role: "SALES", storeId: "store-1" }),
      { id: "existing-1", name: "Lama" },
      "Nama baru",
    );
  });
});
