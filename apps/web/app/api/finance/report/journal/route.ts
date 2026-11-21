import { db } from "@pos/db";
import { recognizedExpenseFilter } from "@/features/keuangan/helpers/recognized-expense-filter";
import { handleAuthError } from "@/lib/rbac/guard";
import { getFinancialExportAccess } from "@/features/financial-report/services/export-access";
import {
  buildReportRows,
  buildReportFooter,
  buildReportCategorySummary,
  buildReportPeriodRange,
  type ReportPeriod,
  type ReportRow,
} from "@/features/financial-report/helpers/journal-core";
import type { ExpenseCategory } from "@/features/keuangan/helpers/keuangan-core";
import { getLogger } from "@/lib/logger";
import { apiError } from "@/lib/api/responses";
import { incomeClassification } from "@/features/financial-report/helpers/income-categories";
import { withManualPayableSnapshot } from "@/features/financial-report/services/manual-payable-period";
import { MANUAL_EXPENSE_REPORT_LABELS } from "@/features/keuangan/helpers/manual-report-categories";
import { loadManualReceivablePeriod } from "@/features/financial-report/services/manual-receivable-period";
import { buildIncomePeriod } from "@/features/financial-report/helpers/income-period";
import { NextResponse } from "next/server";

const log = getLogger("api:finance:report:journal");
export const dynamic = "force-dynamic";

const VALID_PERIODS: ReadonlySet<ReportPeriod> = new Set([
  "daily",
  "weekly",
  "monthly",
  "30d",
]);

function isPeriod(value: string | null): value is ReportPeriod {
  return value !== null && VALID_PERIODS.has(value as ReportPeriod);
}

function toJakartaBounds(from: string, to: string) {
  const start = new Date(`${from}T00:00:00+07:00`);
  const end = new Date(`${to}T00:00:00+07:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function GET(request: Request) {
  try {
    const access = await getFinancialExportAccess(request);
    if ("response" in access) return access.response;
    const { user } = access;
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get("period");
    if (!isPeriod(periodParam) && periodParam !== "custom") {
      return apiError(
        "Query parameter 'period' is required (daily | weekly | monthly | 30d)",
        422,
        { code: "ValidationError" },
      );
    }
    let range: { from: string; to: string };
    if (periodParam === "custom") {
      const from = searchParams.get("from") ?? "";
      const to = searchParams.get("to") ?? "";
      const validDate = (value: string) => {
        const date = new Date(`${value}T00:00:00+07:00`);
        return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) &&
          new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) === value;
      };
      if (searchParams.getAll("from").length !== 1 || searchParams.getAll("to").length !== 1 ||
        !validDate(from) || !validDate(to) || from > to ||
        (new Date(`${to}T00:00:00+07:00`).getTime() - new Date(`${from}T00:00:00+07:00`).getTime()) / 86_400_000 >= 366) {
        return apiError("Pilih rentang tanggal yang valid hingga 366 hari.", 422, { code: "ValidationError" });
      }
      range = { from, to };
    } else {
      range = buildReportPeriodRange(periodParam);
    }
    const { start, end } = toJakartaBounds(range.from, range.to);

    if (!user.storeId) return apiError("Toko pengguna belum tersedia.", 403, { code: "Forbidden" });
    const storeId = user.storeId;
    const [sales, expenseSnapshot, manualIncome, manualReceivables] = await Promise.all([
      db.transaction.findMany({
        where: {
          storeId,
          status: { in: ["COMPLETED", "DP"] },
          invoiceDate: { gte: start, lt: end },
        },
        orderBy: { invoiceDate: "asc" },
        select: {
          id: true,
          invoiceNumber: true,
          transactionCategory: true,
          printingSubcategory: true,
          printingReceipt: { select: { subcategory: true } },
          invoiceDate: true,
          createdAt: true,
          salesName: true,
          salesperson: { select: { name: true } },
          customerName: true,
          paymentMethod: true,
          status: true,
          amountPaid: true,
          total: true,
          items: {
            select: {
              productName: true,
              subtotal: true,
              printingServiceId: true,
              product: { select: { category: { select: { name: true } }, catalogSubcategory: { select: { group: true, name: true } } } },
            },
          },
        },
      }),
      withManualPayableSnapshot(db, storeId, range.from, range.to, tx => tx.expense.findMany({
        where: {
          deletedAt: null,
          storeId,
          occurredAt: { gte: start, lt: end },
          ...recognizedExpenseFilter(),
        },
        orderBy: { occurredAt: "asc" },
        select: {
          id: true,
          occurredAt: true,
          applicantName: true,
          category: true,
          reportCategory: true,
          customCategory: { select: { name: true } },
          description: true,
          amount: true,
          changeAmount: true,
          hasMissingCostSnapshot: true,
          manualPurchasePaymentMethod: true,
          shoppingRequestId: true,
          goodsPurchaseId: true,
          backdatedPurchaseDueId: true,
          backdatedPurchasePaymentId: true,
          shoppingRequest: { select: { number: true } },
          goodsPurchase: { select: { number: true } },
        },
      })),
      db.manualIncome.findMany({
        where: { storeId, deletedAt: null, occurredAt: { gte: start, lt: end } },
        select: { id: true, occurredAt: true, description: true, category: true, amount: true, payments: { select: { method: true, amount: true } } },
        orderBy: { occurredAt: "asc" },
      }),
      loadManualReceivablePeriod(db, storeId, range.from, range.to),
    ]);

    const { data: expenses, payables: manualPayables } = expenseSnapshot;

    const saleInputs = sales.map((s) => ({
      id: s.id,
      invoiceNumber: s.invoiceNumber,
      transactionCategory: s.transactionCategory,
      printingSubcategory: s.printingSubcategory,
      printingReceipt: s.printingReceipt,
      createdAt: s.invoiceDate,
      salesName: s.salesName,
      salesperson: s.salesperson,
      customerName: access.canReadCustomers ? s.customerName : null,
      paymentMethod: s.paymentMethod,
      total: (s.status === "DP" ? s.amountPaid : s.total).toString(),
      items: s.items.map((item) => ({
        ...item,
        subtotal: item.subtotal.toString(),
      })),
    }));

    const manualInputs = manualIncome.flatMap((income) => {
      const amount = Number(income.amount);
      const payments = income.payments.map(payment => ({ method: payment.method, amount: Number(payment.amount) }));
      const balanced = payments.length > 0 && payments.reduce((sum, payment) => sum + Math.round(payment.amount * 100), 0) === Math.round(amount * 100);
      const parts = balanced ? payments : [{ method: "Belum dicatat", amount }];
      const classification = income.category === "ATK"
        ? { category: "ATK" as const, subcategory: "Pemasukan manual" }
        : incomeClassification({ transactionCategory: "PERCETAKAN", printingSubcategory: income.category, items: [] });
      return parts.filter(part => part.amount > 0).map(part => ({
        id: income.id, invoiceNumber: `MANUAL-${income.id}`, createdAt: income.occurredAt,
        salesName: null, salesperson: null, customerName: null, paymentMethod: part.method, total: part.amount,
        items: [{ productName: income.description, subtotal: part.amount,
          product: { catalogSubcategory: { group: classification.category === "ATK" ? "ATK" as const : "PERCETAKAN" as const, name: classification.subcategory } } }],
      }));
    });
    const visibleManualIncome = access.canReadManualIncome ? manualInputs : [...manualInputs.reduce((groups, entry) => {
      const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(entry.createdAt);
      const category = entry.items[0].product.catalogSubcategory;
      const groupId = JSON.stringify([day, category.group, category.name]);
      const key = JSON.stringify([groupId, entry.paymentMethod]);
      const previous = groups.get(key);
      if (previous) {
        previous.total = (Math.round(previous.total * 100) + Math.round(entry.total * 100)) / 100;
        previous.items[0].subtotal = previous.total;
      } else {
        groups.set(key, { ...entry, id: groupId, invoiceNumber: "", salesName: null,
          items: [{ ...entry.items[0], productName: "Pemasukan manual" }] });
      }
      return groups;
    }, new Map<string, typeof manualInputs[number]>()).values()];
    const saleRows = buildReportRows(saleInputs, []);
    const manualRows = buildReportRows(visibleManualIncome, []);
    const receivableDetails = access.canReadReceivables && manualReceivables.length
      ? await db.customerReceivable.findMany({ where: { storeId, id: { in: manualReceivables.map(receivable => receivable.id) } },
        select: { id: true, note: true, customer: { select: { name: true } } } }) : [];
    const receivableById = new Map(receivableDetails.map(receivable => [receivable.id, receivable]));
    const receivableRows = buildIncomePeriod({ fromDate: range.from, toDate: range.to, transactions: [], manualIncome: [], manualReceivables }).contributions.map(entry => {
      const receivable = receivableById.get(entry.manualReceivableId ?? "");
      return { restricted: !access.canReadReceivables,
        row: { tanggal: entry.date, invoice: `PIUTANG-${entry.manualReceivableId}`, person: receivable?.customer.name ?? "",
          products: receivable?.note || "Pembayaran piutang manual", categories: entry.allocations.map(part => `${part.category} / ${part.subcategory}`).join(", "),
          status: "Pemasukan" as const, amount: entry.amount, method: entry.method } };
    });
    const transferSegments = new Map(manualPayables.transfers.map(transfer => [transfer.id, transfer.segments]));
    const expenseRows = expenses.flatMap((e) => {
      const restricted = !access.canReadExpenses || (!access.canReadPurchases && Boolean(
        e.goodsPurchaseId || e.shoppingRequestId || e.goodsPurchase || e.shoppingRequest || e.manualPurchasePaymentMethod
        || e.backdatedPurchaseDueId || e.backdatedPurchasePaymentId
      ));
      const row = buildReportRows([], [{
        id: e.id,
        occurredAt: e.occurredAt,
        applicantName: e.applicantName,
        category: e.category as ExpenseCategory,
        customCategoryName: e.customCategory?.name ?? null,
        description: e.description,
        amount: e.amount.toString(),
        changeAmount: e.changeAmount.toString(),
        hasMissingCostSnapshot: e.hasMissingCostSnapshot,
        shoppingRequestNumber: e.shoppingRequest?.number ?? null,
        goodsPurchaseNumber: e.goodsPurchase?.number ?? null,
      }])[0];
      const segments = transferSegments.get(e.id);
      if (segments) return segments.map(segment => ({ restricted, row: { ...row, amount: -segment.amountCents / 100,
        categories: segment.category ? MANUAL_EXPENSE_REPORT_LABELS[segment.category] : "Belum ditentukan" } }));
      if (e.manualPurchasePaymentMethod === "TRANSFER" && e.reportCategory) row.categories = MANUAL_EXPENSE_REPORT_LABELS[e.reportCategory];
      return [{ restricted, row }];
    });
    for (const payment of manualPayables.payments) expenseRows.push({ restricted: !access.canReadExpenses || !access.canReadPurchases,
      row: { tanggal: payment.date, invoice: `HUTANG-${payment.payableId}`, person: payment.supplierName,
        products: payment.origin === "AUTO" ? "Pelunasan otomatis hutang" : "Pembayaran hutang manual",
        categories: payment.category ? MANUAL_EXPENSE_REPORT_LABELS[payment.category] : "Belum ditentukan",
        status: "Pengeluaran", amount: -payment.amountCents / 100, method: "" } });

    const grouped = new Map<string, ReportRow>();
    const rows = [...saleRows.map(row => ({ row, restricted: !access.canReadTransactions })),
      ...manualRows.map(row => ({ row, restricted: false })),
      ...receivableRows,
      ...expenseRows]
      .filter(({ row, restricted }) => {
        if (!restricted) return true;
        const key = JSON.stringify([row.tanggal, row.status, row.method]);
        const previous = grouped.get(key);
        if (previous) previous.amount = (Math.round(previous.amount * 100) + Math.round(row.amount * 100)) / 100;
        else grouped.set(key, { ...row, invoice: "", person: "", products: "Rincian dibatasi", categories: "", amount: row.amount });
        return false;
      }).map(({ row }) => row);
    rows.push(...grouped.values());
    rows.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || (a.status === b.status ? 0 : a.status === "Pemasukan" ? -1 : 1));
    return NextResponse.json({
      period: periodParam,
      from: range.from,
      to: range.to,
      rows,
      footer: buildReportFooter(rows),
      categories: buildReportCategorySummary([...saleInputs, ...manualInputs]),
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to build laporan", error);
    return apiError("Failed to build laporan", 500, { code: "InternalError" });
  }
}
