import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@pos/db";
import { vi } from "vitest";
const runtime = vi.hoisted(() => ({ db: null as PrismaClient | null, actor: { id: "owner", storeId: "store-1", role: "OWNER" }, canRead: true, canUpdate: true }));
vi.mock("@pos/db", async original => ({ ...await original<object>(), get db() { return runtime.db; } }));
vi.mock("@/lib/rbac/guard", () => ({ requireRole: async () => runtime.actor, requirePermission: async (target: string, action: string) => {
  if (target === "expense.payable" && ((action === "read" && !runtime.canRead) || (action === "update" && !runtime.canUpdate))) throw new Error("denied");
  return runtime.actor;
}, authorizeInTransaction: async (_tx: unknown, _actor: unknown, requirements: { resources: { resource: string; action: string }[] }) => requirements.resources.every(({ resource, action }) => resource !== "expense.payable" || (action === "read" ? runtime.canRead : action === "update" ? runtime.canUpdate : true)), canAuthenticatedUserAccessPage: async () => true, canAuthenticatedUserPerform: async (_user: unknown, target: string, action: string) => target !== "expense.payable" || (action === "read" ? runtime.canRead : action === "update" ? runtime.canUpdate : true), handleAuthError: (error: unknown) => error instanceof Error && error.message === "denied" ? new Response(null, { status: 403 }) : null }));
vi.mock("@/lib/logger", () => ({ getLogger: () => ({ error: vi.fn() }) }));
import { reconcilePayable } from "../manual-payable-reconciliation";
import { linkTransferAllocations } from "../manual-transfer-allocation-service";
import { GET as listAttempts, POST as registerAttempt } from "@/app/api/finance/expenses/manual-transfer-attempts/route";
import { POST as recordPayment } from "@/app/api/finance/supplier-payables/[id]/payments/route";
import { PATCH as editPayment } from "@/app/api/finance/supplier-payables/[id]/payments/[paymentId]/route";
import { GET as getPayableAttempt, POST as registerPayableAttempt, DELETE as clearPayableAttempt } from "@/app/api/finance/supplier-payables/manual-attempt/route";
import { POST as createPayable } from "@/app/api/finance/supplier-payables/route";

const connection = process.env.GIRO_TEST_DATABASE_URL;
const schema = `manual_finance_${randomUUID().replaceAll("-", "")}`;

describe.skipIf(!connection)("transaksi keuangan manual pada PostgreSQL terisolasi", () => {
  let admin: PrismaClient;
  let client: PrismaClient;

  beforeAll(async () => {
    const url = new URL(connection!);
    if (url.hostname !== "127.0.0.1" || !["55443", "15443"].includes(url.port) || url.pathname !== "/postgres" || url.searchParams.has("schema")) {
      throw new Error("Pengujian memerlukan database PostgreSQL uji yang terisolasi.");
    }
    admin = new PrismaClient({ datasourceUrl: connection });
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    url.searchParams.set("schema", schema);
    client = new PrismaClient({ datasourceUrl: url.toString() });
    runtime.db = client;
    const statements = [
      `CREATE TYPE "Role" AS ENUM ('ADMIN', 'CASHIER', 'SALES', 'INVENTORY')`,
      `CREATE TABLE "pos_stores" ("id" TEXT PRIMARY KEY)`,
      `CREATE TABLE "pos_users" ("id" TEXT PRIMARY KEY)`,
      `CREATE TABLE "pos_role_permissions" ("id" TEXT PRIMARY KEY, "role" "Role" NOT NULL, "scope" TEXT NOT NULL, "target" TEXT NOT NULL, "action" TEXT NOT NULL, "allowed" BOOLEAN NOT NULL, "updatedAt" TIMESTAMP NOT NULL, UNIQUE ("role", "scope", "target", "action"))`,
      `CREATE TABLE "pos_customer_receivables" ("id" TEXT PRIMARY KEY)`,
      `CREATE TABLE "pos_customer_receivable_payments" ("id" TEXT PRIMARY KEY)`,
      `CREATE TABLE "pos_goods_purchases" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "shoppingRequestId" TEXT, "paymentMethod" TEXT)`,
      `CREATE TABLE "pos_goods_purchase_payments" ("id" TEXT PRIMARY KEY, "goodsPurchaseId" TEXT NOT NULL, "method" TEXT NOT NULL, "amount" NUMERIC(12,2) NOT NULL)`,
      `CREATE TABLE "pos_shopping_request_corrections" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "shoppingRequestId" TEXT NOT NULL)`,
      `CREATE TABLE "pos_supplier_payables" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "goodsPurchaseId" TEXT, "giroHistoryVerifiedAt" TIMESTAMP, "supplierName" TEXT NOT NULL, "amount" NUMERIC(12,2) NOT NULL, "debtDate" DATE NOT NULL, "dueDate" DATE, "note" TEXT, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT NOW())`,
      `CREATE TABLE "pos_supplier_payable_manual_links" ("manualPayableId" TEXT PRIMARY KEY, "giroPayableId" TEXT NOT NULL, "storeId" TEXT NOT NULL)`,
      `CREATE TABLE "pos_supplier_payable_payments" ("id" TEXT PRIMARY KEY, "payableId" TEXT NOT NULL REFERENCES "pos_supplier_payables"("id") ON DELETE RESTRICT, "amount" NUMERIC(12,2) NOT NULL, "paidAt" DATE NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(), "requestScope" TEXT UNIQUE, "requestExpectedBalance" NUMERIC(12,2))`,
      `CREATE TABLE "pos_expenses" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "amount" NUMERIC(12,2) NOT NULL, "changeAmount" NUMERIC(12,2) NOT NULL DEFAULT 0, "occurredAt" TIMESTAMP NOT NULL, "manualPurchasePaymentMethod" TEXT, "deletedAt" TIMESTAMP, "goodsPurchaseId" TEXT, "shoppingRequestId" TEXT)`,
    ];
    for (const statement of statements) await client.$executeRawUnsafe(statement);
    for (const migrationPath of ["20261116010000_manual_finance_categories", "20261117030000_manual_payable_create_idempotency"]) {
      const migration = readFileSync(path.resolve(process.cwd(), `../../packages/db/prisma/migrations/${migrationPath}/migration.sql`), "utf8");
      const revocations = migration.match(/DO \$\$[\s\S]*?END \$\$;/)?.[0];
      if (!revocations) throw new Error("Pembatasan akses percobaan tidak ditemukan.");
      for (const statement of migration.replace(revocations, "").split(/;\s*(?:\r?\n|$)/).filter(part => part.trim())) await client.$executeRawUnsafe(statement);
      await client.$executeRawUnsafe(revocations);
    }
    const ledgerMigration = readFileSync(path.resolve(process.cwd(), "../../packages/db/prisma/migrations/20261117050000_payable_ledger_version/migration.sql"), "utf8");
    for (const statement of ledgerMigration.split("-- statement-break").map(value => value.trim()).filter(Boolean)) await client.$executeRawUnsafe(statement);
    await client.$executeRawUnsafe(`INSERT INTO "pos_stores" VALUES ('store-1'), ('store-2')`);
    await client.$executeRawUnsafe(`INSERT INTO "pos_users" VALUES ('owner'), ('other')`);
  }, 60_000);

  afterAll(async () => {
    await client?.$disconnect();
    if (admin) await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin?.$disconnect();
    runtime.db = null;
  }, 30_000);

  async function debt(id: string, dueDate: string | null = null) {
    await client.$executeRaw`INSERT INTO "pos_supplier_payables" ("id", "storeId", "supplierName", "amount", "debtDate", "dueDate", "createdById", "reportCategory")
      VALUES (${id}, 'store-1', 'Pemasok', 1000, '2026-11-01'::date, ${dueDate}::date, 'owner', 'ATK')`;
  }
  async function transfer(id: string) {
    await client.$executeRaw`INSERT INTO "pos_expenses" ("id", "storeId", "amount", "occurredAt", "manualPurchasePaymentMethod", "reportCategory")
      VALUES (${id}, 'store-1', 400, '2026-11-04 17:00:00'::timestamp, 'TRANSFER', 'SPANDUK')`;
  }
  const scope = (payableId: string) => ({ storeId: "store-1", payableId, actorId: "owner", todayWib: "2026-11-16" });

  it("mengisi snapshot pembayaran lama saat migrasi tanpa mengubah nilainya", async () => {
    await debt("legacy-payment-debt");
    await client.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('pos.payable_system_payment', '1', true)`;
      await tx.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "createdById", "requestScope", "requestExpectedBalance") VALUES ('legacy-payment', 'legacy-payment-debt', 250, '2026-11-02'::date, 'owner', NULL, 1000)`;
    });
    await client.$executeRaw`UPDATE "pos_supplier_payable_payments" SET "requestScope" = 'legacy-scope' WHERE "id" = 'legacy-payment'`;
    const sql = readFileSync(path.resolve(process.cwd(), "../../packages/db/prisma/migrations/20261117030000_manual_payable_create_idempotency/migration.sql"), "utf8");
    const backfill = sql.match(/UPDATE "pos_supplier_payable_payments"[\s\S]*?WHERE "requestScope" IS NOT NULL;/)?.[0];
    if (!backfill) throw new Error("Backfill metadata pembayaran tidak ditemukan.");
    await client.$executeRawUnsafe(backfill);
    const [row] = await client.$queryRaw<{ payableId: string; amount: string; paidAt: string; requestPayableId: string; requestAmount: string; requestPaidAt: string }[]>`SELECT "payableId", "amount"::text, "paidAt"::text, "requestPayableId", "requestAmount"::text, "requestPaidAt"::text FROM "pos_supplier_payable_payments" WHERE "id" = 'legacy-payment'`;
    expect(row).toEqual({ payableId: "legacy-payment-debt", amount: "250.00", paidAt: "2026-11-02", requestPayableId: "legacy-payment-debt", requestAmount: "250.00", requestPaidAt: "2026-11-02" });
  });

  it("menyerialkan pembuatan hutang, retry, pengakuan dan tab lama", async () => {
    const body = { supplierName: "Pemasok uji", amount: "1000", debtDate: "2026-11-01", dueDate: "", note: "", reportCategory: "ATK", initialPayment: "300", initialPaidAt: "2026-11-02" };
    const keys = [randomUUID(), randomUUID()];
    const register = (key: string, version: string) => registerPayableAttempt(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, version, body }) }));
    const submissions = await Promise.all(keys.map(key => register(key, "0")));
    expect(submissions.map(response => response.status).sort()).toEqual([201, 409]);
    const state = await (await getPayableAttempt()).json();
    const key = state.attempt.key as string;
    const create = (payload = body) => createPayable(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(payload) }));
    const results = await Promise.all([create(), create()]);
    expect(results.map(response => response.status).sort()).toEqual([200, 201]);
    const first = await results[0].json(), second = await results[1].json();
    expect(first.id).toEqual(second.id);
    for (const changed of [
      { supplierName: "Pemasok lain" }, { amount: "1200" }, { debtDate: "2026-11-02" }, { dueDate: "2026-12-10" },
      { note: "Catatan lain" }, { reportCategory: "SALARY" }, { initialPayment: "400" }, { initialPaidAt: "2026-11-03" },
    ]) expect((await create({ ...body, ...changed })).status).toBe(409);
    const counts = await client.$queryRaw<{ debts: bigint; payments: bigint }[]>`SELECT COUNT(DISTINCT d."id") AS debts, COUNT(p."id") AS payments FROM "pos_supplier_payables" d LEFT JOIN "pos_supplier_payable_payments" p ON p."payableId" = d."id" WHERE d."supplierName" = 'Pemasok uji'`;
    expect(counts[0]).toEqual({ debts: 1n, payments: 1n });
    const cleared = await clearPayableAttempt(new Request("http://localhost/api", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, expectedCompleted: true }) }));
    expect(cleared.status).toBe(200);
    const clearedState = await cleared.json();
    expect((await register(randomUUID(), "0")).status).toBe(409);
    expect((await register(key, clearedState.version)).status).toBe(409);
    expect((await create()).status).toBe(200);
    await client.$executeRaw`INSERT INTO "pos_supplier_payable_manual_links" ("manualPayableId", "giroPayableId", "storeId") VALUES (${first.id}, 'giro', 'store-1')`;
    await client.$executeRaw`DELETE FROM "pos_supplier_payable_payments" WHERE "payableId" = ${first.id}`;
    await client.$executeRaw`DELETE FROM "pos_supplier_payables" WHERE "id" = ${first.id}`;
    const linkedReplay = await create();
    expect(await linkedReplay.json()).toEqual({ processed: true, status: "linked" });
    expect((await register(key, clearedState.version)).status).toBe(409);
    expect((await register(randomUUID(), clearedState.version)).status).toBe(201);
    const active = await (await getPayableAttempt()).json();
    await clearPayableAttempt(new Request("http://localhost/api", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: active.attempt.key, expectedCompleted: false }) }));
  }, 30_000);

  it("memisahkan percobaan per pengguna dan toko serta menyembunyikan pembayaran setelah izin dicabut", async () => {
    const body = { supplierName: "Terbatas", amount: "1000", debtDate: "2026-11-01", dueDate: "", note: "", reportCategory: "ATK", initialPayment: "300", initialPaidAt: "2026-11-02" };
    const key = randomUUID();
    const register = () => registerPayableAttempt(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, version: "0", body }) }));
    try {
      runtime.actor = { id: "other", storeId: "store-1", role: "OWNER" };
      expect((await register()).status).toBe(201);
      runtime.actor = { id: "owner", storeId: "store-2", role: "OWNER" };
      expect((await (await getPayableAttempt()).json()).attempt).toBeNull();
      expect((await register()).status).toBe(201);
      runtime.actor = { id: "other", storeId: "store-1", role: "OWNER" };
      runtime.canRead = false; runtime.canUpdate = false;
      expect((await (await getPayableAttempt()).json()).attempt.body).toBeNull();
      expect((await createPayable(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body) }))).status).toBe(403);
      runtime.actor = { id: "other", storeId: "store-2", role: "OWNER" };
      const withoutPayment = { ...body, initialPayment: "", initialPaidAt: "" };
      expect((await registerPayableAttempt(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, version: "0", body: withoutPayment }) }))).status).toBe(201);
      expect((await (await getPayableAttempt()).json()).attempt.body).not.toBeNull();
      expect((await createPayable(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(withoutPayment) }))).status).toBe(201);
    } finally {
      runtime.actor = { id: "owner", storeId: "store-1", role: "OWNER" }; runtime.canRead = true; runtime.canUpdate = true;
    }
  }, 30_000);

  it("menyerialkan penyimpanan dengan permintaan melupakan percobaan", async () => {
    const body = { supplierName: "Balapan", amount: "1000", debtDate: "2026-11-01", dueDate: "", note: "", reportCategory: "ATK", initialPayment: "300", initialPaidAt: "2026-11-02" };
    const key = randomUUID(), state = await (await getPayableAttempt()).json();
    expect((await registerPayableAttempt(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, version: state.version, body }) }))).status).toBe(201);
    const [created, forgotten] = await Promise.all([
      createPayable(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify(body) })),
      clearPayableAttempt(new Request("http://localhost/api", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, expectedCompleted: false }) })),
    ]);
    expect([[201, 409], [409, 200]]).toContainEqual([created.status, forgotten.status]);
    const counts = await client.$queryRaw<{ debts: bigint; payments: bigint }[]>`SELECT COUNT(DISTINCT d."id") AS debts, COUNT(p."id") AS payments FROM "pos_supplier_payables" d LEFT JOIN "pos_supplier_payable_payments" p ON p."payableId" = d."id" WHERE d."supplierName" = 'Balapan'`;
    expect(counts[0]).toEqual(created.status === 201 ? { debts: 1n, payments: 1n } : { debts: 0n, payments: 0n });
    if (created.status === 201) await clearPayableAttempt(new Request("http://localhost/api", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, expectedCompleted: true }) }));
  }, 30_000);

  it("serializes two tabs registering an unresolved transfer for the same user", async () => {
    const body = JSON.stringify({ applicantName: "Pemasok", description: "Kertas", amount: 100, occurredAt: "2026-11-01", reportCategory: "ATK", manualPurchasePaymentMethod: "TRANSFER", allocations: [] });
    const register = () => registerAttempt(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: randomUUID(), body, forceNew: false }) }));
    const results = await Promise.all([register(), register()]);
    expect(results.map(result => result.status).sort()).toEqual([201, 409]);
    expect(await client.manualTransferAttempt.count({ where: { storeId: "store-1", userId: "owner" } })).toBe(1);
    expect((await (await listAttempts()).json()).attempts).toHaveLength(1);
  }, 30_000);

  it("merekam satu pembayaran ketika dua tab mengirim kunci sama dan menolak saldo lama", async () => {
    await debt("payment-retry");
    const key = randomUUID();
    const request = (requestKey: string, amount = 300) => recordPayment(new Request("http://localhost/payments", {
      method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey },
      body: JSON.stringify({ amount, paidAt: "2026-11-05", expectedBalance: 1000, expectedLedgerVersion: "0" }),
    }), { params: Promise.resolve({ id: "payment-retry" }) });
    const concurrent = await Promise.all([request(key), request(key)]);
    expect(concurrent.map(response => response.status)).toEqual([201, 201]);
    expect(await client.supplierPayablePayment.count({ where: { payableId: "payment-retry" } })).toBe(1);
    const payment = await client.supplierPayablePayment.findFirstOrThrow({ where: { payableId: "payment-retry" } });
    const corrected = await editPayment(new Request("http://localhost/payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: "400", paidAt: "2026-11-06", expected: { amount: "300", paidAt: "2026-11-05", origin: "MANUAL" } }) }), { params: Promise.resolve({ id: "payment-retry", paymentId: payment.id }) });
    expect(corrected.status).toBe(200);
    expect((await request(key)).status).toBe(201);
    const updated = await client.supplierPayablePayment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(Number(updated.amount)).toBe(400); expect(updated.paidAt.toISOString().slice(0, 10)).toBe("2026-11-06");
    expect((await request(key, 400)).status).toBe(409);
    const stale = await request(randomUUID());
    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe("BalanceChanged");
    expect(await client.supplierPayablePayment.count({ where: { payableId: "payment-retry" } })).toBe(1);
  }, 30_000);

  it("waits for an in-flight save before showing the transfer status", async () => {
    const id = randomUUID();
    await client.manualTransferAttempt.create({ data: { id, storeId: "store-1", userId: "owner", body: "{}" } });
    let release!: () => void, signalLocked!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const locked = new Promise<void>(resolve => { signalLocked = resolve; });
    const writer = client.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${JSON.stringify(["store-1", "owner", "manual-transfer-attempt"])}, 0))`;
      await tx.manualTransferAttempt.update({ where: { id }, data: { completedAt: new Date("2026-11-16T00:00:00Z") } });
      signalLocked();
      await hold;
    });
    await locked;
    const read = listAttempts();
    const returnedEarly = await Promise.race([read.then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 300))]);
    release();
    await writer;
    const response = await read;
    expect(returnedEarly).toBe(false);
    expect((await response.json()).attempts.find((row: { key: string }) => row.key === id).completedAt).toBe("2026-11-16T00:00:00.000Z");
  }, 30_000);

  it("serializes concurrent automatic settlement and keeps one event", async () => {
    await debt("auto-debt", "2026-11-10");
    await client.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('pos.payable_system_payment', '1', true)`;
      await tx.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "createdById") VALUES ('auto-manual', 'auto-debt', 400, '2026-11-12'::date, 'owner')`;
    });
    const results = await Promise.all([client.$transaction(tx => reconcilePayable(tx, scope("auto-debt"))), client.$transaction(tx => reconcilePayable(tx, scope("auto-debt")))]);
    expect(results[0].automaticPaymentId).toBe(results[1].automaticPaymentId);
    const rows = await client.supplierPayablePayment.findMany({ where: { payableId: "auto-debt" }, orderBy: { paidAt: "asc" }, select: { amount: true, paidAt: true, origin: true } });
    expect(rows.map(row => ({ amount: Number(row.amount), paidAt: row.paidAt.toISOString().slice(0, 10), origin: row.origin }))).toEqual([
      { amount: 600, paidAt: "2026-11-10", origin: "AUTO" }, { amount: 400, paidAt: "2026-11-12", origin: "MANUAL" },
    ]);
  }, 30_000);

  it("allows only one concurrent transfer to link the same payment", async () => {
    await debt("race-debt");
    await transfer("race-transfer-a"); await transfer("race-transfer-b");
    await client.$transaction(async tx => {
      await tx.$executeRaw`SELECT set_config('pos.payable_system_payment', '1', true)`;
      await tx.$executeRaw`INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "createdById") VALUES ('race-payment', 'race-debt', 400, '2026-11-05'::date, 'owner')`;
    });
    const run = (expenseId: string) => client.$transaction(tx => linkTransferAllocations(tx, { storeId: "store-1", expenseId, actorId: "owner", todayWib: "2026-11-16" }, [{ payableId: "race-debt", paymentId: "race-payment", amount: 400 }]));
    const results = await Promise.allSettled([run("race-transfer-a"), run("race-transfer-b")]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await client.manualTransferAllocation.count({ where: { paymentId: "race-payment" } })).toBe(1);
  }, 30_000);

  it("menggulung balik transfer jika izin dicabut ketika menunggu lock hutang", async () => {
    await debt("auth-lock-debt");
    let release!: () => void, acquired!: () => void;
    const hold = new Promise<void>(resolve => { release = resolve; });
    const locked = new Promise<void>(resolve => { acquired = resolve; });
    const blocker = client.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "pos_supplier_payables" WHERE "id" = 'auth-lock-debt' FOR UPDATE`;
      acquired(); await hold;
    }, { timeout: 10000 });
    await locked;
    let allowed = true;
    const writer = client.$transaction(async tx => {
      await tx.$executeRaw`INSERT INTO "pos_expenses" ("id", "storeId", "amount", "occurredAt", "manualPurchasePaymentMethod", "reportCategory") VALUES ('auth-lock-transfer', 'store-1', 400, '2026-11-04 17:00:00'::timestamp, 'TRANSFER', 'ATK')`;
      return linkTransferAllocations(tx, { storeId: "store-1", expenseId: "auth-lock-transfer", actorId: "owner", todayWib: "2026-11-16", authorizeAfterLocks: async () => { if (!allowed) throw new Error("izin dicabut"); } }, [{ payableId: "auth-lock-debt", paymentId: null, amount: 400 }]);
    }, { timeout: 10000 });
    const finishedBeforeUnlock = await Promise.race([writer.then(() => true, () => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 250))]);
    expect(finishedBeforeUnlock).toBe(false);
    allowed = false; release(); await blocker;
    await expect(writer).rejects.toThrow("izin dicabut");
    const [counts] = await client.$queryRaw<{ expenses: bigint; payments: bigint; allocations: bigint }[]>`SELECT (SELECT COUNT(*) FROM "pos_expenses" WHERE "id" = 'auth-lock-transfer') AS expenses, (SELECT COUNT(*) FROM "pos_supplier_payable_payments" WHERE "payableId" = 'auth-lock-debt') AS payments, (SELECT COUNT(*) FROM "pos_manual_transfer_allocations" WHERE "expenseId" = 'auth-lock-transfer') AS allocations`;
    expect(counts).toEqual({ expenses: 0n, payments: 0n, allocations: 0n });
  }, 20_000);

  it("rolls back a payment that would invalidate a linked automatic settlement", async () => {
    await debt("locked-auto", "2026-11-05");
    await transfer("locked-transfer");
    await client.$transaction(tx => reconcilePayable(tx, scope("locked-auto")));
    await client.$transaction(tx => linkTransferAllocations(tx, { storeId: "store-1", expenseId: "locked-transfer", actorId: "owner", todayWib: "2026-11-16" }, [{ payableId: "locked-auto", paymentId: "auto:locked-auto", amount: 400 }]));
    await expect(client.$transaction(async tx => {
      await tx.$executeRaw`SELECT "id" FROM "pos_supplier_payables" WHERE "id" = 'locked-auto' FOR UPDATE`;
      await tx.$executeRaw`SELECT set_config('pos.payable_system_payment', '1', true)`;
      await tx.supplierPayablePayment.create({ data: { id: "rejected-payment", payableId: "locked-auto", amount: 700, paidAt: new Date("2026-11-06T00:00:00Z"), createdById: "owner" } });
      await reconcilePayable(tx, scope("locked-auto"));
    })).rejects.toThrow(/alokasi transfer/i);
    expect(await client.supplierPayablePayment.count({ where: { id: "rejected-payment" } })).toBe(0);
    expect(await client.manualTransferAllocation.count({ where: { expenseId: "locked-transfer" } })).toBe(1);
  }, 30_000);

  it("rejects a stale automatic allocation when the same transfer adds another payment", async () => {
    await debt("mixed-auto", "2026-11-05");
    await transfer("mixed-transfer");
    await client.$executeRaw`UPDATE "pos_expenses" SET "amount" = 1100 WHERE "id" = 'mixed-transfer'`;
    await expect(client.$transaction(tx => linkTransferAllocations(tx,
      { storeId: "store-1", expenseId: "mixed-transfer", actorId: "owner", todayWib: "2026-11-16" }, [
        { payableId: "mixed-auto", paymentId: "auto:mixed-auto", amount: 1000 },
        { payableId: "mixed-auto", paymentId: null, amount: 100 },
      ]))).rejects.toThrow();
    expect(await client.manualTransferAllocation.count({ where: { expenseId: "mixed-transfer" } })).toBe(0);
    expect(await client.supplierPayablePayment.count({ where: { payableId: "mixed-auto" } })).toBe(0);
  }, 30_000);
});
