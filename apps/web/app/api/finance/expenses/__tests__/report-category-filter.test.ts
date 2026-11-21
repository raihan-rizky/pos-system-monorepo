import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: async () => ({ id: "u1", storeId: "s1" }),
  canAuthenticatedUserAccessPage: async () => true, handleAuthError: () => null }));
vi.mock("@/features/keuangan/services/recognized-finance", () => ({ loadRecognizedExpenses: mocks.load }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { GET } from "../route";

describe("filter kategori laporan pengeluaran", () => {
  beforeEach(() => mocks.load.mockResolvedValue({ incomplete: false, rows: [
    { id: "transfer", category: "SUPPLIES", reportCategories: ["report:ATK", "report:SPANDUK"] },
    { id: "payable", category: "report:ATK" },
    { id: "other", category: "OTHER" },
  ] }));
  it("menemukan transfer dengan beberapa alokasi serta pelunasan hutang dalam kategori terpilih", async () => {
    const response = await GET(new Request("http://localhost/api/finance/expenses?month=2026-11&category=report%3AATK"));
    expect(response.status).toBe(200);
    expect((await response.json()).data.map((row: { id: string }) => row.id)).toEqual(["transfer", "payable"]);
  });
});
