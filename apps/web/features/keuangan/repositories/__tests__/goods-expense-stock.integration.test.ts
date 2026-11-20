import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@pos/db";
import {
  cancelGoodsPurchaseWithStock,
  previewGoodsPurchaseStockCancellation,
} from "@/features/suppliers/shopping-requests/repositories/shopping-request-deletion-repository";

const enabled = process.env.POS_EXPENSE_CORRECTION_INTEGRATION === "1";
const run = crypto.randomUUID();
const actor = { id: `owner-${run}`, name: "Pemilik Uji", storeId: `store-${run}` };
const shoppingRequestId = `request-${run}`;
const selectedId = `purchase-selected-${run}`;
const otherId = `purchase-other-${run}`;
const selectedReceiptId = `receipt-selected-${run}`;
const otherReceiptId = `receipt-other-${run}`;
const now = new Date("2026-11-20T07:00:00Z");

describe.skipIf(!enabled)("pembatalan stok satu Pembelian Barang", () => {
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (url.hostname !== "127.0.0.1" || url.port !== "55487" || url.pathname !== "/expense_correction_test") {
      throw new Error("Pengujian harus memakai PostgreSQL sementara khusus koreksi pengeluaran.");
    }
    await db.store.create({ data: { id: actor.storeId, name: "Toko Koreksi Uji" } });
    await db.user.create({
      data: { id: actor.id, name: actor.name, storeId: actor.storeId, username: actor.id, role: "OWNER" },
    });
    await db.shoppingRequest.create({
      data: { id: shoppingRequestId, storeId: actor.storeId, sequence: 1, number: "DPB-Uji", name: "Daftar Uji", status: "APPROVED" },
    });
    await db.goodsPurchase.createMany({ data: [
      {
        id: selectedId, storeId: actor.storeId, shoppingRequestId, activeShoppingRequestKey: shoppingRequestId,
        createdById: actor.id, supplierNameSnapshot: "Pemasok", number: "PB-Uji-1", sequence: 1, totalAmount: 9000, status: "APPROVED",
      },
      {
        id: otherId, storeId: actor.storeId, shoppingRequestId, createdById: actor.id,
        supplierNameSnapshot: "Pemasok", number: "PB-Uji-2", sequence: 2, totalAmount: 8000, status: "APPROVED",
      },
    ] });
    await db.inventoryInboundReceipt.createMany({ data: [
      { id: selectedReceiptId, storeId: actor.storeId, shoppingRequestId, goodsPurchaseId: selectedId, status: "DRAFT" },
      { id: otherReceiptId, storeId: actor.storeId, shoppingRequestId, goodsPurchaseId: otherId, status: "DRAFT" },
    ] });
  }, 30_000);

  afterAll(async () => { await db.$disconnect(); });

  it("membatalkan hanya pembelian dan penerimaan yang dipilih", async () => {
    await db.$transaction(async tx => {
      const preview = await previewGoodsPurchaseStockCancellation(tx, shoppingRequestId, selectedId, actor.storeId);
      expect(preview).toMatchObject({ id: selectedId, number: "PB-Uji-1", movements: [] });
      await cancelGoodsPurchaseWithStock(tx, shoppingRequestId, selectedId, "Pembelian keliru", actor, now);
    });
    const [selected, other, ownReceipt, otherReceipt, parent] = await Promise.all([
      db.goodsPurchase.findUniqueOrThrow({ where: { id: selectedId } }),
      db.goodsPurchase.findUniqueOrThrow({ where: { id: otherId } }),
      db.inventoryInboundReceipt.findUniqueOrThrow({ where: { id: selectedReceiptId } }),
      db.inventoryInboundReceipt.findUniqueOrThrow({ where: { id: otherReceiptId } }),
      db.shoppingRequest.findUniqueOrThrow({ where: { id: shoppingRequestId } }),
    ]);
    expect(selected).toMatchObject({ status: "CANCELLED", statusBeforeCancellation: "APPROVED", activeShoppingRequestKey: null });
    expect([other.status, ownReceipt.status, otherReceipt.status, parent.status]).toEqual(["APPROVED", "CANCELLED", "DRAFT", "APPROVED"]);
  }, 30_000);
});
