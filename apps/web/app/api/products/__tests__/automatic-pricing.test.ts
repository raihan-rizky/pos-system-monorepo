import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProductPricingDatabase } from "./automatic-pricing-database";
import type { GroupPricingConfig } from "@/features/product-stock-groups/automatic-pricing";
import { PUT, DELETE as deleteOne } from "../[id]/route";
import { POST, DELETE as deleteMany } from "../route";
import { POST as createGroup } from "../../product-stock-groups/route";
import { POST as appendGroup } from "../../product-stock-groups/[id]/products/route";
const state = vi.hoisted(() => ({ db: {} as unknown, storeId: "store-main" }));
vi.mock("@pos/db", () => ({ db: new Proxy({}, { get: (_, key) => Reflect.get(state.db as object, key) }), Prisma: {} }));
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: async () => ({ id: "admin", name: "Admin", storeId: state.storeId }), handleAuthError: () => null }));
let database: ReturnType<typeof createProductPricingDatabase>;
const request = (body: object) => new Request("http://localhost/api/products", { method: "POST", body: JSON.stringify(body) });
const update = (id: string, body: object) => PUT(request(body), { params: Promise.resolve({ id }) });
const config = (id = "group-1") => database.groups.find(g => g.id === id)!.pricingConfig as GroupPricingConfig;
const money = (id: string) => { const p = database.products.find(p => p.id === id)!; return [Number(p.price), p.costPrice === null ? null : Number(p.costPrice)]; };
beforeEach(() => {
  database = createProductPricingDatabase();
  database.groups[0].pricingConfig = {
    sourceProductId: "pcs", revision: 1, initializationVersion: 1,
    members: {
      pcs: { mode: "AUTO", factor: { numerator: "1", denominator: "1" }, review: { price: [], costPrice: [] } },
      pak: { mode: "AUTO", factor: { numerator: "9", denominator: "10" }, review: { price: [], costPrice: [] } },
    },
  };
  state.db = database.raw; state.storeId = "store-main";
});
describe("automatic pricing through product writers", () => {
  it.each([{ price: 3500 }, { costPrice: 2100 }])("cascades independently from legacy source %j and preserves member prices and stock", async (body) => {
    const response = await update("pcs", body);
    expect(response.status).toBe(200);
    expect(money("pak")).toEqual([body.price ? 37800 : 32400, body.costPrice ? 25200 : 24000]);
    expect(config().members.pak.factor).toEqual({ numerator: "9", denominator: "10" });
    expect(database.products[0].hargaAgen).toBe(2800); expect(database.groups[0].baseStock).toBe(24);
    expect(database.locks.slice(0, 3)).toEqual(["group:group-1", "product:pak", "product:pcs"]);
    expect(database.logs.filter(l => l.productId === "pcs" && l.field === (body.price ? "PRICE" : "COST_PRICE"))).toHaveLength(1);
  });
  it("derives follower factor and returns final persisted HPP", async () => {
    const response = await update("pak", { price: 30000 });
    expect(response.status).toBe(200); expect(money("pak")).toEqual([30000, 24000]);
    expect(config().members.pak.factor).toEqual({ numerator: "5", denominator: "6" });
    expect(Number((await response.json()).costPrice)).toBe(24000);
  });
  it.each([21000, 25000, null])("rejects explicit AUTO follower HPP %s including unchanged full-form values", async costPrice => {
    const response = await update("pak", { costPrice });
    expect(response.status).toBe(422); expect((await response.json()).message).toContain("Manual");
    expect(money("pak")).toEqual([32400, 21000]); expect(database.logs).toHaveLength(0);
  });
  it("allows explicit Manual and keeps independent member price history", async () => {
    expect((await update("pak", { pricingMode: "MANUAL", price: 31000, costPrice: 19000, hargaAgen: 29000 })).status).toBe(200);
    expect(config().members.pak.mode).toBe("MANUAL"); expect(money("pak")).toEqual([31000, 19000]);
    expect(database.logs.filter(l => l.productId === "pak" && l.field === "HARGA_AGEN")).toHaveLength(1);
    await update("pcs", { price: 4000, costPrice: 2500 }); expect(money("pak")).toEqual([31000, 19000]);
  });
  it("rolls back the source, followers, config and history when audit fails", async () => {
    const initialConfig = structuredClone(config());
    database.raw.productStockGroupActivity.create.mockRejectedValueOnce(new Error("audit unavailable"));
    expect((await update("pcs", { price: 3500 })).status).toBe(500);
    expect(money("pcs")).toEqual([3000, 2000]); expect(money("pak")).toEqual([32400, 21000]); expect(config()).toEqual(initialConfig); expect(database.logs).toHaveLength(0);
  });
  it.each(["deactivate", "soft", "hard", "bulk"])("retains unavailable source and follower money for %s removal", async operation => {
    await update("pcs", { price: 3500 });
    if (operation === "soft") database.sold.add("pcs");
    const response = operation === "deactivate" ? await update("pcs", { isActive: false }) : operation === "bulk" ? await deleteMany(new Request("http://localhost/api/products?ids=pcs", { method: "DELETE" })) : await deleteOne(request({}), { params: Promise.resolve({ id: "pcs" }) });
    expect(response.status).toBe(operation === "deactivate" || operation === "bulk" ? 200 : 204);
    expect(money("pak")).toEqual([37800, 24000]); expect(config().sourceProductId).toBe("pcs");
    expect(config().members.pak.review.price).toContain("SOURCE_UNAVAILABLE");
  });
  it("isolates stores", async () => { state.storeId = "other-store"; expect((await update("pcs", { price: 1 })).status).toBe(404); expect(money("pcs")).toEqual([3000, 2000]); });
  it("rejects explicit AUTO HPP even when a full form deactivates the follower", async () => {
    expect((await update("pak", { isActive: false, costPrice: 21000 })).status).toBe(422);
    expect(database.products[1].isActive).toBe(true);
  });
  it("re-reads source money after every member lock", async () => {
    const lock = database.raw.$queryRaw.getMockImplementation()!;
    database.raw.$queryRaw.mockImplementation(async (strings, ...values) => {
      const result = await lock(strings, ...values);
      if (database.locks.at(-1) === "product:pcs") database.products[0].price = "4000";
      return result;
    });
    expect((await update("pcs", { costPrice: 2500 })).status).toBe(200);
    expect(money("pak")).toEqual([43200, 30000]);
    expect(config().members.pak.factor).toEqual({ numerator: "9", denominator: "10" });
  });
  it("retains a manually-created group for source and follower money edits", async () => {
    database.groups[0].groupKey = "manual:store-main:100";
    expect((await update("pcs", { price: 3500 })).status).toBe(200);
    expect(database.products[0].stockGroupId).toBe("group-1"); expect(database.groups).toHaveLength(1);
    expect(money("pak")).toEqual([37800, 24000]);
    expect((await update("pak", { price: 36000 })).status).toBe(200);
    expect(config().members.pak.factor).toEqual({ numerator: "6", denominator: "7" });
    expect(database.products[1].stockGroupId).toBe("group-1");
  });
  it("rejects AUTO HPP writes for an already inactive follower", async () => {
    database.products[1].isActive = false;
    expect((await update("pak", { costPrice: 19000 })).status).toBe(422);
    expect(money("pak")).toEqual([32400, 21000]);
  });
  it("preserves the AUTO audit preimage when deactivating a follower in Manual mode", async () => {
    expect((await update("pcs", { price: 3000 })).status).toBe(200);
    expect(config().members.pak.mode).toBe("AUTO");
    expect((await update("pak", { pricingMode: "MANUAL", costPrice: 19000, isActive: false })).status).toBe(200);
    expect(database.products[1].isActive).toBe(false);
    expect(money("pak")).toEqual([32400, 19000]);
    const activity = database.activities.at(-1) as { before: { config: GroupPricingConfig }; after: { config: GroupPricingConfig } };
    expect(activity.before.config.members.pak.mode).toBe("AUTO");
    expect(activity.after.config.members.pak.mode).toBe("MANUAL");
  });
  it("rejects membership races before writing money", async () => {
    const lock = database.raw.$queryRaw.getMockImplementation()!;
    database.raw.$queryRaw.mockImplementation(async (strings, ...values) => {
      const result = await lock(strings, ...values);
      if (database.locks.at(-1) === "product:pak") database.products.push({ ...database.products[1], id: "racing" });
      return result;
    });
    expect((await update("pcs", { price: 5000 })).status).toBe(409);
    expect(money("pcs")).toEqual([3000, 2000]); expect(database.logs).toHaveLength(0);
  });
  it("locks inactive members and allows existing-group joins without discarding them", async () => {
    database.products[1].isActive = false;
    const response = await POST(request({ name: "Snowman", sku: "SN-DUS", categoryId: "cat", unit: "dus", unitMultiplierToBase: 120, price: 1, costPrice: 1 }));
    expect(response.status).toBe(201); expect(database.locks.slice(0, 3)).toEqual(["group:group-1", "product:pak", "product:pcs"]);
    expect(config().members.pak).toBeDefined(); expect(database.products[1].isActive).toBe(false);
  });
  it("records initial independent member prices alongside the normal baseline", async () => {
    const response = await POST(request({ name: "New", sku: "NEW", categoryId: "cat", unit: "pcs", price: 3000, costPrice: 2000, hargaAgen: 2500, hargaDinas: 2700 }));
    expect(response.status).toBe(201); const p = database.products.find(p => p.sku === "NEW")!;
    expect(database.logs.filter(log => log.productId === p.id && log.field === "HARGA_AGEN")).toEqual([expect.objectContaining({ oldValue: null, newValue: "2500.00" })]);
    expect(database.logs.filter(log => log.productId === p.id && log.field === "PRICE")).toHaveLength(1);
  });
  it.each(["MANUAL", "AUTO"])("accepts explicit %s additional-unit intent before creation", async pricingMode => {
    const response = await POST(request({ name: "New", sku: "NEW", categoryId: "cat", unit: "pcs", price: 3000, costPrice: 2000, additionalUnitVariants: [{ unit: "pak", sku: "NEW-PAK", relativeQuantity: 12, price: 31000, costPrice: 19000, pricingMode, ...(pricingMode === "AUTO" ? { priceFactor: { numerator: "9", denominator: "10" } } : {}) }] }));
    expect(response.status).toBe(201); const pack = database.products.find(p => p.sku === "NEW-PAK")!;
    expect(money(pack.id)).toEqual(pricingMode === "MANUAL" ? [31000, 19000] : [32400, 24000]);
    expect(config(pack.stockGroupId!).members[pack.id].mode).toBe(pricingMode);
    expect(database.raw.product.create.mock.calls[0][0].data).not.toHaveProperty("pricingMode");
    expect(database.raw.product.create.mock.calls[1][0].data).not.toHaveProperty("priceFactor");
  });
  it.each(["MANUAL", "AUTO"])("accepts explicit %s intent when joining as a follower", async pricingMode => {
    const response = await POST(request({ name: "Snowman", sku: "SN-DUS", categoryId: "cat", unit: "dus", unitMultiplierToBase: 120, price: 310000, costPrice: 190000, pricingMode, ...(pricingMode === "AUTO" ? { priceFactor: { numerator: "9", denominator: "10" } } : {}) }));
    expect(response.status).toBe(201); const pack = database.products.find(p => p.sku === "SN-DUS")!;
    expect(money(pack.id)).toEqual(pricingMode === "MANUAL" ? [310000, 190000] : [324000, 240000]);
    expect(config().members[pack.id].mode).toBe(pricingMode);
  });
  it("accepts explicit Manual for the legacy packaging product", async () => {
    const response = await POST(request({ name: "New", sku: "NEW", categoryId: "cat", unit: "pak", price: 31000, costPrice: 19000, pricingMode: "MANUAL", smallestUnitVariant: { unit: "pcs", sku: "NEW-PCS", price: 3000, costPrice: 2000, multiplierFromPackaging: 12 } }));
    expect(response.status).toBe(201); const pack = database.products.find(p => p.sku === "NEW")!;
    expect(money(pack.id)).toEqual([31000, 19000]); expect(config(pack.stockGroupId!).members[pack.id].mode).toBe("MANUAL");
  });
  it.each([{ pricingMode: "MANUAL" }, { priceFactor: { numerator: "9", denominator: "10" } }])("rejects source creation intent %j atomically", async intent => {
    const response = await POST(request({ name: "New", sku: "NEW", categoryId: "cat", unit: "pcs", price: 3000, costPrice: 2000, ...intent }));
    expect(response.status).toBe(422); expect(database.products).toHaveLength(2); expect(database.groups).toHaveLength(1); expect(database.logs).toHaveLength(0);
  });
  it.each([false, true])("chooses the complete new group's base source even when packaging created first=%s", async packagingFirst => {
    database.products.splice(0); database.groups.splice(0);
    const body = packagingFirst ? { unit: "pak", price: 99999, costPrice: 9999, stock: 2, additionalUnitVariants: [{ unit: "pcs", sku: "NEW-PCS", price: 3000, costPrice: 2000, relativeQuantity: 1 / 12 }] } : { unit: "pcs", price: 3000, costPrice: 2000, stock: 24, additionalUnitVariants: [{ unit: "pak", sku: "NEW-PAK", price: 99999, costPrice: 9999, relativeQuantity: 12 }] };
    const response = await POST(request({ name: "New", sku: "NEW", categoryId: "cat", ...body }));
    expect(response.status).toBe(201);
    const source = database.products.find(p => p.unit === "pcs")!; const pack = database.products.find(p => p.unit === "pak")!;
    expect(money(pack.id)).toEqual([99999, 9999]); expect(config(database.groups[0].id).sourceProductId).toBe(source.id);
    expect(config(database.groups[0].id).members[pack.id].mode).toBe("MANUAL");
    expect(config(database.groups[0].id).members[pack.id].factor).toEqual({ numerator: "1", denominator: "1" });
    expect(database.groups[0].baseStock).toBe(24); expect(Number((await response.json()).price)).toBe(packagingFirst ? 99999 : 3000);
    expect(database.logs.filter(l => l.productId === source.id && l.field === "PRICE")).toHaveLength(1);
  });
  it("keeps legacy packaging-first money manual by default", async () => {
    database.products.splice(0); database.groups.splice(0);
    const response = await POST(request({ name: "New", sku: "NEW", categoryId: "cat", unit: "pak", price: 99999, costPrice: 9999, stock: 2, smallestUnitVariant: { unit: "pcs", sku: "NEW-PCS", price: 3000, costPrice: 2000, multiplierFromPackaging: 12 } }));
    expect(response.status).toBe(201); const pack = database.products.find(p => p.unit === "pak")!;
    expect(money(pack.id)).toEqual([99999, 9999]); expect(Number((await response.json()).price)).toBe(99999); expect(database.groups[0].baseStock).toBe(24);
  });
  it.each([undefined, "MANUAL"])("returns effective pack money from rounded smallest-unit source with mode %s", async pricingMode => {
    const response = await POST(request({ name: "New", sku: "NEW", categoryId: "cat", unit: "pak", price: 3.33, costPrice: 2.22, pricingMode, smallestUnitVariant: { unit: "pcs", sku: "NEW-PCS", price: 0.28, costPrice: 0.19, multiplierFromPackaging: 12 } }));
    expect(response.status).toBe(201); const pack = database.products.find(p => p.sku === "NEW")!;
    expect(money(pack.id)).toEqual([3.33, 2.22]);
    expect(Number((await response.json()).price)).toBe(3.33);
  });
  it("joins an existing source in Manual mode without replacing stock", async () => {
    const response = await POST(request({ name: "Snowman", sku: "SN-DUS", categoryId: "cat", unit: "dus", unitMultiplierToBase: 120, price: 1, costPrice: 1, stock: 10 }));
    expect(response.status).toBe(201); const created = database.products.find(p => p.sku === "SN-DUS")!;
    expect(money(created.id)).toEqual([1, 1]); expect(config().members[created.id].mode).toBe("MANUAL"); expect(database.groups[0].baseStock).toBe(24);
  });
  it("synchronizes old and target groups on source movement", async () => {
    database.groups.push({ ...database.groups[0], id: "group-2", groupKey: "other|cat||", displayName: "Other", pricingConfig: null });
    database.products.push({ ...database.products[0], id: "other", stockGroupId: "group-2", name: "Other", sku: "OTHER", price: 5000, costPrice: 4000 });
    expect((await update("pcs", { name: "Other" })).status).toBe(200);
    expect(config().sourceProductId).toBe("pcs"); expect(config().members.pak.review.price).toContain("SOURCE_UNAVAILABLE");
    expect(money("pcs")).toEqual([3000, 2000]); expect(config("group-2").members.pcs.mode).toBe("MANUAL"); expect(config("group-2").sourceProductId).toBe("other");
    expect(database.locks.slice(0, 5)).toEqual(["group:group-1", "group:group-2", "product:other", "product:pak", "product:pcs"]);
  });
  it("creates a stock group with Manual followers and synchronizes its old source group", async () => {
    database.products.push({ ...database.products[0], id: "dus", sku: "DUS", unit: "dus", stockGroupId: null, price: 1, costPrice: 1, unitMultiplierToBase: 120 });
    const response = await createGroup(request({ displayName: "Snowman baru", baseUnit: "pcs", sharedStock: 24, stockInput: { mode: "BASE" }, products: [{ productId: "pcs", unitMultiplierToBase: 1 }, { productId: "dus", unitMultiplierToBase: 120 }] }));
    expect(response.status).toBe(201); const result = await response.json(); expect(money("dus")).toEqual([1, 1]);
    expect(config(result.id).sourceProductId).toBe("pcs"); expect(config().members.pak.review.price).toContain("SOURCE_UNAVAILABLE");
  });
  it("merges into an existing group using its own source and retains old source review", async () => {
    database.groups.push({ ...database.groups[0], id: "group-2", groupKey: "other|cat||", displayName: "Other", pricingConfig: null });
    database.groups[1].baseUnit = "lembar";
    database.products.push({ ...database.products[0], id: "other", stockGroupId: "group-2", unit: "lembar", name: "Other", sku: "OTHER", price: 5000, costPrice: 4000 });
    database.products.push({ ...database.products[1], id: "dus", unit: "dus", sku: "DUS", stockGroupId: null, price: 1, costPrice: 1, unitMultiplierToBase: 120 });
    const response = await appendGroup(request({ sharedStock: 24, stockInput: { mode: "BASE" }, products: [{ productId: "pcs", unitMultiplierToBase: 2 }, { productId: "dus", unitMultiplierToBase: 240 }] }), { params: Promise.resolve({ id: "group-2" }) });
    expect(response.status).toBe(200); expect(money("pcs")).toEqual([3000, 2000]); expect(config("group-2").members.pcs.mode).toBe("MANUAL"); expect(config().sourceProductId).toBe("pcs"); expect(config().members.pak.review.price).toContain("SOURCE_UNAVAILABLE"); expect(money("pak")).toEqual([32400, 21000]);
    expect(database.logs.filter(log => log.productId === "pcs" && log.field === "PRICE")).toEqual([]);
  });
});
