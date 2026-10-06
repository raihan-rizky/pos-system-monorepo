import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, mkdtempSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { parseEnv } from "node:util";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import type { PrismaClient, Prisma } from "@pos/db";

// Explicit opt-in: every run creates its own schema on the authorized dev DB.
const enabled = process.env.POS_REVIEW_INTEGRATION === "1";
const runtime = vi.hoisted(() => ({ client: null as any, user: null as any, hook: null as any, started: null as any }));
vi.mock("@pos/db", async () => {
  const actual = await vi.importActual<typeof import("@pos/db")>("@pos/db");
  const db = new Proxy({}, { get(_target, key) {
    if (key === "$transaction") return (callback: any, options?: any) => runtime.client.$transaction(async (tx: any) => {
      runtime.started?.();
      const hook = runtime.hook;
      runtime.hook = null;
      const wrapped = hook ? new Proxy(tx, { get(target, property) {
        if (property === "customer") return new Proxy(target.customer, { get(delegate, operation) {
          const original = delegate[operation];
          return typeof original === "function" ? async (...args: any[]) => { const result = await original.apply(delegate, args); if (operation === "update" || operation === "updateMany") await hook(); return result; } : original;
        } });
        if (property === "$queryRawUnsafe") return async (...args: any[]) => { const result = await target.$queryRawUnsafe(...args); if (String(args[0]).includes("pos_customers")) await hook(); return result; };
        const value = target[property];
        return typeof value === "function" ? value.bind(target) : value;
      } }) : tx;
      return callback(wrapped);
    // Barriers intentionally pause a transaction while the other connection
    // enters. Test timeouts must cover that pause; route budgets have unit tests.
    }, { ...options, maxWait: 10000, timeout: 60000 });
    const value = runtime.client?.[key];
    return typeof value === "function" ? value.bind(runtime.client) : value;
  } });
  return { ...actual, db };
});
vi.mock("@/lib/rbac/guard", () => ({ requirePermission: async () => runtime.user, requireRole: async () => runtime.user, handleAuthError: () => null }));
vi.mock("@/features/rbac/helpers/rbac-server", () => ({ getGlobalRolePermissions: async () => ({}) }));
vi.mock("@/features/invoice-date/services/internet-clock", () => ({ getInvoiceNow: async () => new Date("2026-10-06T03:00:00Z") }));

function latch() { let release!: () => void; const promise = new Promise<void>((done) => { release = done; }); return { promise, release }; }
function request(body: unknown) { return new Request("http://localhost/api/review", { method: "POST", body: JSON.stringify(body) }); }

describe.skipIf(!enabled)("real PostgreSQL lifecycle races", () => {
  let admin: PrismaClient;
  let client: PrismaClient;
  let competing: PrismaClient;
  let reverse: typeof import("../transaction-reversal-service").reverseTransaction;
  let approve: typeof import("@/app/api/transactions/[id]/approve/route").POST;
  let payInvoice: typeof import("@/app/api/transactions/[id]/pay-debt/route").POST;
  let payCustomer: typeof import("@/app/api/customers/[id]/pay-debt/route").POST;
  const schema = `pos_review_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const storeId = "review-store";
  const customerId = "review-customer";
  const actor = { id: "review-owner", name: "Owner Uji", role: "OWNER" };

  beforeAll(async () => {
    const repo = resolve(process.cwd(), "../..");
    const env = parseEnv(readFileSync(resolve(repo, "packages/db/.env.development"), "utf8"));
    const devUrl = env.DIRECT_URL || env.DATABASE_URL;
    if (!devUrl) throw new Error("Development database URL is missing");
    const url = new URL(devUrl);
    const { PrismaClient: Client } = await vi.importActual<typeof import("@pos/db")>("@pos/db");
    admin = new Client({ datasources: { db: { url: url.toString() } } });
    if (!/^pos_review_test_[a-z0-9_]+$/.test(schema)) throw new Error("Invalid fixture schema");
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("schema", schema);
    const fixtureUrl = url.toString();
    const require = createRequire(resolve(repo, "packages/db/package.json"));
    // Prisma's single-schema search path hides an existing pg_trgm extension.
    // Adapt only the temporary migration copies; project migrations stay intact.
    const migrationsRoot = mkdtempSync(resolve(tmpdir(), "pos-review-migrations-"));
    try {
      const sourceMigrations = resolve(repo, "packages/db/prisma/migrations");
      const scripts: string[] = [];
      for (const entry of readdirSync(sourceMigrations, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (!entry.isDirectory()) continue;
        scripts.push(readFileSync(resolve(sourceMigrations, entry.name, "migration.sql"), "utf8")
          .replace(/WHERE typname = 'InventoryLogStatus'/g, "WHERE typname = 'InventoryLogStatus' AND typnamespace = current_schema()::regnamespace"));
      }
      // This fixture needs the schema, not migration bookkeeping. Applying the
      // ordered SQL in one batch avoids a network round-trip per migration.
      const sqlPath = resolve(migrationsRoot, "fixture.sql");
      writeFileSync(sqlPath, `SET search_path TO "${schema}", public, extensions;\nBEGIN;\n${scripts.join("\nCOMMIT;\nBEGIN;\n")}\nCOMMIT;`);
      execFileSync(process.execPath, [require.resolve("prisma/build/index.js"), "db", "execute", "--file", sqlPath, "--schema", resolve(repo, "packages/db/prisma/schema.prisma")], {
        cwd: migrationsRoot, env: { ...process.env, DATABASE_URL: fixtureUrl, DIRECT_URL: fixtureUrl }, timeout: 120000, stdio: "pipe",
      });
    } finally {
      const checked = resolve(migrationsRoot);
      if (!checked.startsWith(resolve(tmpdir(), "pos-review-migrations-"))) throw new Error("Unsafe fixture cleanup path");
      rmSync(checked, { recursive: true, force: true });
    }
    client = new Client({ datasources: { db: { url: fixtureUrl } } });
    competing = new Client({ datasources: { db: { url: fixtureUrl } } });
    await competing.$connect();
    runtime.client = client;
    runtime.user = { ...actor, storeId };
    reverse = (await import("../transaction-reversal-service")).reverseTransaction;
    approve = (await import("@/app/api/transactions/[id]/approve/route")).POST;
    payInvoice = (await import("@/app/api/transactions/[id]/pay-debt/route")).POST;
    payCustomer = (await import("@/app/api/customers/[id]/pay-debt/route")).POST;
    await client.store.create({ data: { id: storeId, name: "Fixture review" } });
    await client.user.create({ data: { ...actor, role: "OWNER", username: "review-owner", storeId } });
    await client.category.create({ data: { id: "review-category", name: "Fixture review" } });
    await client.customer.create({ data: { id: customerId, name: "Pelanggan Uji", storeId } });
    await client.product.create({ data: { id: "review-product", sku: "REVIEW", name: "Produk Uji", categoryId: "review-category", storeId, price: 100, costPrice: 40, stock: 10 } });
  }, 180000);

  afterAll(async () => {
    await client?.$disconnect();
    await competing?.$disconnect();
    if (admin && /^pos_review_test_[a-z0-9_]+$/.test(schema)) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.$disconnect();
  }, 60000);

  beforeEach(async () => {
    runtime.hook = null; runtime.started = null;
    await client.transactionLifecycleAudit.deleteMany();
    await client.inventoryLog.deleteMany();
    await client.debtPaymentLog.deleteMany();
    await client.transactionPayment.deleteMany();
    await client.transactionItem.deleteMany();
    await client.transaction.deleteMany();
    await client.customer.update({ where: { id: customerId }, data: { totalOrders: 0, totalSpent: 0, totalDebt: 0 } });
    await client.product.update({ where: { id: "review-product" }, data: { stock: 10 } });
  });

  async function fixture(active = false) {
    await client.transaction.create({ data: {
      id: "review-invoice", invoiceNumber: "INV-REVIEW-1", storeId, customerId, subtotal: 100, total: 100,
      paymentMethod: "TEMPO", amountPaid: 0, status: active ? "COMPLETED" : "PENDING_APPROVAL",
      requestedById: actor.id, cashierId: active ? actor.id : null,
      items: { create: { productId: "review-product", productName: "Produk Uji", quantity: 1, unitPrice: 100, unitCost: 40, subtotal: 100 } },
    } });
    if (active) {
      await client.customer.update({ where: { id: customerId }, data: { totalOrders: 1, totalDebt: 100 } });
      await client.product.update({ where: { id: "review-product" }, data: { stock: 9 } });
      await client.inventoryLog.create({ data: { productId: "review-product", type: "OUT", reason: "SALE", quantity: 1, createdBy: actor.id, transactionId: "review-invoice", sourceTransactionRef: "review-invoice", stockBaseDelta: -1, unitMultiplierSnapshot: 1, stockGroupIdSnapshot: null } });
    }
  }
  function reversal(tx: Prisma.TransactionClient, action: "VOID" | "DELETE") { return reverse(tx, { storeId, transactionId: "review-invoice", actor, action }); }
  async function balances() { const [customer, product] = await Promise.all([client.customer.findUniqueOrThrow({ where: { id: customerId } }), client.product.findUniqueOrThrow({ where: { id: "review-product" } })]); return { orders: customer.totalOrders, spent: Number(customer.totalSpent), debt: Number(customer.totalDebt), stock: product.stock }; }

  it("approval then simultaneous void commits the journal and reverses all balances", async () => {
    await fixture();
    const locked = latch(); const release = latch(); const entered = latch();
    runtime.hook = async () => { locked.release(); await release.promise; };
    const approving = approve(request({ paymentMethod: "TEMPO", amountPaid: 0 }), { params: Promise.resolve({ id: "review-invoice" }) });
    await locked.promise;
    const voiding = competing.$transaction(async (tx) => { entered.release(); return reversal(tx, "VOID"); }, { timeout: 60000 });
    await entered.promise; release.release();
    expect((await approving).status).toBe(200);
    expect(await voiding).toBe("APPLIED");
    expect(await balances()).toEqual({ orders: 0, spent: 0, debt: 0, stock: 10 });
  }, 60000);

  it("void and delete overlap without restoring stock twice", async () => {
    await fixture(true);
    const locked = latch(); const release = latch(); const entered = latch();
    const voiding = competing.$transaction(async (tx) => { await reversal(tx, "VOID"); locked.release(); await release.promise; }, { timeout: 60000 });
    await locked.promise;
    const deleting = client.$transaction(async (tx) => { entered.release(); return reversal(tx, "DELETE"); }, { timeout: 60000 });
    await entered.promise; release.release(); await voiding;
    expect(await deleting).toBe("APPLIED");
    expect(await balances()).toEqual({ orders: 0, spent: 0, debt: 0, stock: 10 });
    expect(await client.transaction.count()).toBe(0);
  }, 60000);

  it("invoice payment and void overlap without leaving debt or spent behind", async () => {
    await fixture(true);
    const locked = latch(); const release = latch(); const entered = latch();
    runtime.hook = async () => { locked.release(); await release.promise; };
    const paying = payInvoice(request({ amount: 75, paymentMethod: "CASH" }), { params: Promise.resolve({ id: "review-invoice" }) });
    await locked.promise;
    const voiding = competing.$transaction(async (tx) => { entered.release(); return reversal(tx, "VOID"); }, { timeout: 60000 });
    await entered.promise; release.release();
    expect((await paying).status).toBe(200); expect(await voiding).toBe("APPLIED");
    expect(await balances()).toEqual({ orders: 0, spent: 0, debt: 0, stock: 10 });
  }, 60000);

  it("bulk customer allocation and invoice payment serialize and reject overpayment", async () => {
    await fixture(true);
    const locked = latch(); const release = latch(); const entered = latch();
    runtime.hook = async () => { locked.release(); await release.promise; };
    const bulk = payCustomer(request({ amount: 75, paymentMethod: "CASH" }), { params: Promise.resolve({ id: customerId }) });
    await locked.promise;
    runtime.started = () => entered.release();
    const single = payInvoice(request({ amount: 75, paymentMethod: "CASH" }), { params: Promise.resolve({ id: "review-invoice" }) });
    await entered.promise; release.release();
    expect((await bulk).status).toBe(200); expect((await single).status).toBe(409);
    expect(await balances()).toEqual({ orders: 1, spent: 75, debt: 25, stock: 9 });
    expect(await client.debtPaymentLog.count()).toBe(1);
  }, 60000);
});
