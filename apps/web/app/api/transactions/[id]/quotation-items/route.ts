import { NextResponse } from "next/server";
import { db, type Prisma } from "@pos/db";
import { z } from "zod";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { calculateQuotationTotals, MAX_QUOTATION_AMOUNT, roundQuotationAmount } from "@/features/nota-penawaran/helpers/quotation-items";

export const dynamic = "force-dynamic";
const log = getLogger("api:transactions:quotation-items");
type Context = { params: Promise<{ id: string }> };

const itemSelect = {
  id: true, productId: true, productName: true, documentName: true, quotationUnit: true,
  quotationPosition: true, quantity: true, unitPrice: true, subtotal: true,
} as const;
const totalsSelect = {
  id: true, status: true, subtotal: true, discount: true, tax: true, taxRate: true,
  taxMethod: true, total: true, paymentMethod: true, amountPaid: true, change: true,
} as const;
type QuotationRecord = Prisma.TransactionItemGetPayload<{ select: typeof itemSelect }>;
type TotalsRecord = Prisma.TransactionGetPayload<{ select: typeof totalsSelect }>;

const schema = z.object({
  items: z.array(z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(300),
    quantity: z.number().int().positive().max(2_147_483_647),
    unit: z.string().trim().max(40),
    unitPrice: z.number().nonnegative().max(MAX_QUOTATION_AMOUNT)
      .refine(price => Math.abs(price - roundQuotationAmount(price)) < 1e-8),
    productId: z.string().min(1).max(100).nullable(),
  }).strict()).min(1).max(100),
}).strict().refine(({ items }) => new Set(items.map(item => item.id)).size === items.length);

class QuotationError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function readDraft(client: Pick<Prisma.TransactionClient, "transaction">, id: string, storeId: string) {
  const draft = await client.transaction.findFirst({
    where: { id, storeId },
    select: {
      ...totalsSelect,
      items: { where: { quotationUnit: { not: null } }, orderBy: [{ quotationPosition: "asc" }, { id: "asc" }], select: itemSelect },
    },
  });
  if (!draft) throw new QuotationError(404, "Nota penawaran tidak ditemukan.");
  if (draft.status !== "DRAFT") throw new QuotationError(409, "Baris tambahan hanya dapat disimpan pada faktur sementara yang aktif.");
  return draft;
}

function publicItem(row: Omit<QuotationRecord, "unitPrice" | "subtotal"> & { unitPrice: unknown; subtotal: unknown }) {
  return { ...row, unitPrice: Number(row.unitPrice), subtotal: Number(row.subtotal), size: null, material: null };
}

function taxResponse(row: TotalsRecord) {
  const snapshot = {
    total: Number(row.total), tax: Number(row.tax), taxRate: row.taxRate == null ? null : Number(row.taxRate),
    taxMethod: row.taxMethod, status: row.status, amountPaid: Number(row.amountPaid), change: Number(row.change),
  };
  return {
    transaction: { id: row.id, subtotal: Number(row.subtotal), discount: Number(row.discount), paymentMethod: row.paymentMethod, ...snapshot },
    snapshot,
  };
}

function respondToError(error: unknown) {
  const authResponse = handleAuthError(error);
  if (authResponse) return authResponse;
  if (error instanceof QuotationError) return NextResponse.json({ message: error.message }, { status: error.status });
  const code = (error as { code?: string } | null)?.code;
  if (code === "P2034" || code === "P2002") {
    return NextResponse.json({ message: "Nota penawaran sedang berubah. Silakan coba simpan kembali." }, { status: 409 });
  }
  log.error("Gagal memproses baris tambahan nota penawaran.", error);
  return NextResponse.json({ message: "Baris tambahan belum dapat diproses. Silakan coba lagi." }, { status: 500 });
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const user = await requirePermission("transaction.draft", "read");
    const draft = await readDraft(db, (await params).id, user.storeId || "store-main");
    return NextResponse.json({ items: draft.items.map(publicItem) });
  } catch (error) {
    return respondToError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    const user = await requirePermission("transaction.draft", "update");
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new QuotationError(422, "Periksa nama, jumlah, satuan, dan harga barang tambahan.");
    const { items } = parsed.data;
    if (items.some(item => item.productId)) await requirePermission("product", "read");
    const { id } = await params;
    const storeId = user.storeId || "store-main";

    const result = await db.$transaction(async tx => {
      await tx.$queryRaw`
        SELECT "id" FROM "pos_transactions" WHERE "id" = ${id} AND "storeId" = ${storeId} FOR UPDATE
      `;
      const draft = await readDraft(tx, id, storeId);
      const existingById = new Map(draft.items.map(item => [item.id, item]));
      const additions = items.filter(item => {
        const saved = existingById.get(item.id);
        if (!saved) return true;
        if (saved.documentName !== item.name || saved.productId !== item.productId || saved.quantity !== item.quantity ||
            Number(saved.unitPrice) !== item.unitPrice || (!item.productId && saved.quotationUnit !== item.unit)) {
          throw new QuotationError(409, "Baris ini sudah berubah. Tutup dan buka kembali nota sebelum menyimpan.");
        }
        return false;
      });
      if (!additions.length) return { items: draft.items.map(publicItem), tax: taxResponse(draft) };

      const productIds = [...new Set(additions.flatMap(item => item.productId ? [item.productId] : []))];
      const products = productIds.length ? await tx.product.findMany({
        where: { id: { in: productIds }, storeId, isActive: true },
        select: { id: true, name: true, unit: true, costPrice: true },
      }) : [];
      const productsById = new Map(products.map(product => [product.id, product]));
      const lastPosition = draft.items.reduce((last, item) => Math.max(last, item.quotationPosition ?? 0), 0);
      const rows = additions.map((item, index) => {
        const product = item.productId ? productsById.get(item.productId) : undefined;
        if (item.productId && !product) throw new QuotationError(422, "Produk yang dikaitkan sudah tidak tersedia. Silakan pilih produk lagi.");
        const quotationUnit = product?.unit ?? item.unit;
        if (quotationUnit.length > 40) throw new QuotationError(422, "Satuan barang maksimal 40 karakter.");
        return {
          id: item.id, transactionId: id, productId: item.productId, productName: product?.name ?? item.name,
          documentName: item.name, quotationUnit, quotationPosition: lastPosition + index + 1, quantity: item.quantity, unitPrice: item.unitPrice,
          subtotal: roundQuotationAmount(item.quantity * item.unitPrice), unitCost: product?.costPrice ?? null,
        };
      });
      const addedSubtotal = roundQuotationAmount(rows.reduce((total, row) => total + row.subtotal, 0));
      const totals = calculateQuotationTotals(draft, addedSubtotal);
      if (totals.subtotal > MAX_QUOTATION_AMOUNT || totals.total > MAX_QUOTATION_AMOUNT) {
        throw new QuotationError(422, "Total nota penawaran melebihi batas nominal.");
      }
      await tx.transactionItem.createMany({ data: rows });
      const updated = await tx.transaction.update({ where: { id }, data: totals, select: totalsSelect });
      return {
        items: [...draft.items.map(publicItem), ...rows.map(({ transactionId: _transactionId, unitCost: _cost, ...row }) => publicItem(row))],
        tax: taxResponse(updated),
      };
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(result);
  } catch (error) {
    return respondToError(error);
  }
}
