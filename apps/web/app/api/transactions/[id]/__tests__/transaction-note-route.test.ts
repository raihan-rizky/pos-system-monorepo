import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "user-1", name: "Rani", role: "OWNER", storeId: "store-main" },
  denied: false,
  statusOnLock: null as string | null,
  reverseResult: "APPLIED" as "APPLIED" | "ALREADY_VOIDED",
  row: {} as Record<string, any>,
  changes: [] as Record<string, any>[],
  notifications: [] as Record<string, any>[],
}));

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: async (scope: string, action: string) => {
    if (scope !== "transaction" || action !== "update" || state.denied) throw new Error("denied");
    return state.user;
  },
  handleAuthError: (error: Error) => error.message === "denied"
    ? Response.json({ message: "Tidak memiliki izin" }, { status: 403 })
    : null,
}));

vi.mock("@/features/transactions-stock/services/transaction-reversal-service", () => ({
  TransactionReversalConflictError: class extends Error {},
  reverseTransaction: async () => { state.row.status = "VOIDED"; return state.reverseResult; },
}));

vi.mock("@pos/db", () => {
  const transaction = {
    findFirst: async ({ where }: any) => where.id === state.row.id && where.storeId === state.row.storeId
      ? structuredClone(state.row) : null,
    findFirstOrThrow: async ({ where }: any) => {
      if (where.id !== state.row.id || where.storeId !== state.row.storeId) throw new Error("not found");
      return structuredClone(state.row);
    },
    findUniqueOrThrow: async () => structuredClone(state.row),
    update: async ({ data }: any) => { Object.assign(state.row, data); return structuredClone(state.row); },
  };
  const tx = {
    transaction,
    $queryRaw: async () => {
      if (state.statusOnLock) state.row.status = state.statusOnLock;
      return [{ id: state.row.id }];
    },
    transactionReceiptChange: { create: async ({ data }: any) => {
      state.changes.push(structuredClone(data));
      return { id: "change-1" };
    } },
    user: { findMany: async () => [{ id: "owner-1" }] },
    notification: { createMany: async ({ data }: any) => {
      state.notifications.push(...structuredClone(data));
      return { count: data.length };
    } },
  };
  return { Prisma: {}, db: { ...tx, $transaction: async (operation: (client: unknown) => Promise<unknown>) => {
    const previous = structuredClone({ row: state.row, changes: state.changes, notifications: state.notifications });
    try { return await operation(tx); } catch (error) { Object.assign(state, previous); throw error; }
  } } };
});

import { PATCH } from "../route";

const save = (body: Record<string, unknown>) => PATCH(
  new Request("http://localhost/api/transactions/tx-1", { method: "PATCH", body: JSON.stringify(body) }),
  { params: Promise.resolve({ id: "tx-1" }) },
);

describe("mengubah catatan transaksi", () => {
  beforeEach(() => {
    state.user.role = "OWNER";
    state.denied = false;
    state.statusOnLock = null;
    state.reverseResult = "APPLIED";
    state.changes = [];
    state.notifications = [];
    state.row = {
      id: "tx-1", storeId: "store-main", invoiceNumber: "INV-001", invoiceDate: new Date("2026-11-04T02:00:00Z"),
      customerId: null, customerName: "Pelanggan", salespersonId: null, salesName: "Rani", note: null,
      status: "COMPLETED", printingSubcategory: null, printingReceipt: null, suratJalan: [], paymentMethod: "CASH",
      subtotal: 10000, discount: 0, tax: 0, taxRate: null, taxMethod: "EXCLUSIVE", total: 10000, amountPaid: 10000, change: 0,
      items: [], payments: [{ id: "payment", method: "CASH", amount: 10000 }], debtPaymentLogs: [],
    };
  });

  it("menambahkan catatan pada transaksi tanpa catatan", async () => {
    expect((await save({ note: "Kirim sore", expectedNote: null })).status).toBe(200);
    expect(state.row.note).toBe("Kirim sore");
  });

  it("mengganti dan menghapus teks tanpa menghapus anotasi sistem", async () => {
    state.row.note = "Lama | Pelunasan piutang 500.000 (CASH) [DIVISI:Produksi]";
    const original = state.row.note;
    expect((await save({ note: "Baru", expectedNote: original })).status).toBe(200);
    expect(state.row.note).toContain("Baru");
    expect(state.row.note).toContain("Pelunasan piutang 500.000 (CASH)");
    expect(state.row.note).toContain("[DIVISI:Produksi]");
    const changed = state.row.note;
    expect((await save({ note: "", expectedNote: changed })).status).toBe(200);
    expect(state.row.note).not.toContain("Baru");
    expect(state.row.note).toContain("Pelunasan piutang 500.000 (CASH)");
    expect(state.row.note).toContain("[DIVISI:Produksi]");
  });

  it("menolak catatan tanpa versi awal meskipun field lain valid", async () => {
    expect((await save({ note: "Baru", customerName: "Nama baru" })).status).toBe(422);
    expect(state.row.customerName).toBe("Pelanggan");
    expect(state.row.note).toBeNull();
  });

  it("menolak perubahan yang didasarkan pada catatan lama", async () => {
    state.row.note = "Catatan terbaru";
    expect((await save({ note: "Perubahan saya", expectedNote: "Catatan lama" })).status).toBe(409);
    expect(state.row.note).toBe("Catatan terbaru");
  });

  it("membatalkan void jika catatan telah berubah", async () => {
    state.row.note = "Catatan terbaru";
    expect((await save({ status: "VOIDED", note: "Perubahan saya", expectedNote: "Catatan lama" })).status).toBe(409);
    expect(state.row.status).toBe("COMPLETED");
    expect(state.row.note).toBe("Catatan terbaru");
  });

  it("melaporkan konflik jika transaksi sudah di-void sebelum catatan disimpan", async () => {
    state.row.note = "Catatan lama";
    state.reverseResult = "ALREADY_VOIDED";

    const response = await save({ status: "VOIDED", note: "Catatan baru", expectedNote: "Catatan lama" });

    expect(response.status).toBe(409);
    expect(state.row.note).toBe("Catatan lama");
  });

  it("menolak pengguna tanpa izin mengubah transaksi", async () => {
    state.denied = true;
    expect((await save({ note: "Baru", expectedNote: null })).status).toBe(403);
    expect(state.row.note).toBeNull();
  });

  it("mencatat perubahan catatan oleh Sales pada audit nota", async () => {
    state.user.role = "SALES";
    state.row.note = "Lama";
    expect((await save({ note: "Baru", expectedNote: "Lama" })).status).toBe(200);
    expect(state.changes).toHaveLength(1);
    expect(state.changes[0].before.note).toBe("Lama");
    expect(state.changes[0].after.note).toBe("Baru");
    expect(state.notifications[0].body).toContain("catatan");
  });

  it("menjaga alur terpisah untuk nota percetakan yang sudah diproses", async () => {
    state.row.printingSubcategory = "DIGITAL";
    expect((await save({ note: "Baru", expectedNote: null })).status).toBe(409);
    expect(state.row.note).toBeNull();
  });

  it.each([
    { status: "VOIDED" },
    { status: "REFUNDED" },
    { status: "PENDING" },
    { printingReceipt: { id: "receipt-1" } },
    { suratJalan: [{ id: "shipment-1" }] },
  ])("menolak catatan untuk transaksi di luar alur edit reguler: %j", async (fields) => {
    Object.assign(state.row, fields);
    expect((await save({ note: "Baru", expectedNote: null })).status).toBe(409);
    expect(state.row.note).toBeNull();
  });

  it("menolak catatan jika status menjadi void sebelum baris terkunci", async () => {
    state.statusOnLock = "VOIDED";
    expect((await save({ note: "Baru", expectedNote: null })).status).toBe(409);
    expect(state.row.note).toBeNull();
  });
});
