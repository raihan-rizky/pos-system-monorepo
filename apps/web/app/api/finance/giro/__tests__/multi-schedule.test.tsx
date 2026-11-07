import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn(), transaction: vi.fn(), items: [] as unknown[] }));
vi.mock("@pos/db", () => ({ db: { $queryRaw: mocks.query, $transaction: mocks.transaction } }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: async () => ({ id: "owner-1", storeId: "store-1" }), handleAuthError: () => null }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ userId: "owner-1", storeId: "store-1" }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  useQuery: () => ({ data: { items: mocks.items, manualPayables: [] }, isLoading: false, isError: false }),
}));

import { GET } from "../route";
import { POST } from "../[goodsPurchaseId]/reconcile/route";
import { GiroPanel } from "@/features/keuangan/components/GiroPanel";

const schedule = [
  { id: "giro-1", amount: "20000.00", dueDate: "2026-11-14", note: null },
  { id: "giro-2", amount: "40000.00", dueDate: "2026-12-07", note: "30 hari" },
];

describe("multi-giro finance compatibility", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.items = [];
    mocks.transaction.mockImplementation(async callback => callback({ $queryRaw: mocks.query }));
  });

  it("lists every due date with numeric amounts and one aggregate payable", async () => {
    mocks.query.mockResolvedValueOnce([{
      goodsPurchaseId: "purchase-1", number: "PB-001", supplierName: "Contoh", amount: "60000",
      debtDate: "2026-10-31", dueDate: "2026-11-14", payableId: "payable-1", historyVerifiedAt: new Date(),
      payments: [], schedule,
    }]).mockResolvedValueOnce([]);
    const response = await GET(new Request("http://localhost/api/finance/giro"));
    expect(response.status).toBe(200);
    const { items } = await response.json();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ amount: 60_000, remaining: 60_000, payableId: "payable-1",
      schedule: schedule.map(row => ({ ...row, amount: Number(row.amount) })),
    });
    const sql = (mocks.query.mock.calls[0][0] as TemplateStringsArray).join(" ");
    expect(sql).toContain('"pos_goods_purchase_payments"');
    expect(sql).toContain('s."giroAmount"');
    expect(sql).toContain('x."amount" = g."totalAmount"');
  });

  it("reconciles the giro subtotal while retaining full-purchase expense matching", async () => {
    mocks.query.mockResolvedValueOnce([]);
    const response = await POST(new Request("http://localhost/api/finance/giro/purchase-1/reconcile", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ historyComplete: true, payments: [] }),
    }), { params: Promise.resolve({ goodsPurchaseId: "purchase-1" }) });
    expect(response.status).toBe(404);
    const sql = (mocks.query.mock.calls[0][0] as TemplateStringsArray).join(" ");
    expect(sql).toContain('"pos_goods_purchase_payments"');
    expect(sql).toContain('s."giroAmount"');
    expect(sql).toContain('x."amount" = g."totalAmount"');
  });

  it("shows both scheduled giro amounts and dates in the existing finance panel", () => {
    mocks.items = [{ goodsPurchaseId: "purchase-1", number: "PB-001", supplierName: "Contoh", amount: 60_000,
      debtDate: "2026-10-31", dueDate: "2026-11-14", payableId: "payable-1", status: "UNPAID", remaining: 60_000,
      paid: 0, payments: [], schedule: schedule.map(row => ({ ...row, amount: Number(row.amount) })),
    }];
    const html = renderToStaticMarkup(<GiroPanel canUpdate={false} />);
    expect(html).toContain("2026-12-07");
    expect(html).toContain("20.000");
    expect(html).toContain("40.000");
    expect(html).toContain("30 hari");
  });
});
