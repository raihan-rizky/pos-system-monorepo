import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "OWNER", storeId: "store-main" as string | null, queries: [] as any[] }));
const history = [
  { id: "later", storeId: "store-main", transactionId: "tx-1", sequence: 2, actorName: "Sales 2", createdAt: new Date("2026-11-04T03:00:00Z"), before: { total: 120 }, after: { total: 150 } },
  { id: "first", storeId: "store-main", transactionId: "tx-1", sequence: 1, actorName: "Sales 1", createdAt: new Date("2026-11-04T02:00:00Z"), before: { total: 100 }, after: { total: 120 } },
  { id: "private", storeId: "store-other", transactionId: "tx-1", sequence: 3, actorName: "Sales lain", createdAt: new Date("2026-11-04T04:00:00Z"), before: { total: 500 }, after: { total: 700 } },
  { id: "other-transaction", storeId: "store-main", transactionId: "tx-2", sequence: 4, actorName: "Sales", createdAt: new Date("2026-11-04T04:00:00Z"), before: { total: 1 }, after: { total: 2 } },
];
vi.mock("@pos/db", () => ({ db: { transactionReceiptChange: { findMany: async (query: any) => {
  state.queries.push(query);
  const rows = history.filter(row => (!query.where.storeId || row.storeId === query.where.storeId) && (!query.where.transactionId || row.transactionId === query.where.transactionId));
  return rows.sort((a, b) => query.orderBy?.sequence === "asc" ? a.sequence - b.sequence : b.sequence - a.sequence)
    .map(({ id, actorName, createdAt, before, after }) => ({ id, actorName, createdAt, before, after }));
} } } }));
vi.mock("@/lib/rbac/guard", () => ({
  requireRole: async (...allowed: string[]) => {
    if (!allowed.includes(state.role)) throw Object.assign(new Error("Tidak diizinkan"), { status: 403 });
    return { id: "viewer", role: state.role, storeId: state.storeId };
  },
  handleAuthError: (error: any) => error.status ? Response.json({ message: error.message }, { status: error.status }) : null,
}));
import { GET } from "../route";

describe("akses riwayat perubahan nota", () => {
  beforeEach(() => { state.role = "OWNER"; state.storeId = "store-main"; state.queries = []; });
  const read = (id = "tx-1") => GET(new Request("http://localhost/api/transactions/tx-1/receipt-changes?storeId=store-other"), { params: Promise.resolve({ id }) });

  it("memberi Owner versi berurutan hanya dari transaksi dan tokonya sendiri", async () => {
    const response = await read();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.changes.map((row: any) => row.id)).toEqual(["first", "later"]);
    expect(body.data.changes[0].before).toEqual({ total: 100 });
    expect(body.data.changes[1].after).toEqual({ total: 150 });
  });
  it.each(["SALES", "ADMIN", "CASHIER", "INVENTORY"])("menolak %s sebelum membaca snapshot", async role => {
    state.role = role;
    expect((await read()).status).toBe(403);
    expect(state.queries).toEqual([]);
  });
  it("memakai toko utama untuk Owner lama tanpa storeId", async () => {
    state.storeId = null;
    const body = await (await read()).json();
    expect(body.data.changes.map((row: any) => row.id)).toEqual(["first", "later"]);
  });
  it("tidak membocorkan data untuk transaksi yang tidak ada di toko Owner", async () => {
    expect(await (await read("missing")).json()).toEqual({ data: { changes: [] } });
  });
});
