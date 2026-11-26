import { db } from "@pos/db";
import { recognizedExpenseFilter } from "@/features/keuangan/helpers/recognized-expense-filter";
import type { ExpenseCategory } from "@/features/keuangan/helpers/keuangan-core";
import { MANUAL_EXPENSE_REPORT_LABELS } from "@/features/keuangan/helpers/manual-report-categories";
import { buildReportCategorySummary, buildReportFooter, buildReportRows, type ReportRow } from "../helpers/journal-core";
import { buildIncomePeriod } from "../helpers/income-period";
import { incomeClassification } from "../helpers/income-categories";
import type { FinancialExportDetails } from "./export-access";
import { loadManualReceivablePeriod } from "./manual-receivable-period";
import { withManualPayableSnapshot } from "./manual-payable-period";

function toJakartaBounds(from: string, to: string) {
  const start = new Date(`${from}T00:00:00+07:00`);
  const end = new Date(`${to}T00:00:00+07:00`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function loadFinancialJournal(
  storeId: string,
  range: { from: string; to: string },
  access: FinancialExportDetails,
  includeExpenses = true,
) {
  const { start, end } = toJakartaBounds(range.from, range.to);
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
    includeExpenses ? withManualPayableSnapshot(db, storeId, range.from, range.to, tx => tx.expense.findMany({
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
    })) : undefined,
    db.manualIncome.findMany({
      where: { storeId, deletedAt: null, occurredAt: { gte: start, lt: end } },
      select: { id: true, occurredAt: true, description: true, category: true, amount: true, payments: { select: { method: true, amount: true } } },
      orderBy: { occurredAt: "asc" },
    }),
    loadManualReceivablePeriod(db, storeId, range.from, range.to),
  ]);

  const expenses = expenseSnapshot?.data ?? [];
  const manualPayables = expenseSnapshot?.payables;

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
  const transferSegments = new Map(manualPayables?.transfers.map(transfer => [transfer.id, transfer.segments]));
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
  for (const payment of manualPayables?.payments ?? []) expenseRows.push({ restricted: !access.canReadExpenses || !access.canReadPurchases,
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
  return { rows, footer: buildReportFooter(rows), categories: buildReportCategorySummary([...saleInputs, ...manualInputs]) };
}
