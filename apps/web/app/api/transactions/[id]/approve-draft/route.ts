import { after, NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import {
  AuthError,
  handleAuthError,
  requirePermission,
} from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import {
  compactJakartaDateKey,
  jakartaDateKey,
  requiresInvoiceDateReason,
  resolveInvoiceDateTime,
} from "@/features/invoice-date/helpers/invoice-date-core";
import { buildCustomerUpdateArgs } from "@/features/pos-checkout/post-commit";
import {
  applyProductStockDeltas,
  StockMutationError,
} from "@/features/product-stock-groups/stock-mutations";

const log = getLogger("api:transactions:approve-draft");

export const dynamic = "force-dynamic";

const approveDraftSchema = z.object({
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "QRIS", "TRANSFER"]),
  amountPaid: z.number().min(0),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  invoiceTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional().nullable(),
  invoiceDateReason: z.string().optional().nullable(),
});

const MAX_ATTEMPTS = 5;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requirePermission("transaction.draft", "update");
    const storeId = user.storeId || "store-main";
    const { id } = await params;

    const body = await request.json();
    const parsed = approveDraftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 },
      );
    }
    const { paymentMethod, amountPaid, invoiceDate, invoiceTime, invoiceDateReason } = parsed.data;

    const draft = await db.transaction.findFirst({
      where: { id, storeId },
      include: {
        items: true,
        salesperson: { select: { name: true } },
      },
    });

    if (!draft) {
      return NextResponse.json(
        { message: "Faktur sementara tidak ditemukan" },
        { status: 404 },
      );
    }

    if (draft.status !== "DRAFT") {
      return NextResponse.json(
        { message: "Faktur ini bukan draft" },
        { status: 409 },
      );
    }

    // SALES cannot approve a SALES-created draft (preserves existing fraud control)
    if (user.role === "SALES" && draft.requestedById) {
      throw new AuthError(403, "Insufficient permissions");
    }

    const total = Number(draft.total);
    if (amountPaid <= 0) {
      return NextResponse.json(
        { message: "Pembayaran harus lebih dari 0" },
        { status: 422 },
      );
    }

    const isDP = amountPaid > 0 && amountPaid < total;
    const finalAmountPaid = amountPaid > total ? total : amountPaid;
    const change = amountPaid > total ? amountPaid - total : 0;
    const newStatus = isDP ? "DP" : "COMPLETED";

    const now = new Date();
    const hasCustomInvoiceDate = Boolean(invoiceDate || invoiceTime);
    if (hasCustomInvoiceDate && user.role !== "OWNER" && user.role !== "ADMIN") {
      return NextResponse.json(
        { message: "Hanya Owner atau Admin yang boleh mengatur tanggal invoice." },
        { status: 403 },
      );
    }

    const resolvedInvoiceDate = hasCustomInvoiceDate
      ? resolveInvoiceDateTime({
          mode: "edit",
          date: invoiceDate ?? jakartaDateKey(draft.invoiceDate ?? now),
          time: invoiceTime,
          now,
          previousInvoiceDate: draft.invoiceDate ?? now,
        })
      : draft.invoiceDate ?? now;
    const dateStr = compactJakartaDateKey(resolvedInvoiceDate);

    if (
      hasCustomInvoiceDate &&
      requiresInvoiceDateReason({ invoiceDate: resolvedInvoiceDate, now }) &&
      !invoiceDateReason?.trim()
    ) {
      return NextResponse.json(
        { message: "Alasan wajib diisi untuk tanggal invoice beda hari." },
        { status: 422 },
      );
    }

    let updated: { invoiceNumber: string } | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        updated = await db.$transaction(
          async (tx) => {
            // Compute next invoice number from real-sales counter
            const todayCount = await tx.transaction.count({
              where: {
                storeId,
                invoiceNumber: { startsWith: `INV-${dateStr}-` },
              },
            });
            const invoiceNumber = `INV-${dateStr}-${String(
              todayCount + 1 + attempt,
            ).padStart(4, "0")}`;

            const updateResult = await tx.transaction.updateMany({
              where: { id, storeId, status: "DRAFT" },
              data: {
                status: newStatus,
                invoiceNumber,
                invoiceDate: resolvedInvoiceDate,
                cashierId: user.id,
                paymentMethod,
                amountPaid: finalAmountPaid,
                change,
                productionStatus: draft.isJobOrder ? "PRINTING" : null,
              },
            });

            if (updateResult.count !== 1) {
              throw new Error("DRAFT_NOT_FOUND");
            }

            await applyProductStockDeltas(tx, {
              storeId,
              items: draft.items.flatMap((item) =>
                item.productId
                  ? [{ productId: item.productId, delta: -item.quantity }]
                  : [],
              ),
            });

            return { invoiceNumber };
          },
          { maxWait: 5000, timeout: 15000 },
        );
        break;
      } catch (err) {
        if (
          (err as { code?: string })?.code === "P2002" &&
          attempt < MAX_ATTEMPTS - 1
        ) {
          log.warn(
            `invoiceNumber collision on attempt ${attempt + 1}, retrying`,
          );
          continue;
        }
        throw err;
      }
    }

    if (!updated) {
      throw new Error("APPROVE_FAILED");
    }

    const inventoryRows = draft.items.map((item) => ({
      productId: item.productId!,
      type: "OUT" as const,
      quantity: item.quantity,
      note: `Approve Draft ${draft.draftNumber} → ${updated!.invoiceNumber}`,
      createdBy: user.id,
      person: user.name ?? null,
    }));
    const customerArgs = buildCustomerUpdateArgs({
      customerId: draft.customerId || null,
      isDP,
      total,
      amountPaid: finalAmountPaid,
    });

    after(async () => {
      try {
        await Promise.all([
          inventoryRows.length > 0
            ? db.inventoryLog.createMany({ data: inventoryRows })
            : Promise.resolve(),
          customerArgs ? db.customer.update(customerArgs) : Promise.resolve(),
        ]);
      } catch (sideEffectError) {
        log.error(
          `Post-approval side effects failed for ${updated!.invoiceNumber}:`,
          sideEffectError,
        );
      }
    });

    return NextResponse.json(
      {
        ...draft,
        status: newStatus,
        invoiceNumber: updated.invoiceNumber,
        invoiceDate: resolvedInvoiceDate,
        cashierId: user.id,
        paymentMethod,
        amountPaid: finalAmountPaid,
        change,
      },
      { status: 200 },
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    if (
      error instanceof StockMutationError &&
      error.message === "INSUFFICIENT_STOCK"
    ) {
      return NextResponse.json(
        { message: "Stok produk tidak mencukupi" },
        { status: 409 },
      );
    }
    if (
      error instanceof StockMutationError &&
      error.message === "CONVERSION_NEEDS_REVIEW"
    ) {
      return NextResponse.json(
        { message: "Konversi unit produk perlu direview sebelum stok bisa diproses" },
        { status: 422 },
      );
    }
    if (error instanceof Error && error.message === "DRAFT_NOT_FOUND") {
      return NextResponse.json(
        { message: "Faktur sementara tidak ditemukan atau sudah berubah" },
        { status: 409 },
      );
    }

    log.error("Failed to approve draft:", error);
    return NextResponse.json(
      { message: "Failed to approve draft" },
      { status: 500 },
    );
  }
}
