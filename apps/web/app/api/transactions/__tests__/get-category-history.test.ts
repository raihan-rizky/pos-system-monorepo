import { beforeEach, describe, expect, it, vi } from "vitest";

type RecordValue = Record<string, any>;

const state = vi.hoisted(() => ({
  records: [] as RecordValue[],
  queries: [] as RecordValue[],
}));

vi.mock("@/lib/rbac/guard", () => ({
  requirePermission: vi.fn(async () => ({ id: "owner", role: "OWNER", storeId: "store-main" })),
  requireRole: vi.fn(),
  handleAuthError: vi.fn(() => null),
  AuthError: class AuthError extends Error {},
}));

// Evaluate the Prisma subset used by the public GET contract against real fixtures.
function matches(record: RecordValue, where: RecordValue): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "AND") return (Array.isArray(expected) ? expected : [expected]).every((condition) => matches(record, condition));
    if (key === "OR") return expected.some((condition: RecordValue) => matches(record, condition));
    if (key === "NOT") return !matches(record, expected);
    const actual = record[key];
    if (expected === null) return actual == null;
    if (typeof expected !== "object") return actual === expected;
    if ("not" in expected) return actual != expected.not;
    if ("is" in expected) return expected.is === null ? actual == null : actual != null && matches(actual, expected.is);
    if ("isNot" in expected) return expected.isNot === null ? actual != null : actual == null || !matches(actual, expected.isNot);
    if ("some" in expected) return (actual ?? []).some((item: RecordValue) => matches(item, expected.some));
    if ("none" in expected) return !(actual ?? []).some((item: RecordValue) => matches(item, expected.none));
    if ("contains" in expected) return String(actual ?? "").toLowerCase().includes(expected.contains.toLowerCase());
    return actual != null && matches(actual, expected);
  });
}

vi.mock("@pos/db", () => ({
  db: { transaction: {
    fields: { total: {} },
    count: async ({ where }: RecordValue) => {
      state.queries.push(where);
      return state.records.filter((record) => matches(record, where)).length;
    },
    findMany: async ({ where, skip, take }: RecordValue) => {
      state.queries.push(where);
      return state.records.filter((record) => matches(record, where)).slice(skip, skip + take);
    },
  } },
  Prisma: {},
}));

const product = (categoryId: string) => ({ productId: `product-${categoryId}`, printingServiceId: null, product: { categoryId }, quantity: 1 });
const service = { productId: null, printingServiceId: "legacy-service", product: null, quantity: 1 };

function transaction(id: string, override: RecordValue = {}): RecordValue {
  return { id, storeId: "store-main", transactionCategory: null, printingSubcategory: null, printingReceipt: null, items: [], suratJalan: [], status: "COMPLETED", ...override };
}

async function history(query: string) {
  const { GET } = await import("../route");
  const response = await GET(new Request(`http://localhost/api/transactions?${query}`));
  expect(response.status).toBe(200);
  return response.json();
}

describe("GET /api/transactions dependent category filters", { timeout: 30_000 }, () => {
  beforeEach(() => {
    state.queries = [];
    state.records = [
      transaction("legacy-empty"),
      transaction("legacy-paper", { items: [product("paper")] }),
      transaction("atk-mixed", { transactionCategory: "ATK", items: [product("bottle"), product("paper")] }),
      transaction("legacy-print", { items: [service] }),
      transaction("receipt-banner", { transactionCategory: "PERCETAKAN", printingSubcategory: "SPANDUK", printingReceipt: { id: "receipt-1", number: "SP-001", subcategory: "SPANDUK" }, items: [product("paper")] }),
      transaction("receipt-print", { transactionCategory: "PERCETAKAN", printingSubcategory: "PRINT", printingReceipt: { id: "receipt-2", number: "PR-001", subcategory: "PRINT" } }),
      transaction("another-store", { storeId: "other", transactionCategory: "ATK", items: [product("paper")] }),
    ];
  });

  it("classifies old products and empty regular transactions as ATK", async () => {
    const json = await history("transactionCategory=ATK");
    expect(json.data.map((item: RecordValue) => item.id)).toEqual(["legacy-empty", "legacy-paper", "atk-mixed"]);
    expect(json.pagination.total).toBe(3);
  });

  it("matches any ATK item category while excluding printing stock materials", async () => {
    const json = await history("transactionCategory=ATK&categoryId=paper&limit=1&page=2");
    expect(json.data.map((item: RecordValue) => item.id)).toEqual(["atk-mixed"]);
    expect(json.pagination).toMatchObject({ total: 2, page: 2, totalPages: 2 });
    expect(state.queries[0]).toEqual(state.queries[1]);
  });

  it("includes old printing services only when no specific printing subtype is selected", async () => {
    const all = await history("transactionCategory=PERCETAKAN");
    expect(all.data.map((item: RecordValue) => item.id)).toEqual(["legacy-print", "receipt-banner", "receipt-print"]);
    const banner = await history("transactionCategory=PERCETAKAN&printingSubcategory=SPANDUK");
    expect(banner.data.map((item: RecordValue) => item.id)).toEqual(["receipt-banner"]);
    expect(banner.data[0].printingReceipt).toMatchObject({ id: "receipt-1", number: "SP-001" });
    expect(banner.pagination.total).toBe(1);
  });

  it("ignores irrelevant dependent selections and combines the parent with search and status", async () => {
    const json = await history("transactionCategory=PERCETAKAN&categoryId=paper&status=COMPLETED&search=PR-001");
    expect(json.data.map((item: RecordValue) => item.id)).toEqual(["receipt-print"]);
    expect(json.pagination.total).toBe(1);
  });

  it("keeps every category visible when no parent is selected", async () => {
    const json = await history("categoryId=paper&printingSubcategory=SPANDUK");
    expect(json.pagination.total).toBe(6);
  });

  it.each(["SPANDUK", "PERCETAKAN", "PLAT", "STEMPEL", "PRINT"])("filters %s independently while preserving server totals", async subcategory => {
    state.records = [
      ...Array.from({ length: 12 }, (_, index) => transaction(`matching-${index}`, { transactionCategory: "PERCETAKAN", printingSubcategory: subcategory, printingReceipt: { number: `NOTA-${index}` } })),
      transaction("wrong-store", { storeId: "other", transactionCategory: "PERCETAKAN", printingSubcategory: subcategory }),
      transaction("wrong-parent", { transactionCategory: "ATK", printingSubcategory: subcategory }),
    ];
    const json = await history(`transactionCategory=PERCETAKAN&printingSubcategory=${subcategory}&page=2&limit=10`);
    expect(json.data.map((item: RecordValue) => item.id)).toEqual(["matching-10", "matching-11"]);
    expect(json.pagination).toMatchObject({ total: 12, page: 2, totalPages: 2 });
    expect(state.queries[0]).toEqual(state.queries[1]);
  });
  it("returns an empty page and zero count for a receipt number from another store", async () => {
    state.records.push(transaction("foreign-receipt", { storeId: "other", transactionCategory: "PERCETAKAN", printingSubcategory: "PLAT", printingReceipt: { number: "RAHASIA-TOKO-LAIN" } }));
    const json = await history("transactionCategory=PERCETAKAN&printingSubcategory=PLAT&search=RAHASIA-TOKO-LAIN");
    expect(json.data).toEqual([]);
    expect(json.pagination.total).toBe(0);
  });
});
