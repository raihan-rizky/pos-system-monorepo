import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  role: "SALES", debt: 225000, spent: 0, failNotification: false,
  rows: [] as Record<string, any>[], changes: [] as Record<string, any>[],
  notifications: [] as Record<string, any>[], events: [] as string[],
}));

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: async () => ({ id: "sales-1", name: "Rani", role: state.role, storeId: "store-main" }),
  handleAuthError: () => null,
  canAuthenticatedUserAccessPage: async () => true,
  canAuthenticatedUserPerform: async (user: { role: string }) => user.role === "OWNER",
}));
vi.mock("@pos/db", () => {
  const tx = {
    customer: {
      findFirst: async () => ({ id: "customer-1", name: "Pelanggan", totalDebt: state.debt, totalSpent: state.spent }),
      updateMany: async ({ data }: any) => {
        state.events.push("customer-lock");
        state.debt -= data.totalDebt.decrement;
        state.spent += data.totalSpent.increment;
        return { count: 1 };
      },
    },
    $queryRawUnsafe: async (query: string, id: string, storeId: string) => {
      if (!query.includes('"pos_transactions"') || !query.includes("FOR UPDATE") || storeId !== "store-main") throw new Error("invalid lock");
      state.events.push(`lock:${id}`);
      return [{ id }];
    },
    transaction: {
      findMany: async () => structuredClone(state.rows),
      findFirstOrThrow: async ({ where }: any) => {
        state.events.push(`capture:${where.id}`);
        const row = state.rows.find(row => row.id === where.id && row.storeId === where.storeId);
        if (!row) throw new Error("not found");
        return structuredClone(row);
      },
      updateMany: async ({ where, data }: any) => {
        const row = state.rows.find(row => row.id === where.id && row.storeId === where.storeId && row.amountPaid === where.amountPaid);
        if (!row) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    debtPaymentLog: { create: async ({ data }: any) => {
      state.rows.find(row => row.id === data.transactionId)!.debtPaymentLogs.push(structuredClone(data));
      return data;
    } },
    transactionReceiptChange: { create: async ({ data }: any) => {
      const id = `change-${state.changes.length + 1}`;
      state.changes.push({ id, ...structuredClone(data) });
      return { id };
    } },
    user: { findMany: async () => [{ id: "owner-1" }] },
    notification: { createMany: async ({ data }: any) => {
      if (state.failNotification) throw new Error("notification failed");
      state.notifications.push(...structuredClone(data));
      return { count: data.length };
    } },
  };
  return { Prisma: {}, db: { ...tx, $transaction: async (operation: (client: unknown) => Promise<unknown>) => {
    const previous = structuredClone({ debt: state.debt, spent: state.spent, rows: state.rows, changes: state.changes, notifications: state.notifications });
    try { return await operation(tx); }
    catch (error) { Object.assign(state, previous); throw error; }
  } } };
});

import { POST } from "../route";

describe("riwayat nota pada pembayaran piutang dari pelanggan", () => {
  beforeEach(() => {
    state.role = "SALES"; state.debt = 225000; state.spent = 0; state.failNotification = false;
    state.changes = []; state.notifications = []; state.events = [];
    const common = {
      storeId: "store-main", invoiceDate: new Date("2026-11-04T02:00:00Z"),
      customerId: "customer-1", customerName: "Pelanggan", salespersonId: null, salesName: "Rani", note: null,
      discount: 0, tax: 0, taxRate: null, taxMethod: "EXCLUSIVE", change: 0,
      items: [], payments: [], debtPaymentLogs: [], printingReceipt: null,
    };
    state.rows = [
      { ...structuredClone(common), id: "dp", invoiceNumber: "INV-DP", status: "DP", paymentMethod: "CASH", subtotal: 100000, total: 100000, amountPaid: 50000 },
      { ...structuredClone(common), id: "tempo", invoiceNumber: "INV-TEMPO", status: "COMPLETED", paymentMethod: "TEMPO", subtotal: 200000, total: 200000, amountPaid: 25000 },
    ];
  });
  const pay = () => POST(new Request("http://localhost/api/customers/customer-1/pay-debt", {
    method: "POST", body: JSON.stringify({ amount: 125000, paymentMethod: "TRANSFER" }),
  }), { params: Promise.resolve({ id: "customer-1" }) });

  it("menyimpan setiap nota yang berubah dan memberi Owner tautan versi masing-masing", async () => {
    expect((await pay()).status).toBe(200);
    expect(state.changes.map(change => ({ id: change.transactionId, before: change.before.amountPaid, after: change.after.amountPaid, payments: change.after.debtPayments }))).toEqual([
      { id: "dp", before: 50000, after: 100000, payments: [{ method: "TRANSFER", amount: 50000 }] },
      { id: "tempo", before: 25000, after: 100000, payments: [{ method: "TRANSFER", amount: 75000 }] },
    ]);
    expect(state.changes[0].after.status).toBe("COMPLETED");
    expect(state.changes[1].after.status).toBe("COMPLETED");
    expect(state.notifications.map(notification => notification.url)).toEqual([
      "/history/receipt-changes/dp?change=change-1", "/history/receipt-changes/tempo?change=change-2",
    ]);
    expect(state.events).toEqual(["customer-lock", "lock:dp", "capture:dp", "capture:dp", "lock:tempo", "capture:tempo", "capture:tempo"]);
  });

  it("membatalkan saldo, pembayaran, dan semua versi bila notifikasi gagal", async () => {
    state.failNotification = true;
    expect((await pay()).status).toBe(500);
    expect(state.debt).toBe(225000);
    expect(state.spent).toBe(0);
    expect(state.rows.map(row => [row.amountPaid, row.debtPaymentLogs])).toEqual([[50000, []], [25000, []]]);
    expect(state.changes).toEqual([]);
    expect(state.notifications).toEqual([]);
  });

  it("mempertahankan pembayaran Owner tanpa notifikasi perubahan Sales", async () => {
    state.role = "OWNER";
    expect((await pay()).status).toBe(200);
    expect(state.rows.map(row => row.amountPaid)).toEqual([100000, 100000]);
    expect(state.changes).toEqual([]);
    expect(state.notifications).toEqual([]);
  });
});
