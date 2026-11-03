import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePermission: vi.fn(), databaseRead: vi.fn() }));
vi.mock("@/lib/rbac/guard", () => ({ requireRole: mocks.requirePermission, requirePermission: mocks.requirePermission, handleAuthError: () => null }));
vi.mock("@pos/db", () => ({
  db: {
    expense: { findFirst: mocks.databaseRead, findMany: mocks.databaseRead, count: mocks.databaseRead },
    transaction: { findMany: mocks.databaseRead },
  },
}));

import { GET as expenses, POST as createExpense } from "@/app/api/finance/expenses/route";
import { GET as summary } from "@/app/api/finance/expenses/summary/route";
import { GET as report } from "@/app/api/finance/report/route";
import { GET as journal } from "@/app/api/finance/report/journal/route";
import { PATCH as editExpense, DELETE as deleteExpense } from "@/app/api/finance/expenses/[id]/route";
import { DELETE as deleteAttachment } from "@/app/api/finance/expenses/[id]/attachment/route";

describe("isolasi keuangan untuk pengguna tanpa toko", () => {
  it.each([
    ["daftar pengeluaran", () => expenses(new Request("http://localhost/api/finance/expenses"))],
    ["ringkasan", () => summary(new Request("http://localhost/api/finance/expenses/summary"))],
    ["laporan", () => report(new Request("http://localhost/api/finance/report"))],
    ["jurnal", () => journal(new Request("http://localhost/api/finance/report/journal?period=monthly"))],
    ["membuat pengeluaran", () => createExpense(new Request("http://localhost/api/finance/expenses", { method: "POST" }))],
    ["mengubah pengeluaran", () => editExpense(new Request("http://localhost/api/finance/expenses/1", { method: "PATCH" }), { params: Promise.resolve({ id: "1" }) })],
    ["menghapus pengeluaran", () => deleteExpense(new Request("http://localhost/api/finance/expenses/1", { method: "DELETE" }), { params: Promise.resolve({ id: "1" }) })],
    ["menghapus lampiran", () => deleteAttachment(new Request("http://localhost/api/finance/expenses/1/attachment", { method: "DELETE" }), { params: Promise.resolve({ id: "1" }) })],
  ])("menolak %s tanpa mengakses toko lain", async (_label, run) => {
    mocks.requirePermission.mockResolvedValue({ id: "user-1", storeId: null });
    mocks.databaseRead.mockReset().mockRejectedValue(new Error("database harus tidak diakses"));

    const response = await run();

    expect(response.status).toBe(403);
    expect(mocks.databaseRead).not.toHaveBeenCalled();
  });
});
