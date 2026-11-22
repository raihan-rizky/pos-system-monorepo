import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  debt: 175000,
  spent: 0,
  row: {} as Record<string, any>,
  logs: [] as Record<string, any>[],
}));

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: async () => ({ id: "owner-1", name: "Pemilik", role: "OWNER", storeId: "store-main" }),
  handleAuthError: () => null,
  canAuthenticatedUserAccessPage: async () => true,
  canAuthenticatedUserPerform: async () => true,
}));

vi.mock("@pos/db", () => {
  const customer = {
    findFirst: async () => ({ id: "customer-1", name: "Pelanggan", totalDebt: state.debt, totalSpent: state.spent }),
    updateMany: async ({ data }: any) => {
      state.debt -= data.totalDebt.decrement;
      state.spent += data.totalSpent.increment;
      return { count: 1 };
    },
  };
  const tx = {
    customer,
    $queryRawUnsafe: async () => {
      // Another transaction commits a note edit after findMany but before this lock.
      state.row.note = "Catatan terbaru";
      return [{ id: state.row.id }];
    },
    transaction: {
      findMany: async () => [structuredClone(state.row)],
      updateMany: async ({ where, data }: any) => {
        if (where.id !== state.row.id || where.amountPaid !== state.row.amountPaid ||
          (Object.hasOwn(where, "note") && where.note !== state.row.note)) return { count: 0 };
        Object.assign(state.row, data);
        return { count: 1 };
      },
    },
    debtPaymentLog: { create: async ({ data }: any) => { state.logs.push(data); return data; } },
  };
  return { Prisma: {}, db: { ...tx, $transaction: async (operation: (client: unknown) => Promise<unknown>) => {
    const previous = { debt: state.debt, spent: state.spent, amountPaid: state.row.amountPaid, status: state.row.status };
    try { return await operation(tx); } catch (error) {
      state.debt = previous.debt;
      state.spent = previous.spent;
      state.row.amountPaid = previous.amountPaid;
      state.row.status = previous.status;
      state.logs = [];
      throw error;
    }
  } } };
});

import { POST } from "../route";

describe("pelunasan bersamaan dengan perubahan catatan", () => {
  beforeEach(() => {
    state.debt = 175000;
    state.spent = 0;
    state.logs = [];
    state.row = {
      id: "tx-1", storeId: "store-main", customerId: "customer-1", status: "COMPLETED",
      paymentMethod: "TEMPO", total: 200000, amountPaid: 25000, note: "Catatan lama",
    };
  });

  it("membatalkan pembayaran yang membaca catatan lama dan mempertahankan edit terbaru", async () => {
    const response = await POST(new Request("http://localhost/api/customers/customer-1/pay-debt", {
      method: "POST", body: JSON.stringify({ amount: 50000, paymentMethod: "TRANSFER", note: "Pelunasan" }),
    }), { params: Promise.resolve({ id: "customer-1" }) });

    expect(response.status).toBe(409);
    expect(state.row.note).toBe("Catatan terbaru");
    expect(state.row.amountPaid).toBe(25000);
    expect(state.debt).toBe(175000);
    expect(state.logs).toEqual([]);
  });
});
