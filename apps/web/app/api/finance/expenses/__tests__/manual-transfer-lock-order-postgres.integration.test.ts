import { randomUUID } from "node:crypto";
import { PrismaClient } from "@pos/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({ db: null as PrismaClient | null, actor: { id: "owner", storeId: "store-1", role: "OWNER" as "OWNER" | "ADMIN" }, error: null as unknown }));
vi.mock("@pos/db", async original => ({ ...await original<object>(), get db() { return runtime.db; } }));
vi.mock("@/lib/rbac/guard", async original => ({
  ...await original<object>(), requireRole: async () => runtime.actor, requirePermission: async () => runtime.actor,
  canAuthenticatedUserAccessPage: async () => true, canAuthenticatedUserPerform: async () => true,
}));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: (_message: string, error: unknown) => { runtime.error = error; }, info: vi.fn() }) }));

import { POST } from "../route";
import { DELETE, PATCH } from "../[id]/route";
import { DELETE as deleteAttachment } from "../[id]/attachment/route";
import { POST as linkManual } from "../../giro/[goodsPurchaseId]/link-manual/route";
import { authorizeInTransaction } from "@/lib/rbac/guard";

const connection = process.env.GIRO_TEST_DATABASE_URL;
const schema = `transfer_locks_${randomUUID().replaceAll("-", "")}`;
const key = "2d82db0d-647a-4e65-9bd1-ec8a66bb2c02";
const payload = {
  applicantName: "Pemasok", description: "Kertas", amount: 100, occurredAt: "2026-11-02",
  updatedAt: "2026-11-01T00:00:00.000Z", reportCategory: "ATK", manualPurchasePaymentMethod: "TRANSFER",
  allocations: [{ payableId: "debt-1", paymentId: "payment-1", amount: 100 }],
};

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe.skipIf(!connection)("urutan lock transfer, pembayaran, dan RBAC pada PostgreSQL", () => {
  let admin: PrismaClient, client: PrismaClient, payment: PrismaClient, permissionWriter: PrismaClient, routeDb: PrismaClient;
  let clientPid: number, writerPid: number, linkPid: number;

  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== "127.0.0.1" || url.port !== "15443" || url.pathname !== "/postgres" || url.searchParams.has("schema")) throw new Error("Database uji terisolasi diperlukan.");
    admin = new PrismaClient({ datasourceUrl: connection });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("schema", schema);
    url.searchParams.set("connection_limit", "1");
    client = new PrismaClient({ datasourceUrl: url.toString() });
    url.searchParams.set("connection_limit", "3");
    routeDb = new PrismaClient({ datasourceUrl: url.toString() });
    url.searchParams.set("connection_limit", "1");
    payment = new PrismaClient({ datasourceUrl: url.toString() });
    permissionWriter = new PrismaClient({ datasourceUrl: url.toString() });
    runtime.db = client;
    const statements = [
      `CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'CASHIER', 'SALES', 'INVENTORY')`,
      `CREATE TYPE "ExpenseCategory" AS ENUM ('SUPPLIES')`,
      `CREATE TYPE "ManualExpenseReportCategory" AS ENUM ('ATK')`,
      `CREATE TABLE "pos_users" ("id" TEXT PRIMARY KEY, "storeId" TEXT, "role" "Role" NOT NULL, "isActive" BOOLEAN NOT NULL)`,
      `CREATE TABLE "pos_role_permissions" ("id" TEXT PRIMARY KEY, "role" "Role" NOT NULL, "scope" TEXT NOT NULL, "target" TEXT NOT NULL, "action" TEXT NOT NULL, "allowed" BOOLEAN NOT NULL)`,
      `CREATE TABLE "pos_expenses" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "recordedById" TEXT NOT NULL, "applicantName" TEXT NOT NULL, "category" "ExpenseCategory" NOT NULL, "customCategoryId" TEXT, "manualPurchasePaymentMethod" TEXT, "manualTransferFingerprint" TEXT, "manualTransferProofDeleteKey" TEXT, "manualTransferProofDeleteExpectedVersion" TIMESTAMP, "manualTransferProofDeleteVersion" TIMESTAMP, "reportCategory" "ManualExpenseReportCategory", "description" TEXT, "amount" NUMERIC(12,2) NOT NULL, "changeAmount" NUMERIC(12,2) NOT NULL DEFAULT 0, "occurredAt" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "transactionId" TEXT, "shoppingRequestId" TEXT, "goodsPurchaseId" TEXT, "backdatedPurchaseDueId" TEXT, "backdatedPurchasePaymentId" TEXT, "attachmentUrl" TEXT, "hasMissingCostSnapshot" BOOLEAN NOT NULL DEFAULT false, "deletedAt" TIMESTAMP, UNIQUE ("id", "storeId"))`,
      `CREATE TABLE "pos_manual_transfer_attempts" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "userId" TEXT NOT NULL, "body" TEXT NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "completedAt" TIMESTAMP)`,
      `CREATE TABLE "pos_supplier_payables" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "amount" NUMERIC(12,2) NOT NULL, "debtDate" DATE NOT NULL, "dueDate" DATE, "reportCategory" "ManualExpenseReportCategory", "goodsPurchaseId" TEXT)`,
      `CREATE TABLE "pos_supplier_payable_payments" ("id" TEXT PRIMARY KEY, "payableId" TEXT NOT NULL, "amount" NUMERIC(12,2) NOT NULL, "paidAt" DATE NOT NULL, "origin" TEXT NOT NULL)`,
      `CREATE TABLE "pos_goods_purchases" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "supplierNameSnapshot" TEXT NOT NULL, "totalAmount" NUMERIC(12,2) NOT NULL, "shoppingRequestId" TEXT, "paymentDueDate" DATE, "status" TEXT NOT NULL, "paymentMethod" TEXT, "statusBeforeCancellation" TEXT)`,
      `CREATE TABLE "pos_goods_purchase_payments" ("id" TEXT PRIMARY KEY, "goodsPurchaseId" TEXT NOT NULL, "method" TEXT NOT NULL, "amount" NUMERIC(12,2) NOT NULL, "dueDate" DATE, "note" TEXT)`,
      `CREATE TABLE "pos_supplier_payable_manual_links" ("manualPayableId" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "goodsPurchaseId" TEXT NOT NULL, "giroPayableId" TEXT NOT NULL, "requestPayload" JSONB NOT NULL)`,
      `CREATE TABLE "pos_manual_transfer_allocations" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "expenseId" TEXT NOT NULL, "payableId" TEXT NOT NULL, "paymentId" TEXT NOT NULL UNIQUE, "amount" NUMERIC(12,2) NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now())`,
      `INSERT INTO "pos_users" VALUES ('owner', 'store-1', 'OWNER', true)`,
      `INSERT INTO "pos_role_permissions" VALUES ('unrelated', 'ADMIN', 'resource', 'inventory', 'read', true)`,
    ];
    for (const sql of statements) await client.$executeRawUnsafe(sql);
    await client.$executeRawUnsafe('ALTER TABLE "pos_supplier_payables" ADD COLUMN "supplierName" TEXT NOT NULL DEFAULT \'Pemasok\', ADD COLUMN "note" TEXT, ADD COLUMN "giroHistoryVerifiedAt" TIMESTAMPTZ');
    clientPid = (await client.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
    writerPid = (await permissionWriter.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0].pid;
  }, 30_000);

  beforeEach(async () => {
    runtime.error = null;
    linkPid = 0;
    runtime.actor.role = "OWNER";
    await client.$executeRawUnsafe('TRUNCATE "pos_supplier_payable_manual_links", "pos_goods_purchase_payments", "pos_goods_purchases", "pos_manual_transfer_allocations", "pos_supplier_payable_payments", "pos_supplier_payables", "pos_manual_transfer_attempts", "pos_expenses"');
    await client.$executeRawUnsafe(`DELETE FROM "pos_role_permissions" WHERE "id" <> 'unrelated'`);
    await client.$executeRawUnsafe(`UPDATE "pos_users" SET "role" = 'OWNER', "isActive" = true WHERE "id" = 'owner'`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_supplier_payables" ("id", "storeId", "amount", "debtDate", "dueDate", "reportCategory", "goodsPurchaseId") VALUES ('debt-1', 'store-1', 1000, '2026-11-01', NULL, 'ATK', NULL)`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_supplier_payable_payments" VALUES ('payment-1', 'debt-1', 100, '2026-11-02', 'MANUAL')`);
  });

  afterAll(async () => {
    await Promise.all([client?.$disconnect(), routeDb?.$disconnect(), payment?.$disconnect(), permissionWriter?.$disconnect()]);
    if (admin) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.$disconnect();
    runtime.db = null;
  });

  async function waiting(pid: number) {
    return (await admin.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE pid = ${pid} AND wait_event_type = 'Lock') AS waiting`)[0].waiting;
  }
  async function waitUntil(predicate: () => Promise<boolean>) {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      if (await predicate()) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("Transaksi tidak mencapai lock yang diharapkan.");
  }

  it.each(["POST", "PATCH", "PATCH-lepas"])("%s tidak deadlock dengan pembayaran dan perubahan izin", async method => {
    const body = method === "PATCH-lepas" ? { ...payload, allocations: [] } : payload;
    if (method === "POST") {
      await client.$executeRaw`INSERT INTO "pos_manual_transfer_attempts" ("id", "storeId", "userId", "body") VALUES (${key}, 'store-1', 'owner', ${JSON.stringify(body)})`;
    } else {
      await client.$executeRawUnsafe(`INSERT INTO "pos_expenses" ("id", "storeId", "recordedById", "applicantName", "category", "manualPurchasePaymentMethod", "reportCategory", "description", "amount", "occurredAt", "updatedAt") VALUES ('expense-1', 'store-1', 'owner', 'Pemasok', 'SUPPLIES', 'TRANSFER', 'ATK', 'Kertas', 100, '2026-11-01 17:00:00', '2026-11-01')`);
      if (method === "PATCH-lepas") await client.$executeRawUnsafe(`INSERT INTO "pos_manual_transfer_allocations" ("id", "storeId", "expenseId", "payableId", "paymentId", "amount", "createdById") VALUES ('allocation-1', 'store-1', 'expense-1', 'debt-1', 'payment-1', 100, 'owner')`);
    }
    const locked = signal(), release = signal();
    const pay = payment.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "pos_supplier_payables" WHERE "id" = 'debt-1' FOR UPDATE`;
      locked.resolve();
      await release.promise;
      return authorizeInTransaction(tx, runtime.actor, { resources: [{ resource: "expense.payable", action: "update" }] });
    }, { isolationLevel: "ReadCommitted", timeout: 10_000 }).then(value => ({ value }), error => ({ error }));
    await locked.promise;
    const req = new Request("http://localhost/api", { method: method === "POST" ? "POST" : "PATCH", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body) });
    let transferResponse: Response | undefined;
    const transfer = (method === "POST" ? POST(req) : PATCH(req, { params: Promise.resolve({ id: "expense-1" }) })).then(value => { transferResponse = value; return { value }; }, error => ({ error }));
    let writerFinished = false;
    let writerFinishedBeforePayment = false;
    let writer: Promise<unknown> = Promise.resolve();
    try {
      await waitUntil(async () => !!transferResponse || await waiting(clientPid));
      if (transferResponse) throw new Error(`Transfer berhenti sebelum lock: ${transferResponse.status} ${await transferResponse.text()} ${String(runtime.error)}`);
      writer = permissionWriter.$executeRaw`UPDATE "pos_role_permissions" SET "allowed" = NOT "allowed" WHERE "id" = 'unrelated'`.then(() => { writerFinished = true; });
      await waitUntil(async () => writerFinished || await waiting(writerPid));
      writerFinishedBeforePayment = writerFinished;
    } finally { release.resolve(); }
    const [paymentResult, result] = await Promise.all([pay, transfer]);
    await writer;
    expect(writerFinishedBeforePayment).toBe(true);
    expect(paymentResult).toEqual({ value: true });
    expect("value" in result && result.value.status).toBe(method === "POST" ? 201 : 200);
    expect(await client.manualTransferAllocation.count({ where: { payableId: "debt-1", paymentId: "payment-1" } })).toBe(method === "PATCH-lepas" ? 0 : 1);
    if (method === "POST") {
      const retry = new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(payload) });
      expect((await POST(retry)).status).toBe(200);
      expect(await client.manualTransferAllocation.count({ where: { payableId: "debt-1", paymentId: "payment-1" } })).toBe(1);
    }
  }, 20_000);

  it.each(["POST", "PATCH"])("%s tidak membentuk siklus kunci dengan route penautan giro", async method => {
    if (method === "POST") {
      await client.$executeRaw`INSERT INTO "pos_manual_transfer_attempts" ("id", "storeId", "userId", "body") VALUES (${key}, 'store-1', 'owner', ${JSON.stringify(payload)})`;
    } else {
      await client.$executeRawUnsafe(`INSERT INTO "pos_expenses" ("id", "storeId", "recordedById", "applicantName", "category", "manualPurchasePaymentMethod", "reportCategory", "description", "amount", "occurredAt", "updatedAt") VALUES ('expense-1', 'store-1', 'owner', 'Pemasok', 'SUPPLIES', 'TRANSFER', 'ATK', 'Kertas', 100, '2026-11-01 17:00:00', '2026-11-01')`);
    }
    await client.$executeRawUnsafe(`INSERT INTO "pos_goods_purchases" ("id", "storeId", "supplierNameSnapshot", "totalAmount", "shoppingRequestId", "paymentDueDate", "status", "paymentMethod") VALUES ('purchase-1', 'store-1', 'Pemasok', 1000, 'shopping-1', '2026-11-20', 'APPROVED', 'GIRO')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_supplier_payables" ("id", "storeId", "amount", "debtDate", "dueDate", "reportCategory", "goodsPurchaseId", "giroHistoryVerifiedAt") VALUES ('giro-1', 'store-1', 1000, '2026-11-01', '2026-11-20', 'ATK', 'purchase-1', now())`);
    const acquired = signal(), release = signal();
    let transferPid = 0;
    let intercepted = false;
    const queryDb = routeDb.$extends({ query: { expense: {
      async $allOperations({ operation, args, query }) {
        if (!intercepted && operation === (method === "POST" ? "create" : "update")) {
          intercepted = true;
          acquired.resolve();
          await release.promise;
        }
        return query(args);
      },
    } } });
    const transactionDb = new Proxy(routeDb, {
      get(target, property) {
        if (property === "$transaction") return async (callback: (tx: unknown) => Promise<unknown>, options: unknown) =>
          queryDb.$transaction(async tx => {
            const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
            if (!transferPid) transferPid = row.pid; else linkPid = row.pid;
            return callback(tx);
          }, options as never);
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    runtime.db = transactionDb;
    const req = new Request("http://localhost/api", { method, headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(payload) });
    let transferResponse: Response | undefined;
    const transfer = (method === "POST" ? POST(req) : PATCH(req, { params: Promise.resolve({ id: "expense-1" }) })).then(value => { transferResponse = value; return value; });
    let linker: Promise<Response> | undefined;
    let failure: unknown;
    let blockedByTransferTableLock = false;
    try {
      await Promise.race([acquired.promise, transfer.then(response => { throw new Error(`Transfer berhenti sebelum lock: ${response.status} ${String(runtime.error)}`); })]);
      const locked = await admin.$queryRaw<{ blocked: number[] }[]>`SELECT pg_blocking_pids(${transferPid}::int) AS blocked`;
      expect(locked[0].blocked).toEqual([]);
      const probe = payment.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '300ms'`;
        await tx.$queryRaw`SELECT "id" FROM "pos_supplier_payables" WHERE "id" = 'debt-1' FOR UPDATE`;
      }).then(() => false, () => true);
      expect(await probe).toBe(true);
      const body = {
        payableId: "debt-1", expectedGiroPayableId: "giro-1", historiesConfirmed: true,
        expectedGiro: { amount: 1000, debtDate: null, payableDebtDate: "2026-11-01", dueDate: "2026-11-20", supplierName: "Pemasok", payableNote: null },
        expectedManual: { amount: 1000, debtDate: "2026-11-01", dueDate: null, supplierName: "Pemasok", note: null },
        expectedGiroPayments: [], expectedManualPayments: [], duplicatePayments: [], matchingPaymentsConfirmedDistinct: false,
      };
      linker = linkManual(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ goodsPurchaseId: "purchase-1" }) });
      await waitUntil(async () => !!linkPid && await waiting(linkPid));
      const locks = await admin.$queryRaw<{ mode: string }[]>`
        SELECT l.mode FROM pg_locks l JOIN pg_class c ON c.oid = l.relation
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE l.pid = ${linkPid} AND NOT l.granted AND n.nspname = ${schema} AND c.relname = 'pos_expenses'
      `;
      blockedByTransferTableLock = locks.some(lock => lock.mode === "ShareLock");
    } catch (error) { failure = error; } finally { release.resolve(); }
    const [transferResult, linkResult] = await Promise.all([transfer, linker ?? Promise.resolve(undefined)]);
    runtime.db = client;
    if (failure) throw failure;
    expect(blockedByTransferTableLock).toBe(true);
    expect(transferResult.status, String(runtime.error)).toBe(method === "POST" ? 201 : 200);
    expect(linkResult?.status).toBe(409);
    expect(await client.manualTransferAllocation.count({ where: { payableId: "debt-1" } })).toBe(1);
  }, 20_000);

  it.each(["POST", "PATCH", "DELETE", "ATTACHMENT"])("%s mengamankan tabel expense sebelum otorisasi saat link dan writer RBAC bersamaan", async method => {
    const { allocations: _allocations, ...noAllocations } = payload;
    if (method === "POST") {
      await client.$executeRaw`INSERT INTO "pos_manual_transfer_attempts" ("id", "storeId", "userId", "body") VALUES (${key}, 'store-1', 'owner', ${JSON.stringify(noAllocations)})`;
    } else {
      await client.$executeRawUnsafe(`INSERT INTO "pos_expenses" ("id", "storeId", "recordedById", "applicantName", "category", "manualPurchasePaymentMethod", "reportCategory", "description", "amount", "occurredAt", "updatedAt", "attachmentUrl") VALUES ('expense-1', 'store-1', 'owner', 'Pemasok', 'SUPPLIES', 'TRANSFER', 'ATK', 'Kertas', 100, '2026-11-01 17:00:00', '2026-11-01', 'https://prnt.sc/abc')`);
    }
    await client.$executeRawUnsafe(`INSERT INTO "pos_goods_purchases" ("id", "storeId", "supplierNameSnapshot", "totalAmount", "shoppingRequestId", "paymentDueDate", "status", "paymentMethod") VALUES ('purchase-1', 'store-1', 'Pemasok', 1000, 'shopping-1', '2026-11-20', 'APPROVED', 'GIRO')`);
    const acquired = signal(), release = signal();
    let transferPid = 0, rbWriterPid = 0;
    let intercepted = false;
    const queryDb = routeDb.$extends({ query: { expense: {
      async $allOperations({ operation, args, query }) {
        if (!intercepted && operation === (method === "POST" ? "create" : "update")) {
          intercepted = true; acquired.resolve(); await release.promise;
        }
        return query(args);
      },
    } } });
    const transactionDb = new Proxy(routeDb, {
      get(target, property) {
        if (property === "$transaction") return async (callback: (tx: unknown) => Promise<unknown>, options: unknown) =>
          queryDb.$transaction(async tx => {
            const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
            if (!transferPid) transferPid = row.pid; else linkPid = row.pid;
            return callback(tx);
          }, options as never);
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    runtime.db = transactionDb;
    const context = { params: Promise.resolve({ id: "expense-1" }) };
    const transferRequest = new Request("http://localhost/api", {
      method: method === "POST" ? "POST" : method === "PATCH" ? "PATCH" : "DELETE",
      headers: { "Content-Type": "application/json", "Idempotency-Key": key },
      ...(method === "POST" || method === "PATCH" ? { body: JSON.stringify(noAllocations) } :
        method === "ATTACHMENT" ? { body: JSON.stringify({ expectedUpdatedAt: payload.updatedAt, requestKey: key }) } : {}),
    });
    const transfer = (method === "POST" ? POST(transferRequest) : method === "PATCH" ? PATCH(transferRequest, context) :
      method === "DELETE" ? DELETE(transferRequest, context) : deleteAttachment(transferRequest, context));
    let linker: Promise<Response> | undefined;
    let writer: Promise<unknown> | undefined;
    let failure: unknown;
    let linkWaitsForExpense = false, writerWaitsForPermission = false, linkCompleted = false;
    try {
      await Promise.race([acquired.promise, transfer.then(response => { throw new Error(`Transfer berhenti sebelum penulisan: ${response.status} ${String(runtime.error)}`); })]);
      const held = await admin.$queryRaw<{ held: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM pg_locks l JOIN pg_class c ON c.oid = l.relation JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE l.pid = ${transferPid} AND l.granted AND l.mode = 'ShareLock' AND n.nspname = ${schema} AND c.relname = 'pos_role_permissions') AS held
      `;
      expect(held[0].held).toBe(true);
      writer = payment.$transaction(async tx => {
        const [row] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        rbWriterPid = row.pid;
        await tx.$executeRaw`UPDATE "pos_role_permissions" SET "allowed" = NOT "allowed" WHERE "id" = 'unrelated'`;
      }, { timeout: 15_000 });
      await waitUntil(async () => !!rbWriterPid && await waiting(rbWriterPid));
      const body = {
        payableId: "debt-1", expectedGiroPayableId: "giro-1", historiesConfirmed: true,
        expectedGiro: { amount: 1000, debtDate: null, payableDebtDate: "2026-11-01", dueDate: "2026-11-20", supplierName: "Pemasok", payableNote: null },
        expectedManual: { amount: 1000, debtDate: "2026-11-01", dueDate: null, supplierName: "Pemasok", note: null },
        expectedGiroPayments: [], expectedManualPayments: [], duplicatePayments: [], matchingPaymentsConfirmedDistinct: false,
      };
      linker = linkManual(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ goodsPurchaseId: "purchase-1" }) }).then(response => { linkCompleted = true; return response; });
      await waitUntil(async () => linkCompleted || (!!linkPid && await waiting(linkPid)));
      const locks = await admin.$queryRaw<{ mode: string; table: string }[]>`
        SELECT l.mode, c.relname AS "table" FROM pg_locks l JOIN pg_class c ON c.oid = l.relation JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE l.pid = ${linkPid} AND NOT l.granted AND n.nspname = ${schema}
      `;
      linkWaitsForExpense = locks.some(lock => lock.mode === "ShareLock" && lock.table === "pos_expenses");
      writerWaitsForPermission = await waiting(rbWriterPid);
    } catch (error) { failure = error; } finally { release.resolve(); }
    const [result] = await Promise.all([transfer, linker ?? Promise.resolve(undefined), writer ?? Promise.resolve()]);
    runtime.db = client;
    if (failure) throw failure;
    expect(writerWaitsForPermission).toBe(true);
    expect(linkWaitsForExpense).toBe(true);
    expect(result.status, String(runtime.error)).toBe(method === "POST" ? 201 : 200);
  }, 20_000);

  it.each(["POST", "PATCH"])("%s menolak jika grant dicabut saat menunggu hutang", async method => {
    runtime.actor.role = "ADMIN";
    await client.$executeRawUnsafe(`UPDATE "pos_users" SET "role" = 'ADMIN' WHERE "id" = 'owner'`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_role_permissions" VALUES
      ('page', 'ADMIN', 'page', '/keuangan', 'access', true),
      ('create', 'ADMIN', 'resource', 'expense.manual_transfer', 'create', true),
      ('update', 'ADMIN', 'resource', 'expense.manual_transfer', 'update', true),
      ('edit', 'ADMIN', 'resource', 'expense.manual_transfer.edit', 'update', true),
      ('expense', 'ADMIN', 'resource', 'expense', 'read', true),
      ('allocation', 'ADMIN', 'resource', 'expense.manual_transfer.allocation', 'update', true),
      ('payable', 'ADMIN', 'resource', 'expense.payable', 'read', true)`);
    if (method === "POST") {
      await client.$executeRaw`INSERT INTO "pos_manual_transfer_attempts" ("id", "storeId", "userId", "body") VALUES (${key}, 'store-1', 'owner', ${JSON.stringify(payload)})`;
    } else {
      await client.$executeRawUnsafe(`INSERT INTO "pos_expenses" ("id", "storeId", "recordedById", "applicantName", "category", "manualPurchasePaymentMethod", "reportCategory", "description", "amount", "occurredAt", "updatedAt") VALUES ('expense-1', 'store-1', 'owner', 'Pemasok', 'SUPPLIES', 'TRANSFER', 'ATK', 'Kertas', 100, '2026-11-01 17:00:00', '2026-11-01')`);
    }
    const locked = signal(), release = signal();
    const holding = payment.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "pos_supplier_payables" WHERE "id" = 'debt-1' FOR UPDATE`;
      locked.resolve(); await release.promise;
    }, { timeout: 10_000 });
    await locked.promise;
    const req = new Request("http://localhost/api", { method, headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(payload) });
    let response: Response | undefined;
    const transfer = (method === "POST" ? POST(req) : PATCH(req, { params: Promise.resolve({ id: "expense-1" }) })).then(value => { response = value; return value; });
    try {
      await waitUntil(async () => !!response || await waiting(clientPid));
      if (response) throw new Error(`Transfer berhenti sebelum lock: ${response.status} ${String(runtime.error)}`);
      await permissionWriter.$executeRaw`UPDATE "pos_role_permissions" SET "allowed" = false WHERE "id" = 'payable'`;
    } finally { release.resolve(); }
    await holding;
    expect((await transfer).status).toBe(403);
    expect(await client.manualTransferAllocation.count()).toBe(0);
    expect(await client.expense.count()).toBe(method === "POST" ? 0 : 1);
  }, 20_000);

  it.each(["grant", "halaman", "akun", "replay"])("penghapusan transfer memeriksa ulang %s setelah lock", async kind => {
    runtime.actor.role = "ADMIN";
    await client.$executeRawUnsafe(`UPDATE "pos_users" SET "role" = 'ADMIN' WHERE "id" = 'owner'`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_role_permissions" VALUES
      ('page', 'ADMIN', 'page', '/keuangan', 'access', true),
      ('remove', 'ADMIN', 'resource', 'expense.manual_transfer', 'delete', true)`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_expenses" ("id", "storeId", "recordedById", "applicantName", "category", "manualPurchasePaymentMethod", "reportCategory", "description", "amount", "occurredAt", "updatedAt", "deletedAt") VALUES ('expense-1', 'store-1', 'owner', 'Pemasok', 'SUPPLIES', 'TRANSFER', 'ATK', 'Kertas', 100, '2026-11-01 17:00:00', '2026-11-01', ${kind === "replay" ? "'2026-11-03'" : "NULL"})`);
    const locked = signal(), release = signal();
    const holding = payment.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "pos_expenses" WHERE "id" = 'expense-1' FOR UPDATE`;
      locked.resolve(); await release.promise;
    }, { timeout: 10_000 });
    await locked.promise;
    let response: Response | undefined;
    const deletion = DELETE(new Request("http://localhost/api", { method: "DELETE" }), { params: Promise.resolve({ id: "expense-1" }) }).then(value => { response = value; return value; });
    try {
      await waitUntil(async () => !!response || await waiting(clientPid));
      if (response) throw new Error(`Penghapusan berhenti sebelum lock: ${response.status} ${String(runtime.error)}`);
      if (kind === "akun") await permissionWriter.$executeRaw`UPDATE "pos_users" SET "isActive" = false WHERE "id" = 'owner'`;
      else await permissionWriter.$executeRaw`UPDATE "pos_role_permissions" SET "allowed" = false WHERE "id" = ${kind === "halaman" ? "page" : "remove"}`;
    } finally { release.resolve(); }
    await holding;
    expect((await deletion).status).toBe(403);
    const [record] = await client.$queryRaw<{ deletedAt: Date | null }[]>`SELECT "deletedAt" FROM "pos_expenses" WHERE "id" = 'expense-1'`;
    expect(record.deletedAt?.toISOString() ?? null).toBe(kind === "replay" ? "2026-11-03T00:00:00.000Z" : null);
  }, 20_000);

  it("replay penyimpanan menunggu transfer dan memeriksa akun yang berubah", async () => {
    await client.$executeRaw`INSERT INTO "pos_manual_transfer_attempts" ("id", "storeId", "userId", "body") VALUES (${key}, 'store-1', 'owner', ${JSON.stringify(payload)})`;
    const request = () => new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(payload) });
    expect((await POST(request())).status).toBe(201);
    const [saved] = await client.$queryRaw<{ id: string }[]>`SELECT "id" FROM "pos_expenses" LIMIT 1`;
    const locked = signal(), release = signal();
    const holding = payment.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "pos_expenses" WHERE "id" = ${saved.id} FOR UPDATE`;
      locked.resolve(); await release.promise;
    }, { timeout: 10_000 });
    await locked.promise;
    let response: Response | undefined;
    const retry = POST(request()).then(value => { response = value; return value; });
    try {
      await waitUntil(async () => !!response || await waiting(clientPid));
      await permissionWriter.$executeRaw`UPDATE "pos_users" SET "isActive" = false WHERE "id" = 'owner'`;
    } finally { release.resolve(); }
    await holding;
    expect((await retry).status).toBe(403);
    expect(await client.expense.count()).toBe(1);
    expect(await client.manualTransferAllocation.count()).toBe(1);
  }, 20_000);
});
