import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { discountedLineSubtotal } from "@/features/pos-checkout/helpers/item-discount";
import { calculateTaxPaymentState, calculateTransactionTax, getTransactionTaxMethod, getTransactionTaxRate } from "@/features/transaction-tax/helpers/tax-calculation";
import { handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { z } from "zod";
import {
  applyProductStockDeltas,
  StockMutationError,
} from "@/features/product-stock-groups/stock-mutations";
import { isStockMutationConflict, lockStockMutationRows } from "@/features/product-stock-groups/stock-group-lock";

const patchItemsSchema = z.object({
  items: z.array(
    z.object({
      sourceItemId: z.string().min(1).nullable().optional(),
      productId: z.string().nullable().optional().transform(val => val === "" ? null : val),
      productName: z.string(),
      quantity: z.number().int().positive(),
      unitPrice: z.number().nonnegative(),
      appliedUnitPrice: z.number().nonnegative(),
      originalUnitPrice: z.number().nonnegative(),
      subtotal: z.number().nonnegative(),
      discount: z.number().finite().nonnegative().multipleOf(0.01).optional(),
    })
  ),
});

// Statuses whose stock was already moved at creation and must therefore be
// reconciled when items change. PENDING_APPROVAL / DRAFT requests have not
// deducted stock yet, so editing them only rewrites lines. VOIDED / REFUNDED
// are terminal and not editable.
const STOCK_APPLIED_STATUSES = new Set(["COMPLETED", "DP"]);
const EDITABLE_STATUSES = new Set([
  "PENDING_APPROVAL",
  "DRAFT",
  "COMPLETED",
  "DP",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("transaction", "update");
    const id = (await params).id;
    const storeId = user.storeId || "store-main";

    const body = await request.json();
    const result = patchItemsSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ message: "Invalid payload", errors: result.error.issues }, { status: 400 });
    }

    const { items } = result.data;

    const existingTx = await db.transaction.findFirst({
      where: { id, storeId },
      select: {
        id: true,
        status: true,
        printingSubcategory: true,
        subtotal: true,
        discount: true,
        tax: true,
        taxRate: true,
        taxMethod: true,
        total: true,
        amountPaid: true,
        change: true,
        customerId: true,
        paymentMethod: true,
        invoiceNumber: true,
        stockDeductionSource: true,
        items: true,
      },
    });

    if (!existingTx) {
      return NextResponse.json({ message: "Transaction not found" }, { status: 404 });
    }

    if (existingTx.printingSubcategory) {
      return NextResponse.json({ message: "Isi nota Percetakan yang sudah diproses tersimpan sebagai dokumen tetap." }, { status: 409 });
    }

    if (!EDITABLE_STATUSES.has(existingTx.status)) {
      return NextResponse.json(
        { message: `Transaksi dengan status ${existingTx.status} tidak dapat diubah` },
        { status: 409 },
      );
    }

    // Reserve explicit identities before matching older clients' unnamed rows.
    // A changed product must be verified as a sibling unit under lock below.
    const sourceIds = new Set<string>();
    for (const item of items) {
      if (!item.sourceItemId) continue;
      const source = existingTx.items.find(old => old.id === item.sourceItemId);
      if (sourceIds.has(item.sourceItemId) || !source ||
          (!source.productId && (item.productId || source.productName !== item.productName)) ||
          (source.productId && !item.productId)) {
        return NextResponse.json({ message: "Identitas item tidak sesuai. Muat ulang transaksi lalu coba lagi." }, { status: 400 });
      }
      sourceIds.add(item.sourceItemId);
    }
    const normalizedItems = items.map(item => {
      let source = item.sourceItemId
        ? existingTx.items.find(old => old.id === item.sourceItemId)
        : undefined;
      if (!item.sourceItemId) {
        const matches = existingTx.items.filter(old =>
          (old.productId ?? null) === (item.productId ?? null) &&
          (old.productId || old.productName === item.productName));
        const available = matches.filter(old => !sourceIds.has(old.id));
        if (matches.length === 1 && available.length === 1) {
          source = available[0];
          sourceIds.add(source.id);
        } else if (available.some(old => Number(old.discount ?? 0) > 0)) {
          throw new Error("ITEM_DISCOUNT_SOURCE_REQUIRED");
        }
      }
      const gross = discountedLineSubtotal(item.appliedUnitPrice, item.quantity);
      const discount = item.discount === undefined
        ? Math.min(gross, Math.max(0, Number(source?.discount ?? 0)))
        : item.discount;
      if (gross > 9_999_999_999.99 || discount > gross) throw new Error("ITEM_DISCOUNT_INVALID");
      return { ...item, sourceItemId: source?.id ?? null, discount, subtotal: discountedLineSubtotal(item.appliedUnitPrice, item.quantity, discount) };
    });
    const subtotal = normalizedItems.reduce((sum, item) => sum + item.subtotal, 0);
    const discount = Number(existingTx.discount ?? 0);
    const { tax, total } = calculateTransactionTax({
      subtotal, discount,
      taxRate: getTransactionTaxRate(existingTx),
      taxMethod: getTransactionTaxMethod(existingTx),
    });
    if (subtotal > 9_999_999_999.99 || total > 9_999_999_999.99) throw new Error("ITEM_DISCOUNT_INVALID");

    // Build the net stock delta only for sales that already moved stock.
    // delta sign: positive restores stock, negative deducts it. We restore the
    // full old quantities and deduct the full new quantities; applyProductStockDeltas
    // merges per product, so a quantity bump nets to just the difference.
    const stockDeltas = new Map<string, number>();
    if (STOCK_APPLIED_STATUSES.has(existingTx.status)) {
      for (const old of existingTx.items) {
        if (!old.productId) continue;
        stockDeltas.set(old.productId, (stockDeltas.get(old.productId) ?? 0) + old.quantity);
      }
      for (const next of normalizedItems) {
        if (!next.productId) continue;
        stockDeltas.set(next.productId, (stockDeltas.get(next.productId) ?? 0) - next.quantity);
      }
    }
    const stockDeltaItems = Array.from(stockDeltas.entries())
      .filter(([, delta]) => delta !== 0)
      .map(([productId, delta]) => ({ productId, delta }));

    await db.$transaction(async (tx) => {
      // Match the lock order used by payment and tax corrections.
      if (existingTx.customerId) {
        await tx.$queryRaw`SELECT "id" FROM "pos_customers" WHERE "id" = ${existingTx.customerId} AND "storeId" = ${storeId} FOR UPDATE`;
      }
      // Refresh saved names only after locking the parent, so a concurrent
      // document-name save cannot be overwritten by the earlier item snapshot.
      await tx.$queryRaw`
        SELECT "id" FROM "pos_transactions"
        WHERE "id" = ${id} AND "storeId" = ${storeId}
        FOR UPDATE
      `;
      const current = await tx.transaction.findFirst({
        where: { id, storeId },
        select: { status: true, customerId: true, paymentMethod: true, total: true, amountPaid: true, change: true, discount: true, tax: true, taxRate: true, taxMethod: true, stockDeductionSource: true, items: true },
      });
      const previousIds = new Set(existingTx.items.map(item => item.id));
      if (!current || current.status !== existingTx.status || current.customerId !== existingTx.customerId ||
          current.paymentMethod !== existingTx.paymentMethod || Number(current.total) !== Number(existingTx.total) ||
          Number(current.amountPaid) !== Number(existingTx.amountPaid) || Number(current.change) !== Number(existingTx.change) ||
          Number(current.discount) !== Number(existingTx.discount) || Number(current.tax) !== Number(existingTx.tax) ||
          String(current.taxRate) !== String(existingTx.taxRate) || current.taxMethod !== existingTx.taxMethod || current.stockDeductionSource !== existingTx.stockDeductionSource ||
          current.items.length !== existingTx.items.length ||
          current.items.some(item => {
            const previous = existingTx.items.find(old => old.id === item.id);
            return !previousIds.has(item.id) || !previous || item.productId !== previous.productId ||
              item.productName !== previous.productName || item.quantity !== previous.quantity ||
              Number(item.unitPrice) !== Number(previous.unitPrice) || Number(item.appliedUnitPrice) !== Number(previous.appliedUnitPrice) ||
              Number(item.originalUnitPrice) !== Number(previous.originalUnitPrice) || Number(item.discount) !== Number(previous.discount) ||
              Number(item.subtotal) !== Number(previous.subtotal);
          })) {
        throw new Error("TRANSACTION_ITEMS_CHANGED");
      }
      const currentNames = new Map(current.items.map(item => [item.id, item.documentName]));
      const payment = calculateTaxPaymentState({
        status: existingTx.status, paymentMethod: existingTx.paymentMethod,
        amountPaid: Number(existingTx.amountPaid), change: Number(existingTx.change),
        total, previousTotal: Number(existingTx.total),
      });
      if (!existingTx.customerId && payment.remaining > 0 && total > Number(existingTx.total)) {
        throw new Error("ITEM_CUSTOMER_REQUIRED");
      }
      const unitChanges = normalizedItems.flatMap(item => {
        const source = existingTx.items.find(old => old.id === item.sourceItemId);
        return source?.productId && item.productId && source.productId !== item.productId
          ? [{ from: source.productId, to: item.productId }]
          : [];
      });
      const shipmentItems = await tx.suratJalanItem.findMany({
        where: { transactionItemId: { in: [...previousIds] } },
        select: { transactionItemId: true },
      });
      for (const shipmentItem of shipmentItems) {
        const previous = existingTx.items.find(item => item.id === shipmentItem.transactionItemId);
        const next = normalizedItems.find(item => item.sourceItemId === shipmentItem.transactionItemId);
        if (!previous || !next || previous.productId !== next.productId || previous.quantity !== next.quantity) {
          throw new Error("ITEM_HAS_SHIPMENT");
        }
      }
      const newProductIds = normalizedItems.flatMap(item => !item.sourceItemId && item.productId ? [item.productId] : []);
      if (STOCK_APPLIED_STATUSES.has(existingTx.status) && existingTx.items.some(old =>
        old.rawMaterialProductId && !normalizedItems.some(item => item.sourceItemId === old.id),
      )) throw new Error("ITEM_MATERIAL_LINKED");
      const changedProducts = new Map<string, { costPrice: (typeof existingTx.items)[number]["unitCost"]; size: string | null; material: string | null }>();
      if (unitChanges.length > 0 || stockDeltaItems.length > 0 || newProductIds.length > 0) {
        if (stockDeltaItems.length > 0 && existingTx.stockDeductionSource === "SURAT_JALAN") throw new Error("ITEM_STOCK_HISTORY_REQUIRED");
        const expectedStock = new Map<string, number>();
        if (stockDeltaItems.length > 0) {
          for (const old of existingTx.items) {
            if (old.productId) expectedStock.set(old.productId, (expectedStock.get(old.productId) ?? 0) + old.quantity);
            if (old.rawMaterialProductId && old.rawMaterialQuantity) expectedStock.set(old.rawMaterialProductId, (expectedStock.get(old.rawMaterialProductId) ?? 0) + old.rawMaterialQuantity);
          }
        }
        const journal = stockDeltaItems.length > 0 ? await tx.inventoryLog.findMany({
          where: { OR: [{ transactionId: id }, { sourceTransactionRef: id }] },
          select: { productId: true, status: true, stockGroupIdSnapshot: true, unitMultiplierSnapshot: true, stockBaseDelta: true },
        }) : [];
        const productIds = [...new Set([
          ...unitChanges.flatMap(change => [change.from, change.to]),
          ...stockDeltaItems.map(item => item.productId),
          ...newProductIds,
          ...expectedStock.keys(),
          ...journal.map(row => row.productId),
        ])];
        const hints = await tx.product.findMany({
          where: { storeId, id: { in: productIds } },
          select: { id: true, stockGroupId: true },
        });
        if (hints.length !== productIds.length) throw new Error("ITEM_UNIT_INVALID");
        const locks = await lockStockMutationRows(tx, {
          storeId, productIds,
          stockGroupIds: hints.flatMap(product => product.stockGroupId ? [product.stockGroupId] : []),
        });
        if (locks.lockedProductIds.length !== productIds.length) throw new Error("ITEM_UNIT_INVALID");
        const products = await tx.product.findMany({
          where: { storeId, id: { in: productIds } },
          select: { id: true, stockGroupId: true, unitMultiplierToBase: true, conversionNeedsReview: true, isActive: true, costPrice: true, size: true, material: true },
        });
        const byId = new Map(products.map(product => [product.id, product]));
        if (hints.some(hint => byId.get(hint.id)?.stockGroupId !== hint.stockGroupId)) throw new Error("ITEM_UNIT_INVALID");
        for (const change of unitChanges) {
          const from = byId.get(change.from);
          const to = byId.get(change.to);
          if (!from?.stockGroupId || !to?.isActive || to.stockGroupId !== from.stockGroupId) throw new Error("ITEM_UNIT_INVALID");
          changedProducts.set(to.id, to);
        }
        for (const productId of newProductIds) {
          const product = byId.get(productId);
          if (!product?.isActive) throw new Error("ITEM_UNIT_INVALID");
          changedProducts.set(product.id, product);
        }
        if (stockDeltaItems.length > 0) {
          const actualStock = new Map<string, number>();
          for (const row of journal) {
            const product = byId.get(row.productId);
            const multiplier = product?.stockGroupId ? Number(product.unitMultiplierToBase) : 1;
            if (!product || product.conversionNeedsReview || row.status !== "APPROVED" || row.stockBaseDelta == null ||
                !Number.isFinite(row.stockBaseDelta) || row.stockGroupIdSnapshot !== product.stockGroupId ||
                row.unitMultiplierSnapshot == null || !Number.isFinite(multiplier) || multiplier <= 0 ||
                Math.abs(row.unitMultiplierSnapshot - multiplier) > 1e-10 * Math.max(1, multiplier)) {
              throw new Error("ITEM_STOCK_HISTORY_REQUIRED");
            }
            actualStock.set(row.productId, (actualStock.get(row.productId) ?? 0) + row.stockBaseDelta);
          }
          for (const productId of new Set([...expectedStock.keys(), ...actualStock.keys()])) {
            const product = byId.get(productId);
            const multiplier = product?.stockGroupId ? Number(product.unitMultiplierToBase) : 1;
            const expected = (expectedStock.get(productId) ?? 0) * multiplier;
            if (!product || !Number.isFinite(expected) || Math.abs((actualStock.get(productId) ?? 0) + expected) > 1e-7 * Math.max(1, expected)) {
              throw new Error("ITEM_STOCK_HISTORY_REQUIRED");
            }
          }
          if (existingTx.invoiceNumber) {
            const legacy = await tx.inventoryLog.findFirst({
              where: { transactionId: null, sourceTransactionRef: null, suratJalanId: null, status: "APPROVED", type: "OUT", reason: { in: ["SALE", "USAGE"] }, note: { contains: existingTx.invoiceNumber } },
              select: { id: true },
            });
            if (legacy) throw new Error("ITEM_STOCK_HISTORY_REQUIRED");
          }
        }
      }
      if (stockDeltaItems.length > 0) {
        // Return the old unit before deducting the replacement, so a swap can
        // use stock released by the same edit even when the group was empty.
        const returned = await applyProductStockDeltas(tx, { storeId, items: stockDeltaItems.filter(item => item.delta > 0) });
        const deducted = await applyProductStockDeltas(tx, { storeId, items: stockDeltaItems.filter(item => item.delta < 0) });
        const deltaByProduct = new Map(stockDeltaItems.map(item => [item.productId, item.delta]));
        await tx.inventoryLog.createMany({ data: [...returned, ...deducted].map(movement => {
          const quantity = Math.abs(deltaByProduct.get(movement.productId)!);
          return {
            productId: movement.productId, type: movement.baseDelta > 0 ? "IN" as const : "OUT" as const,
            reason: "SALE" as const, status: "APPROVED" as const, quantity,
            createdBy: user.id, person: user.name ?? null, note: `Koreksi produk ${existingTx.invoiceNumber ?? id}`,
            transactionId: id, sourceTransactionRef: id, stockGroupIdSnapshot: movement.stockGroupId,
            unitMultiplierSnapshot: movement.stockGroupId ? Math.abs(movement.baseDelta) / quantity : 1,
            stockBaseDelta: movement.baseDelta,
          };
        }) });
      }

      const itemWrites = normalizedItems.map(item => {
        const source = existingTx.items.find(old => old.id === item.sourceItemId);
        const sameProduct = source?.productId === item.productId;
        const samePrice = sameProduct && Number(source?.appliedUnitPrice ?? source?.unitPrice) === item.appliedUnitPrice;
        const selected = item.productId ? changedProducts.get(item.productId) : undefined;
        return {
          sourceItemId: item.sourceItemId,
          data: {
            productId: item.productId,
            productName: item.productName,
            documentName: item.sourceItemId ? currentNames.get(item.sourceItemId) ?? null : null,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            appliedUnitPrice: item.appliedUnitPrice,
            originalUnitPrice: item.originalUnitPrice,
            subtotal: item.subtotal,
            discount: item.discount,
            unitCost: sameProduct ? source?.unitCost : selected?.costPrice,
            size: sameProduct ? source?.size : selected?.size,
            material: sameProduct ? source?.material : selected?.material,
            printingServiceId: source?.printingServiceId,
            rawMaterialProductId: source?.rawMaterialProductId,
            rawMaterialQuantity: source?.rawMaterialQuantity,
            rawMaterialUnit: source?.rawMaterialUnit,
            serviceNote: source?.serviceNote,
            pricingRuleId: samePrice ? source?.pricingRuleId : null,
            pricingCustomerType: samePrice ? source?.pricingCustomerType : null,
            pricingCategoryId: samePrice ? source?.pricingCategoryId : null,
            pricingCategoryName: samePrice ? source?.pricingCategoryName : null,
            pricingMode: samePrice ? source?.pricingMode : null,
            pricingValue: samePrice ? source?.pricingValue : null,
            pricingDiscountPercent: samePrice ? source?.pricingDiscountPercent : null,
            pricingUnit: samePrice ? source?.pricingUnit : null,
            pricingBrandId: samePrice ? source?.pricingBrandId : null,
            pricingBrandName: samePrice ? source?.pricingBrandName : null,
          },
        };
      });
      const retainedIds = itemWrites.flatMap(item => item.sourceItemId ? [item.sourceItemId] : []);
      await tx.transaction.update({
        where: { id },
        data: {
          subtotal,
          tax,
          total,
          ...(total !== Number(existingTx.total) ? {
            amountPaid: payment.amountPaid,
            change: payment.change,
            status: payment.status as "COMPLETED" | "DP" | "PENDING_APPROVAL" | "DRAFT",
          } : {}),
          items: {
            deleteMany: { id: { notIn: retainedIds } },
            update: itemWrites.filter(item => item.sourceItemId).map(item => ({ where: { id: item.sourceItemId! }, data: item.data })),
            create: itemWrites.filter(item => !item.sourceItemId).map(item => item.data),
          },
        },
      });
      if (existingTx.customerId && STOCK_APPLIED_STATUSES.has(existingTx.status) && total !== Number(existingTx.total)) {
        const oldPaid = Math.min(Number(existingTx.total), Math.max(0, Number(existingTx.amountPaid) - Number(existingTx.change)));
        const oldDebt = existingTx.status === "DP" || existingTx.paymentMethod === "TEMPO"
          ? Math.max(0, Number(existingTx.total) - oldPaid) : 0;
        const debtDelta = Math.round((payment.remaining - oldDebt) * 100) / 100;
        const spentDelta = Math.round((Math.min(payment.amountPaid, total) - oldPaid) * 100) / 100;
        if (debtDelta !== 0 || spentDelta !== 0) {
          const updatedCustomer = await tx.customer.updateMany({
            where: { id: existingTx.customerId, storeId, ...(debtDelta < 0 ? { totalDebt: { gte: -debtDelta } } : {}), ...(spentDelta < 0 ? { totalSpent: { gte: -spentDelta } } : {}) },
            data: { ...(debtDelta !== 0 ? { totalDebt: { increment: debtDelta } } : {}), ...(spentDelta !== 0 ? { totalSpent: { increment: spentDelta } } : {}) },
          });
          if (updatedCustomer.count !== 1) throw new Error("TRANSACTION_ITEMS_CHANGED");
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;

    if (error instanceof Error && error.message === "TRANSACTION_ITEMS_CHANGED") {
      return NextResponse.json({ message: "Item atau status transaksi sudah berubah. Muat ulang transaksi lalu coba lagi." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ITEM_DISCOUNT_SOURCE_REQUIRED") {
      return NextResponse.json({ message: "Pilih identitas item yang sesuai agar diskon tetap tersimpan. Muat ulang transaksi lalu coba lagi." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "ITEM_DISCOUNT_INVALID") {
      return NextResponse.json({ message: "Diskon tidak boleh melebihi total item, dan jumlah harga harus valid." }, { status: 400 });
    }
    if (error instanceof Error && error.message === "ITEM_UNIT_INVALID") {
      return NextResponse.json({ message: "Satuan produk berubah atau tidak tersedia. Muat ulang transaksi lalu coba lagi." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ITEM_CUSTOMER_REQUIRED") {
      return NextResponse.json({ message: "Transaksi tanpa pelanggan terdaftar tidak dapat menyisakan tagihan. Pastikan total tidak melebihi pembayaran." }, { status: 422 });
    }
    if (error instanceof Error && error.message === "ITEM_STOCK_HISTORY_REQUIRED") {
      return NextResponse.json({ message: "Riwayat stok transaksi perlu diperiksa sebelum jumlah atau satuan diubah." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ITEM_HAS_SHIPMENT") {
      return NextResponse.json({ message: "Produk yang sudah tercantum pada Surat Jalan tidak dapat dihapus atau diubah jumlah dan satuannya." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "ITEM_MATERIAL_LINKED") {
      return NextResponse.json({ message: "Item yang memakai stok bahan tidak dapat dihapus melalui formulir ini." }, { status: 409 });
    }
    if (isStockMutationConflict(error) || (error instanceof StockMutationError && error.message !== "INSUFFICIENT_STOCK")) {
      return NextResponse.json({ message: "Data produk atau konversi stok berubah. Periksa produk lalu coba lagi." }, { status: 409 });
    }

    if (
      error instanceof StockMutationError &&
      error.message === "INSUFFICIENT_STOCK"
    ) {
      return NextResponse.json(
        { message: "Stok produk tidak mencukupi untuk perubahan ini" },
        { status: 409 },
      );
    }

    console.error("Failed to update transaction items:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
