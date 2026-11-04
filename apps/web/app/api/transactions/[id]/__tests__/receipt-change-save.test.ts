import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "sales-account", name: "Rani", role: "SALES", storeId: "store-main" },
  row: {} as Record<string, any>, changes: [] as Record<string, any>[], notifications: [] as Record<string, any>[],
  failNotification: false, locks: 0,
}));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: async () => state.user, handleAuthError: () => null }));
vi.mock("@pos/db", () => {
  const transaction = {
    findFirst: async ({ where }: any) => where.storeId === state.row.storeId && where.id === state.row.id ? structuredClone(state.row) : null,
    findFirstOrThrow: async ({ where }: any) => {
      if (where.storeId !== state.row.storeId || where.id !== state.row.id) throw new Error("not found");
      return structuredClone(state.row);
    },
    update: async ({ data }: any) => { Object.assign(state.row, data); return structuredClone(state.row); },
  };
  const tx = {
    transaction,
    $queryRaw: async () => { state.locks++; return [{ id: state.row.id }]; },
    transactionReceiptChange: { create: async ({ data }: any) => {
      const entry = { id: `change-${state.changes.length + 1}`, ...structuredClone(data) };
      state.changes.push(entry); return { id: entry.id };
    } },
    user: { findMany: async () => [{ id: "owner" }] },
    notification: { createMany: async ({ data }: any) => {
      if (state.failNotification) throw new Error("notification failed");
      state.notifications.push(...structuredClone(data));
      return { count: data.length };
    } },
  };
  return { Prisma: {}, db: { ...tx, $transaction: async (operation: (client: unknown) => Promise<unknown>) => {
    const previous = structuredClone({ row: state.row, changes: state.changes, notifications: state.notifications });
    try { return await operation(tx); }
    catch (error) { Object.assign(state, previous); throw error; }
  } } };
});
import { PATCH } from "../route";

describe("penyimpanan rincian transaksi dan audit Sales", () => {
  beforeEach(() => {
    state.user.role = "SALES"; state.failNotification = false; state.locks = 0; state.changes = []; state.notifications = [];
    state.row = {
      id: "tx-1", storeId: "store-main", invoiceNumber: "INV-001", invoiceDate: new Date("2026-11-04T02:00:00Z"),
      customerId: null, customerName: "Nama awal", salespersonId: null, salesName: "Rani", note: null,
      status: "COMPLETED", printingSubcategory: null, printingReceipt: null, paymentMethod: "CASH",
      subtotal: 10000, discount: 0, tax: 0, taxRate: null, taxMethod: "EXCLUSIVE", total: 10000, amountPaid: 10000, change: 0,
      items: [], payments: [{ id: "payment", method: "CASH", amount: 10000 }],
      debtPaymentLogs: [],
    };
  });
  const save = (name: string) => PATCH(new Request("http://localhost/api/transactions/tx-1", { method: "PATCH", body: JSON.stringify({ customerName: name }) }), { params: Promise.resolve({ id: "tx-1" }) });

  it("mengunci transaksi dan menyimpan rincian, kedua versi, serta notifikasi bersama", async () => {
    expect((await save("Nama baru")).status).toBe(200);
    expect(state.locks).toBe(1);
    expect(state.row.customerName).toBe("Nama baru");
    expect(state.changes[0].before.customerName).toBe("Nama awal");
    expect(state.changes[0].after.customerName).toBe("Nama baru");
    expect(state.notifications[0].url).toBe("/history/receipt-changes/tx-1?change=change-1");
  });
  it("membatalkan edit beserta versi saat pemberitahuan gagal disimpan", async () => {
    state.failNotification = true;
    expect((await save("Nama baru")).status).toBe(500);
    expect(state.row.customerName).toBe("Nama awal");
    expect(state.changes).toEqual([]);
    expect(state.notifications).toEqual([]);
  });
  it("mencatat perubahan DP dan mengabaikan draft serta pending", async () => {
    state.row.status = "DP";
    expect((await save("Nama DP")).status).toBe(200);
    expect(state.changes).toHaveLength(1);
    state.row.status = "DRAFT";
    expect((await save("Nama draft")).status).toBe(200);
    state.row.status = "PENDING_APPROVAL";
    expect((await save("Nama pending")).status).toBe(200);
    expect(state.changes).toHaveLength(1);
  });
  it("tetap mengizinkan edit Owner tanpa pemberitahuan perubahan Sales", async () => {
    state.user.role = "OWNER";
    expect((await save("Koreksi Owner")).status).toBe(200);
    expect(state.row.customerName).toBe("Koreksi Owner");
    expect(state.changes).toEqual([]);
    expect(state.notifications).toEqual([]);
  });
});
