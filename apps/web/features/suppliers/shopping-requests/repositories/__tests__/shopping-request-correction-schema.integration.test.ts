import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@pos/db";

const enabled = process.env.POS_SHOPPING_CORRECTION_INTEGRATION === "1";
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const storeId = `correction-store-${suffix}`;
const requestId = `correction-request-${suffix}`;

describe.skipIf(!enabled)("penyimpanan audit koreksi di PostgreSQL sementara", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/shopping_correction_test") {
      throw new Error("Pengujian hanya boleh memakai database sementara khusus.");
    }
    await db.store.create({ data: { id: storeId, name: "Toko Koreksi Uji" } });
    await db.shoppingRequest.create({
      data: { id: requestId, storeId, number: `UJI-${suffix}`, name: `Uji ${suffix}`, sequence: 1 },
    });
  });

  afterAll(async () => { await db.$disconnect(); });

  it("menyimpan audit dan menolak kunci pengulangan yang sama", async () => {
    const auditId = `audit-${suffix}`;
    await db.$executeRaw`
      INSERT INTO "pos_shopping_request_corrections"
        ("id", "storeId", "shoppingRequestId", "actorId", "reason", "idempotencyKey", "requestFingerprint", "beforeSnapshot", "afterSnapshot", "preview")
      VALUES (${auditId}, ${storeId}, ${requestId}, ${"owner"}, ${"Salah catat"}, ${"retry"}, ${"fingerprint"}, ${"{}"}::jsonb, ${"{}"}::jsonb, ${"{}"}::jsonb)`;
    await expect(db.$executeRaw`
      INSERT INTO "pos_shopping_request_corrections"
        ("id", "storeId", "shoppingRequestId", "actorId", "reason", "idempotencyKey", "requestFingerprint", "beforeSnapshot", "afterSnapshot", "preview")
      VALUES (${`${auditId}-duplicate`}, ${storeId}, ${requestId}, ${"owner"}, ${"Salah catat"}, ${"retry"}, ${"fingerprint"}, ${"{}"}::jsonb, ${"{}"}::jsonb, ${"{}"}::jsonb)`
    ).rejects.toThrow();
    const rows = await db.$queryRaw<Array<{ reason: string }>>`
      SELECT "reason" FROM "pos_shopping_request_corrections" WHERE "id" = ${auditId}`;
    expect(rows).toEqual([{ reason: "Salah catat" }]);
  });

  it("melindungi tabel audit dan dampaknya dengan row level security", async () => {
    const rows = await db.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
      SELECT relname, relrowsecurity FROM pg_class
      WHERE relname IN ('pos_shopping_request_corrections', 'pos_shopping_request_correction_movements', 'pos_shopping_request_correction_allocations')
      ORDER BY relname`;
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.relrowsecurity)).toBe(true);
  });

  it("menyimpan sumber pembayaran Transfer dan membaginya ke metode yang dipilih tanpa mencatat pembayaran baru", async () => {
    const auditId = `allocation-audit-${suffix}`;
    await db.$executeRaw`
      INSERT INTO "pos_shopping_request_corrections"
        ("id", "storeId", "shoppingRequestId", "actorId", "reason", "idempotencyKey", "requestFingerprint", "beforeSnapshot", "afterSnapshot", "preview")
      VALUES (${auditId}, ${storeId}, ${requestId}, ${"owner"}, ${"Salah metode"}, ${"allocation"}, ${"fingerprint"}, ${"{}"}::jsonb, ${"{}"}::jsonb, ${"{}"}::jsonb)`;
    for (const [method, amount] of [["TRANSFER", "400.00"], ["GIRO", "600.00"]] as const) {
      await db.$executeRaw`
        INSERT INTO "pos_shopping_request_correction_allocations"
          ("id", "correctionId", "paymentId", "sourceKind", "method", "amount", "sourceAmount", "paidAt", "details")
        VALUES (${`${auditId}-${method}`}, ${auditId}, ${"expense-1"}, ${"TRANSFER_EXPENSE"}, ${method}::"PurchasePaymentMethod", ${amount}::decimal, ${"1000.00"}::decimal, ${new Date("2026-11-01T00:00:00Z")}, ${"{}"}::jsonb)`;
    }
    const rows = await db.$queryRaw<Array<{ method: string; amount: string; sourceAmount: string }>>`
      SELECT "method"::text, "amount"::text, "sourceAmount"::text FROM "pos_shopping_request_correction_allocations"
      WHERE "correctionId" = ${auditId} ORDER BY "method"::text`;
    expect(rows).toEqual([
      { method: "GIRO", amount: "600.00", sourceAmount: "1000.00" },
      { method: "TRANSFER", amount: "400.00", sourceAmount: "1000.00" },
    ]);
  });

  it("mengizinkan utang pembelian bernilai nol tanpa mengizinkan utang manual nol", async () => {
    const userId = `correction-owner-${suffix}`;
    const purchaseId = `correction-purchase-${suffix}`;
    await db.user.create({ data: { id: userId, username: userId, name: "Pemilik Uji", role: "OWNER", storeId } });
    await db.goodsPurchase.create({ data: {
      id: purchaseId, storeId, shoppingRequestId: requestId, number: `PEMB-${suffix}`, sequence: 1,
      supplierNameSnapshot: "Pemasok", status: "APPROVED", totalAmount: 0, totalBasis: "RECEIVED", createdById: userId,
    } });
    const base = { storeId, supplierName: "Pemasok", debtDate: new Date("2026-11-01T00:00:00Z"), createdById: userId };
    const payable = await db.supplierPayable.create({ data: { ...base, id: `zero-giro-${suffix}`, goodsPurchaseId: purchaseId, amount: 0 } });
    expect(Number(payable.amount)).toBe(0);
    await expect(db.supplierPayable.create({ data: { ...base, id: `zero-manual-${suffix}`, amount: 0 } })).rejects.toThrow();
  });
});
