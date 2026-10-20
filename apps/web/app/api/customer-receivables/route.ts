import { NextResponse } from "next/server";
import { db, type Prisma } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { getLogger } from "@/lib/logger";
import { createReceivable, createReceivableSchema, ReceivableError, receivableInclude } from "@/features/customer-debt/helpers/manual-receivables";

export const dynamic = "force-dynamic";
const log = getLogger("api:customer-receivables");
const querySchema = z.object({
  customerId: z.string().min(1).optional(), search: z.string().trim().max(100).default(""),
  page: z.coerce.number().int().min(1).max(1000000).default(1), status: z.enum(["open", "all"]).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requirePermission("customer", "read");
    const storeId = user.storeId || "store-main";
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return NextResponse.json({ message: "Filter piutang tidak valid.", errors: parsed.error.flatten() }, { status: 422 });
    const { customerId, search, page } = parsed.data;
    if (customerId && !await db.customer.findFirst({ where: { id: customerId, storeId }, select: { id: true } })) return NextResponse.json({ message: "Pelanggan tidak ditemukan." }, { status: 404 });
    const status = parsed.data.status ?? (customerId ? "all" : "open");
    const where: Prisma.CustomerReceivableWhereInput = {
      storeId,
      ...(customerId ? { customerId } : {}),
      ...(status === "open" ? { amountPaid: { lt: db.customerReceivable.fields.amount } } : {}),
      ...(search ? { OR: [
        { customer: { name: { contains: search, mode: "insensitive" } } },
        { note: { contains: search, mode: "insensitive" } },
      ] } : {}),
    };
    const [total, data] = await Promise.all([
      db.customerReceivable.count({ where }),
      db.customerReceivable.findMany({ where, include: receivableInclude, orderBy: [{ dueDate: "asc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20 }),
    ]);
    return NextResponse.json({ data, pagination: { page, total, totalPages: Math.ceil(total / 20) } });
  } catch (error) {
    const authError = handleAuthError(error); if (authError) return authError;
    log.error("Gagal memuat piutang manual", error);
    return NextResponse.json({ message: "Piutang manual belum bisa dimuat. Silakan coba lagi." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requirePermission("customer", "update");
    const parsed = createReceivableSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "Periksa data piutang.", errors: parsed.error.flatten() }, { status: 422 });
    const receivable = await db.$transaction((tx) => createReceivable(tx, parsed.data, { id: user.id, storeId: user.storeId || "store-main" }));
    return NextResponse.json(receivable, { status: 201 });
  } catch (error) {
    const authError = handleAuthError(error); if (authError) return authError;
    if (error instanceof SyntaxError) return NextResponse.json({ message: "Data piutang tidak valid." }, { status: 400 });
    if (error instanceof ReceivableError) return NextResponse.json({ message: error.message }, { status: error.status });
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ message: "Permintaan ini sudah digunakan. Silakan muat ulang piutang." }, { status: 409 });
    log.error("Gagal menyimpan piutang manual", error);
    return NextResponse.json({ message: "Piutang belum bisa disimpan. Silakan coba lagi." }, { status: 500 });
  }
}
