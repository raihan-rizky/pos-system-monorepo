import { NextResponse } from "next/server";
import { db, type Prisma } from "@pos/db";
import { z } from "zod";
import { AuthError, canAuthenticatedUserAccessPage, handleAuthError, requirePermission } from "@/lib/rbac/guard";
import { apiList, buildPaginationMeta } from "@/lib/api/responses";
import { CUSTOMER_TYPES } from "@/lib/customers";
import { getLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";
const log = getLogger("api:customer-receivables:invoices");
const querySchema = z.object({
  search: z.string().trim().max(100).default(""),
  status: z.enum(["all", "open", "settled"]).default("all"),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  customerType: z.enum(CUSTOMER_TYPES).optional(),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
}).refine((value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo);

export async function GET(request: Request) {
  try {
    const user = await requirePermission("customer.receivable", "read");
    if (!await canAuthenticatedUserAccessPage(user, "/customers")) throw new AuthError(403, "Akses halaman Pelanggan diperlukan.");
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ message: "Filter piutang tidak valid." }, { status: 422 });
    const { search, status, dateFrom, dateTo, customerType, page, limit } = parsed.data;
    const conditions: Prisma.TransactionWhereInput[] = [];
    if (status === "open") {
      conditions.push({ OR: [
        { status: "DP", amountPaid: { lt: db.transaction.fields.total } },
        { status: "COMPLETED", paymentMethod: "TEMPO", amountPaid: { lt: db.transaction.fields.total } },
      ] });
    } else if (status === "settled") {
      conditions.push({ status: "COMPLETED", amountPaid: { gte: db.transaction.fields.total }, OR: [{ paymentMethod: "TEMPO" }, { debtPaymentLogs: { some: {} } }] });
    } else {
      conditions.push({ OR: [
        { status: "DP" },
        { status: "COMPLETED", OR: [{ paymentMethod: "TEMPO" }, { debtPaymentLogs: { some: {} } }] },
      ] });
    }
    if (search) conditions.push({ OR: [
      { invoiceNumber: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
      { customer: { name: { contains: search, mode: "insensitive" } } },
    ] });
    if (dateFrom || dateTo) {
      const start = dateFrom ? new Date(`${dateFrom}T00:00:00+07:00`) : undefined;
      const end = dateTo ? new Date(new Date(`${dateTo}T00:00:00+07:00`).getTime() + 86400000) : undefined;
      conditions.push({ invoiceDate: { ...(start ? { gte: start } : {}), ...(end ? { lt: end } : {}) } });
    }
    if (customerType) conditions.push(customerType === "UMUM"
      ? { OR: [{ customer: { type: "UMUM" } }, { customerId: null }] }
      : { customer: { type: customerType } });

    const where: Prisma.TransactionWhereInput = { storeId: user.storeId || "store-main", AND: conditions };
    const [total, invoices] = await Promise.all([
      db.transaction.count({ where }),
      db.transaction.findMany({
        where, orderBy: [{ invoiceDate: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit,
        select: {
          id: true, invoiceNumber: true, customerId: true, customerName: true,
          customer: { select: { name: true, type: true } }, status: true, paymentMethod: true,
          total: true, amountPaid: true, createdAt: true, invoiceDate: true,
          debtPaymentLogs: { select: { id: true, amount: true, paymentMethod: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        },
      }),
    ]);
    const data = invoices.map((invoice) => ({
      id: invoice.id, invoiceNumber: invoice.invoiceNumber, customerId: invoice.customerId,
      customerName: invoice.customerName || invoice.customer?.name || null,
      customerType: invoice.customer?.type ?? "UMUM", status: invoice.status, paymentMethod: invoice.paymentMethod,
      total: Number(invoice.total), amountPaid: Number(invoice.amountPaid), createdAt: invoice.createdAt,
      invoiceDate: invoice.invoiceDate,
      debtPaymentLogs: invoice.debtPaymentLogs.map((payment) => ({
        id: payment.id, amount: Number(payment.amount), paymentMethod: payment.paymentMethod, createdAt: payment.createdAt,
      })),
    }));
    return apiList(data, buildPaginationMeta(total, page, limit));
  } catch (error) {
    const auth = handleAuthError(error);
    if (auth) return auth;
    log.error("Gagal memuat invoice piutang", error);
    return NextResponse.json({ message: "Invoice piutang belum bisa dimuat. Silakan coba lagi." }, { status: 500 });
  }
}
