import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@pos/db";
import { initializeGroupPricing } from "@/features/product-stock-groups/automatic-pricing";
import { groupPricingInputFromRow } from "@/features/product-stock-groups/group-pricing-service";

const transaction = vi.hoisted(() => vi.fn());
vi.mock("@pos/db", async (original) => {
  const actual = await original<typeof import("@pos/db")>();
  return { Prisma: actual.Prisma, db: { $transaction: transaction } };
});

import {
  approveGoodsPurchaseItemRecord, finalizeGoodsPurchaseIfReady, removeGoodsPurchaseItemRecord,
} from "../goods-purchases-repository";
import { approveGoodsPurchaseItem, removeGoodsPurchaseItem } from "../../services/goods-purchases-service";
import { finalizeShoppingRequestRecord } from "../../../shopping-requests/repositories/finalize-shopping-request-repository";

const actor = { id: "owner", name: "Pemilik", storeId: "store" };
const now = new Date("2026-10-24T03:00:00Z");
const decimal = (value: string) => new Prisma.Decimal(value);
function fixture() {
  const products = [
    { id: "a-source", storeId: "store", stockGroupId: "group" as string | null, name: "Produk Pcs", sku: "PCS", stock: 0, unit: "pcs", price: "3000", costPrice: "2000" as string | null, unitMultiplierToBase: 1, isActive: true, conversionNeedsReview: false, hargaAgen: "2900", hargaDinas: null },
    { id: "b-pack", storeId: "store", stockGroupId: "group" as string | null, name: "Produk Pak", sku: "PAK", stock: 0, unit: "pak", price: "32400", costPrice: "10000" as string | null, unitMultiplierToBase: 12, isActive: true, conversionNeedsReview: false, hargaAgen: "30000", hargaDinas: null },
  ];
  const line = (id: string, productId: string, updateMasterHpp = true) => ({
    id, goodsPurchaseId: "purchase", shoppingRequestItemId: id, productId,
    productNameSnapshot: productId, skuSnapshot: productId, unitSnapshot: "pcs", unitMultiplierSnapshot: 1,
    quantity: 1, masterCostPriceSnapshot: decimal("2000"), latestUnitPrice: decimal("2100.005"),
    lineTotal: decimal("2100.01"), updateMasterHpp, reviewStatus: "PENDING",
    approvedById: null, approvedByName: null, approvedAt: null, createdAt: now, updatedAt: now,
  });
  const state = {
    groups: [{ id: "group", storeId: "store", baseUnit: "pcs", pricingConfig: null as unknown }],
    products,
    request: { status: "REQUESTED", decision: null as unknown },
    createdPurchase: false,
    purchase: {
      id: "purchase", storeId: "store", number: "PB-202610-001", status: "PENDING", totalAmount: decimal("2100.01"),
      shoppingRequestId: "shopping", supplierId: "supplier", supplierNameSnapshot: "Supplier", createdByName: "Admin",
      approvedByName: null, approvedAt: null, rejectedByName: null, rejectionReason: null, createdAt: now,
      items: [line("line", "a-source")], shoppingRequest: { number: "DPB-1" },
    },
    logs: [] as Array<Record<string, unknown>>, activities: [] as unknown[], expenses: [] as unknown[],
  };
  const events: string[] = [];
  let fail = "";
  let onGroupLock: (() => void) | undefined;
  const tx = {
    $queryRaw: async (sql: TemplateStringsArray, ...values: string[]) => {
      const query = sql.join("");
      if (query.includes("pos_shopping_requests") || query.includes("pos_stores")) {
        events.push(query.includes("pos_stores") ? "lock:store" : "lock:shopping");
        if (query.includes("pos_shopping_requests") && state.request.status !== "REQUESTED") return [];
        return [{ id: values[0] }];
      }
      const table = query.includes("pos_goods_purchases") ? "purchase" : query.includes("pos_product_stock_groups") ? "group" : "product";
      events.push(`lock:${table}:${values[0]}`);
      if (table === "group") onGroupLock?.();
      const row = table === "purchase" ? state.purchase : table === "group" ? state.groups.find(g => g.id === values[0]) : state.products.find(p => p.id === values[0]);
      return row && row.storeId === values[1] && (table !== "purchase" || state.purchase.status === "PENDING") ? [{ id: values[0] }] : [];
    },
    goodsPurchase: {
      count: async () => 0,
      create: async ({ data }: { data: { items: { create: Array<ReturnType<typeof line>> } } }) => {
        Object.assign(state.purchase, data, { items: data.items.create.map((item, index) => ({ ...line(`created-${index}`, item.productId), ...item })) });
        state.createdPurchase = true;
        events.push("purchase:create");
        return { id: "purchase" };
      },
      findFirst: async ({ where }: { where: { storeId: string; status?: string } }) => where.storeId === state.purchase.storeId && (!where.status || state.purchase.status === where.status) ? {
        ...state.purchase, items: state.purchase.items.map(item => ({ ...item, product: { stockGroupId: state.products.find(p => p.id === item.productId)?.stockGroupId ?? null } })),
      } : null,
      updateMany: async () => { events.push("purchase:approve"); state.purchase.status = "APPROVED"; return { count: 1 }; },
      update: async () => ({}),
    },
    goodsPurchaseItem: {
      update: async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(state.purchase.items.find(i => i.id === where.id)!, data),
      delete: async ({ where }: { where: { id: string } }) => { state.purchase.items = state.purchase.items.filter(i => i.id !== where.id); },
    },
    shoppingRequest: {
      findFirst: async () => ({ supplierId: "supplier", supplier: { id: "supplier", name: "Supplier", isActive: true },
        items: [{ id: "requested", productId: "a-source", requestedQty: 1, product: { stockGroupId: "group" } }],
      }),
      updateMany: async () => { state.request.status = "APPROVED"; return { count: 1 }; },
    },
    shoppingRequestItem: { update: async ({ data }: { data: unknown }) => { state.request.decision = data; } },
    productStockGroup: {
      findFirst: async ({ where }: { where: { id: string; storeId: string } }) => {
        const group = state.groups.find(g => g.id === where.id && g.storeId === where.storeId);
        return group ? { ...group, products: state.products.filter(p => p.stockGroupId === group.id).map(p => ({ ...p })) } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: object }) => Object.assign(state.groups.find(g => g.id === where.id)!, data),
    },
    product: {
      findMany: async ({ where }: { where: { id: { in: string[] }; storeId: string } }) => state.products.filter(p => where.id.in.includes(p.id) && p.storeId === where.storeId).map(p => ({ ...p })),
      update: async ({ where, data }: { where: { id: string }; data: { price?: unknown; costPrice?: unknown } }) => {
        events.push(`write:product:${where.id}`);
        if (fail === where.id) throw new Error("follower failed");
        const product = state.products.find(p => p.id === where.id)!;
        if (data.price !== undefined) product.price = String(data.price);
        if (data.costPrice !== undefined) product.costPrice = data.costPrice === null ? null : String(data.costPrice);
        return product;
      },
    },
    productPriceLog: { createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
      if (fail === "log") throw new Error("log failed"); state.logs.push(...data);
    } },
    productStockGroupActivity: { create: async ({ data }: { data: unknown }) => {
      if (fail === "activity") throw new Error("activity failed"); state.activities.push(data);
    } },
    expense: {
      deleteMany: async () => { state.expenses = []; },
      create: async ({ data }: { data: unknown }) => {
        if (fail === "expense") throw new Error("expense failed"); state.expenses.push(data);
      },
    },
  };
  transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
    const before = {
      ...state, groups: structuredClone(state.groups), products: structuredClone(state.products),
      purchase: { ...state.purchase, items: state.purchase.items.map(i => ({ ...i })) },
      request: { ...state.request },
      logs: [...state.logs], activities: [...state.activities], expenses: [...state.expenses],
    };
    try { return await callback(tx); } catch (error) { Object.assign(state, before); throw error; }
  });
  const manual = () => {
    const config = initializeGroupPricing(groupPricingInputFromRow({ ...state.groups[0], products: state.products } as never)).config;
    config.members["b-pack"].mode = "MANUAL";
    state.groups[0].pricingConfig = config;
  };
  return { state, events, tx: tx as unknown as Prisma.TransactionClient, line, manual, setFailure: (value: string) => { fail = value; }, race: (fn: () => void) => { onGroupLock = fn; } };
}

describe("purchase master HPP automatic group pricing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("projects source HPP once with legacy selling factors, half-up money and original snapshots", async () => {
    const f = fixture();
    const result = await approveGoodsPurchaseItemRecord("purchase", "line", actor, now);
    expect(result.finalized).toBe(true);
    expect(f.state.products.map(p => [p.price, p.costPrice])).toEqual([["3000.00", "2100.01"], ["32400.00", "25200.12"]]);
    expect(f.state.logs.map(log => [log.productId, log.field])).toEqual([["a-source", "COST_PRICE"], ["b-pack", "COST_PRICE"]]);
    expect(f.state.logs.every(log => log.source === "SYSTEM")).toBe(true);
    expect(f.state.groups[0].pricingConfig).toMatchObject({ members: { "b-pack": { factor: { numerator: "9", denominator: "10" } } } });
    expect(f.state.purchase.items[0].masterCostPriceSnapshot.toString()).toBe("2000");
    expect(f.state.purchase.items[0].latestUnitPrice.toString()).toBe("2100.005");
    expect(f.state.products.map(p => p.hargaAgen)).toEqual(["2900", "30000"]);
    expect(f.state.activities).toHaveLength(1);
    expect(f.state.expenses).toHaveLength(1);
    await expect(approveGoodsPurchaseItemRecord("purchase", "line", actor, now)).rejects.toMatchObject({ code: "NOT_PENDING" });
    expect(f.state.logs).toHaveLength(2);
    expect(f.state.expenses).toHaveLength(1);
  });

  it("locks the purchase, all sorted groups, then full sorted member union before any product writes", async () => {
    const f = fixture();
    f.state.groups.push({ id: "a-group", storeId: "store", baseUnit: "pcs", pricingConfig: null });
    f.state.products.push({ ...f.state.products[0], id: "z-source", stockGroupId: "a-group" });
    f.state.products[1].isActive = false;
    f.state.purchase.items.push({ ...f.line("second", "z-source"), reviewStatus: "APPROVED" });
    await approveGoodsPurchaseItemRecord("purchase", "line", actor, now);
    expect(f.events.filter(e => e.startsWith("lock:"))).toEqual([
      "lock:purchase:purchase", "lock:purchase:purchase", "lock:group:a-group", "lock:group:group",
      "lock:product:a-source", "lock:product:b-pack", "lock:product:z-source",
    ]);
    expect(f.events.indexOf("lock:product:z-source")).toBeLessThan(f.events.findIndex(e => e.startsWith("write:product:")));
  });

  it("preserves a Manual follower when source HPP changes", async () => {
    const f = fixture(); f.manual();
    await approveGoodsPurchaseItemRecord("purchase", "line", actor, now);
    expect(f.state.products[1].costPrice).toBe("10000.00");
    expect(f.state.products[1].price).toBe("32400.00");
  });

  it("allows an explicit HPP update for a Manual follower", async () => {
    const f = fixture(); f.manual(); f.state.purchase.items[0].productId = "b-pack";
    await approveGoodsPurchaseItemRecord("purchase", "line", actor, now);
    expect(f.state.products[1].costPrice).toBe("2100.01");
    expect(f.state.products[0].costPrice).toBe("2000.00");
  });

  it.each([false, true])("rejects Auto follower independent master HPP, including equal values (%s), and rolls back pending review", async (equal) => {
    const f = fixture(); f.state.purchase.items[0].productId = "b-pack";
    if (equal) f.state.purchase.items[0].latestUnitPrice = decimal("10000");
    await expect(approveGoodsPurchaseItemRecord("purchase", "line", actor, now)).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/acuan.*Manual/) });
    expect(f.state.purchase.status).toBe("PENDING");
    expect(f.state.purchase.items[0].reviewStatus).toBe("PENDING");
    expect(f.state.groups[0].pricingConfig).toBeNull();
    expect(f.state.logs).toEqual([]); expect(f.state.expenses).toEqual([]);
  });

  it("keeps unknown HPP null when no master update is requested", async () => {
    const f = fixture(); f.state.products[0].costPrice = null; f.state.purchase.items[0].updateMasterHpp = false;
    await approveGoodsPurchaseItemRecord("purchase", "line", actor, now);
    expect(f.state.products[0].costPrice).toBeNull();
    expect(f.state.groups[0].pricingConfig).toBeNull();
    expect(f.state.logs).toEqual([]);
  });

  it("keeps ungrouped master updates and their single price log under the same product lock", async () => {
    const f = fixture(); f.state.products[0].stockGroupId = null; f.state.products[0].costPrice = null;
    await approveGoodsPurchaseItemRecord("purchase", "line", actor, now);
    expect(f.state.products[0]).toMatchObject({ price: "3000", costPrice: "2100.01" });
    expect(f.state.products[1].costPrice).toBe("10000");
    expect(f.state.groups[0].pricingConfig).toBeNull();
    expect(f.state.logs).toHaveLength(1); expect(f.state.logs[0]).toMatchObject({ oldValue: null, source: "SYSTEM" });
    expect(f.events.filter(e => e.startsWith("lock:"))).toEqual(["lock:purchase:purchase", "lock:purchase:purchase", "lock:product:a-source"]);
  });

  it("projects an explicit zero HPP from a previously unknown source", async () => {
    const f = fixture(); f.state.products[0].costPrice = null; f.state.purchase.items[0].latestUnitPrice = decimal("0");
    await approveGoodsPurchaseItemRecord("purchase", "line", actor, now);
    expect(f.state.products.map(p => p.costPrice)).toEqual(["0.00", "0.00"]);
    expect(f.state.logs[0]).toMatchObject({ oldValue: null });
  });

  it.each(["b-pack", "log", "activity", "expense"])("rolls back HPP/config/audits, purchase decision and expense after %s failure", async (failure) => {
    const f = fixture(); f.setFailure(failure); f.state.expenses.push({ legacy: true });
    await expect(approveGoodsPurchaseItemRecord("purchase", "line", actor, now)).rejects.toThrow(/failed/);
    expect(f.state.purchase.status).toBe("PENDING"); expect(f.state.purchase.items[0].reviewStatus).toBe("PENDING");
    expect(f.state.products.map(p => p.costPrice)).toEqual(["2000", "10000"]);
    expect(f.state.groups[0].pricingConfig).toBeNull(); expect(f.state.activities).toEqual([]); expect(f.state.logs).toEqual([]);
    expect(f.state.expenses).toEqual([{ legacy: true }]);
  });

  it("rejects products outside the actor store without HPP writes", async () => {
    const f = fixture(); f.state.products[0].storeId = "other";
    await expect(approveGoodsPurchaseItemRecord("purchase", "line", actor, now)).rejects.toMatchObject({ code: "PRODUCT_NOT_FOUND" });
    expect(f.state.purchase.status).toBe("PENDING"); expect(f.events.some(e => e.startsWith("write:product:"))).toBe(false);
  });

  it("conflicts if a selected product moves to an unplanned group while acquiring locks", async () => {
    const f = fixture(); f.race(() => { f.state.products[0].stockGroupId = "unplanned"; });
    await expect(approveGoodsPurchaseItemRecord("purchase", "line", actor, now)).rejects.toMatchObject({ code: "STALE_STOCK_RELATION" });
    expect(f.events).not.toContain("lock:group:unplanned");
    expect(f.events.some(e => e.startsWith("write:product:"))).toBe(false);
    expect(f.state.purchase.status).toBe("PENDING");
  });

  it("uses the same projection when removing the last pending line", async () => {
    const f = fixture(); f.state.purchase.items[0].reviewStatus = "APPROVED";
    f.state.purchase.items.push(f.line("remove", "b-pack", false));
    await removeGoodsPurchaseItemRecord("purchase", "remove", actor, now);
    expect(f.state.products[1].costPrice).toBe("25200.12"); expect(f.state.expenses).toHaveLength(1);
  });

  it("maps a locked membership conflict through the real purchase service", async () => {
    const f = fixture(); f.race(() => { f.state.products[0].stockGroupId = "unplanned"; });
    await expect(approveGoodsPurchaseItem("purchase", "line", actor)).rejects.toMatchObject({
      name: "GoodsPurchaseValidationError", isConflict: true, message: expect.stringMatching(/Muat ulang/),
    });
    expect(f.state.purchase.items[0].reviewStatus).toBe("PENDING");
  });

  it.each(["approve", "remove"])("propagates friendly validation through the real %s service and restores the pending decision", async (action) => {
    const f = fixture(); f.state.purchase.items[0].productId = "b-pack";
    if (action === "remove") {
      f.state.purchase.items[0].reviewStatus = "APPROVED";
      f.state.purchase.items.push(f.line("remove", "a-source", false));
    }
    const result = action === "approve" ? approveGoodsPurchaseItem("purchase", "line", actor) : removeGoodsPurchaseItem("purchase", "remove", actor);
    await expect(result).rejects.toMatchObject({ name: "GoodsPurchaseValidationError", isConflict: false, message: expect.stringMatching(/acuan.*Manual/) });
    expect(f.state.purchase.status).toBe("PENDING"); expect(f.state.expenses).toEqual([]);
    expect(f.state.purchase.items).toHaveLength(action === "remove" ? 2 : 1);
  });

  it("uses the supplied transaction for direct finalization", async () => {
    const f = fixture(); f.state.purchase.items[0].reviewStatus = "APPROVED";
    await finalizeGoodsPurchaseIfReady(f.tx, "purchase", actor, now);
    expect(transaction).not.toHaveBeenCalled(); expect(f.state.products[1].costPrice).toBe("25200.12");
  });

  it("records an equal-HPP Auto supplier snapshot once without a master pricing mutation", async () => {
    const f = fixture();
    const initialized = initializeGroupPricing(groupPricingInputFromRow({ ...f.state.groups[0], products: f.state.products } as never));
    f.state.groups[0].pricingConfig = initialized.config;
    for (const member of initialized.members) {
      Object.assign(f.state.products.find(product => product.id === member.productId)!, {
        price: member.price, costPrice: member.costPrice,
      });
    }
    expect(f.state.products[1].costPrice).toBe("24000.00");
    expect(initialized.config.members["b-pack"].mode).toBe("AUTO");
    const beforeProducts = structuredClone(f.state.products);
    const beforeConfig = structuredClone(initialized.config);
    const input = {
      items: [{ shoppingRequestItemId: "requested", productId: "b-pack", approvedQty: 1, latestUnitPrice: 24000, updateMasterHpp: true }],
      extraItems: [],
    };

    await expect(finalizeShoppingRequestRecord("shopping", input, actor, now)).resolves.toEqual({
      shoppingRequestId: "shopping", goodsPurchaseId: "purchase",
    });
    expect(f.state.purchase.status).toBe("APPROVED");
    expect(f.state.request.status).toBe("APPROVED");
    const recorded = f.state.purchase.items[0];
    expect(recorded).toMatchObject({ productId: "b-pack", updateMasterHpp: false, reviewStatus: "APPROVED", unitSnapshot: "pak", unitMultiplierSnapshot: 12 });
    expect(recorded.masterCostPriceSnapshot.toString()).toBe("24000.00");
    expect(recorded.latestUnitPrice.toString()).toBe("24000");
    expect(f.state.request.decision).toMatchObject({ costPriceSnapshot: decimal("24000") });
    expect(f.state.expenses).toHaveLength(1);
    expect(f.state.expenses[0]).toMatchObject({ amount: decimal("24000") });
    expect(f.state.products).toEqual(beforeProducts);
    expect(f.state.groups[0].pricingConfig).toEqual(beforeConfig);
    expect(f.state.logs).toEqual([]); expect(f.state.activities).toEqual([]);
    expect(f.events.filter(event => event.startsWith("write:product:") || event.startsWith("lock:group:") || event.startsWith("lock:product:"))).toEqual([]);

    await expect(finalizeShoppingRequestRecord("shopping", input, actor, now)).rejects.toMatchObject({ name: "FinalApprovalError", status: 409 });
    expect(f.events.filter(event => event === "purchase:create")).toHaveLength(1);
    expect(f.state.expenses).toHaveLength(1);
    expect(f.state.products).toEqual(beforeProducts);
    expect(f.state.groups[0].pricingConfig).toEqual(beforeConfig);
    expect(f.state.logs).toEqual([]); expect(f.state.activities).toEqual([]);
  });

  it.each(["source", "auto", "log"])("keeps real shopping-request finalization atomic for %s with header-before-pricing locks", async (scenario) => {
    const f = fixture();
    if (scenario === "log") f.setFailure("log");
    const productId = scenario === "auto" ? "b-pack" : "a-source";
    const result = finalizeShoppingRequestRecord("shopping", {
      items: [{ shoppingRequestItemId: "requested", productId, approvedQty: 1, latestUnitPrice: 2100.005, updateMasterHpp: true }],
      extraItems: [],
    }, actor, now);
    if (scenario === "source") {
      await expect(result).resolves.toMatchObject({ goodsPurchaseId: "purchase" });
      expect(f.state.createdPurchase).toBe(true);
      expect(f.state.products[1].costPrice).toBe("25200.12");
      expect(f.state.request.status).toBe("APPROVED"); expect(f.state.expenses).toHaveLength(1);
      const locks = f.events.filter(e => e.startsWith("lock:"));
      expect(locks).toEqual(["lock:shopping", "lock:store", "lock:purchase:purchase", "lock:group:group", "lock:product:a-source", "lock:product:b-pack"]);
      expect(f.events.indexOf("lock:product:b-pack")).toBeLessThan(f.events.findIndex(e => e.startsWith("write:product:")));
    } else {
      if (scenario === "auto") await expect(result).rejects.toMatchObject({ name: "FinalApprovalError", status: 422, message: expect.stringMatching(/acuan.*Manual/) });
      else await expect(result).rejects.toThrow("log failed");
      expect(f.state.request).toEqual({ status: "REQUESTED", decision: null });
      expect(f.state.createdPurchase).toBe(false);
      expect(f.state.purchase.status).toBe("PENDING"); expect(f.state.expenses).toEqual([]);
      expect(f.state.logs).toEqual([]); expect(f.state.groups[0].pricingConfig).toBeNull();
    }
  });
});
