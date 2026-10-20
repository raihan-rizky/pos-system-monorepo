import { NextResponse } from "next/server";
import { db, type Prisma } from "@pos/db";
import { z } from "zod";
import { getCurrentUser, requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { calculateTransactionTax, calculateTaxPaymentState, getTransactionTaxMethod } from "@/features/transaction-tax/helpers/tax-calculation";
import { getLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";
const log = getLogger("api:transactions:tax");
type Context = { params: Promise<{ id: string }> };
const select = { id: true, storeId: true, customerId: true, subtotal: true, discount: true, tax: true, taxRate: true, taxMethod: true, total: true, amountPaid: true, change: true, status: true, paymentMethod: true, printingSubcategory: true } as const;
type TaxRecord = Prisma.TransactionGetPayload<{ select: typeof select }>;
type TaxView = Omit<TaxRecord, "tax" | "taxRate" | "total" | "amountPaid" | "change"> & {
  tax: Prisma.Decimal | number; taxRate: Prisma.Decimal | number | null; total: Prisma.Decimal | number;
  amountPaid: Prisma.Decimal | number; change: Prisma.Decimal | number;
};
const schema = z.object({
  taxRate: z.number().min(0).max(100).refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8),
  expected: z.object({ total: z.number(), tax: z.number(), taxRate: z.number().nullable(), taxMethod: z.string(), amountPaid: z.number(), change: z.number(), status: z.string() }),
});

function snapshot(row: TaxView) {
  return { total: Number(row.total), tax: Number(row.tax), taxRate: row.taxRate == null ? null : Number(row.taxRate), taxMethod: row.taxMethod, amountPaid: Number(row.amountPaid), change: Number(row.change), status: row.status };
}
function payload(row: TaxView) {
  return { transaction: { id: row.id, subtotal: Number(row.subtotal), discount: Number(row.discount), paymentMethod: row.paymentMethod, ...snapshot(row) }, snapshot: snapshot(row) };
}
class TaxConflict extends Error {}
class TaxCustomerRequired extends Error {}

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Silakan masuk kembali." }, { status: 401 });
    const row = await db.transaction.findFirst({ where: { id: (await params).id, storeId: user.storeId || "store-main" }, select });
    if (!row) return NextResponse.json({ message: "Transaksi tidak ditemukan." }, { status: 404 });
    try {
      await requirePermission(row.status === "DRAFT" ? "transaction.draft" : "transaction", "read");
    } catch (error) {
      if (row.status === "DRAFT" || handleAuthError(error)?.status !== 403) throw error;
      await requirePermission("surat_jalan", "read");
    }
    return NextResponse.json(payload(row));
  } catch (error) {
    const auth = handleAuthError(error);
    if (auth) return auth;
    log.error("Failed to load tax:", error);
    return NextResponse.json({ message: "Pajak belum dapat dimuat. Silakan coba lagi." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ message: "Silakan masuk kembali." }, { status: 401 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ message: "Isi pajak 0–100% dengan maksimal dua angka desimal, lalu muat ulang nota bila perlu." }, { status: 422 });
    const storeId = user.storeId || "store-main";
    const id = (await params).id;
    const initial = await db.transaction.findFirst({ where: { id, storeId }, select });
    if (!initial) return NextResponse.json({ message: "Transaksi tidak ditemukan." }, { status: 404 });
    await requirePermission(initial.status === "DRAFT" ? "transaction.draft" : "transaction", "update");
    if (initial.printingSubcategory) return NextResponse.json({ message: "Pajak nota Percetakan yang sudah diproses tidak dapat diubah." }, { status: 409 });
    if (initial.status === "VOIDED" || initial.status === "REFUNDED") return NextResponse.json({ message: "Pajak transaksi yang dibatalkan atau direfund tidak dapat diubah." }, { status: 409 });
    const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      // Customer -> invoice follows the payment and reversal lock order.
      if (initial.customerId) await tx.$queryRawUnsafe('SELECT "id" FROM "pos_customers" WHERE "id" = $1 AND "storeId" = $2 FOR UPDATE', initial.customerId, storeId);
      await tx.$queryRawUnsafe('SELECT "id" FROM "pos_transactions" WHERE "id" = $1 AND "storeId" = $2 FOR UPDATE', id, storeId);
      const fresh = await tx.transaction.findFirst({ where: { id, storeId }, select });
      if (!fresh || fresh.printingSubcategory || fresh.customerId !== initial.customerId || fresh.status !== initial.status ||
          Object.entries(parsed.data.expected).some(([key, value]) => snapshot(fresh)[key as keyof ReturnType<typeof snapshot>] !== value)) throw new TaxConflict();
      const taxMethod = getTransactionTaxMethod(fresh);
      const totals = calculateTransactionTax({ subtotal: Number(fresh.subtotal), discount: Number(fresh.discount), taxRate: parsed.data.taxRate, taxMethod });
      const payment = calculateTaxPaymentState({ status: fresh.status, paymentMethod: fresh.paymentMethod, amountPaid: Number(fresh.amountPaid), change: Number(fresh.change), total: totals.total, previousTotal: Number(fresh.total) });
      if (!fresh.customerId && payment.remaining > 0 && totals.total > Number(fresh.total)) throw new TaxCustomerRequired();
      const data = { taxRate: parsed.data.taxRate, taxMethod, tax: totals.tax, total: totals.total, amountPaid: payment.amountPaid, change: payment.change, status: payment.status as TaxRecord["status"] };
      const result = await tx.transaction.updateMany({
        where: { id, storeId, customerId: fresh.customerId, status: fresh.status, subtotal: fresh.subtotal, discount: fresh.discount, total: fresh.total, tax: fresh.tax, taxRate: fresh.taxRate, taxMethod: fresh.taxMethod, amountPaid: fresh.amountPaid, change: fresh.change }, data,
      });
      if (result.count !== 1) throw new TaxConflict();
      if (fresh.customerId && (fresh.status === "COMPLETED" || fresh.status === "DP")) {
        const oldPaid = Math.min(Number(fresh.total), Math.max(0, Number(fresh.amountPaid) - Number(fresh.change)));
        const oldDebt = fresh.status === "DP" || fresh.paymentMethod === "TEMPO" ? Math.max(0, Number(fresh.total) - oldPaid) : 0;
        const debtDelta = Math.round((payment.remaining - oldDebt) * 100) / 100;
        const spentDelta = Math.round((Math.min(payment.amountPaid, totals.total) - oldPaid) * 100) / 100;
        if (debtDelta !== 0 || spentDelta !== 0) {
          const customer = await tx.customer.updateMany({
            where: { id: fresh.customerId, storeId, ...(debtDelta < 0 ? { totalDebt: { gte: -debtDelta } } : {}), ...(spentDelta < 0 ? { totalSpent: { gte: -spentDelta } } : {}) },
            data: { ...(debtDelta !== 0 ? { totalDebt: { increment: debtDelta } } : {}), ...(spentDelta !== 0 ? { totalSpent: { increment: spentDelta } } : {}) },
          });
          if (customer.count !== 1) throw new TaxConflict();
        }
      }
      return { ...fresh, ...data };
    });
    return NextResponse.json(payload(updated));
  } catch (error) {
    const auth = handleAuthError(error);
    if (auth) return auth;
    if (error instanceof TaxCustomerRequired) return NextResponse.json({ message: "Pilih pelanggan pada transaksi sebelum menambah pajak yang menimbulkan sisa tagihan." }, { status: 422 });
    if (error instanceof TaxConflict || (error as { code?: string }).code === "P2034") return NextResponse.json({ message: "Transaksi atau saldo pelanggan berubah. Tutup dan buka kembali nota sebelum mencoba lagi." }, { status: 409 });
    if (error instanceof SyntaxError) return NextResponse.json({ message: "Data pajak tidak valid." }, { status: 400 });
    log.error("Failed to save tax:", error);
    return NextResponse.json({ message: "Pajak gagal disimpan. Silakan coba lagi." }, { status: 500 });
  }
}
