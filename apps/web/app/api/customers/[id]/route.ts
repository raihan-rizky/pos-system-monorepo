import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import {
  canAuthenticatedUserPerform,
  handleAuthError,
  requirePermission,
} from "@/lib/rbac/guard";
import { CUSTOMER_TYPES, toDbCustomerType } from "@/lib/customers";
import { redactReceivableMetrics } from "@/features/customer-recap/helpers/redact-receivables";
import { isActiveDebt } from "@/features/customer-debt/helpers/payment-terms";
import {
  applyComputedCustomerDebt,
  loadCustomerDebtByActiveDp,
} from "@/features/customer-debt/helpers/customer-debt-summary";
import { requireCustomerDebtIdentityPermission } from "@/features/customer-debt/server/customer-identity-authorization";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:customers:id");
export const dynamic = "force-dynamic";

const updateCustomerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  company: z.string().max(100).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  type: z.enum(CUSTOMER_TYPES).optional(),
  notes: z.string().max(500).optional().nullable(),
});

// GET /api/customers/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("customer", "read");
    const canViewReceivables = await canAuthenticatedUserPerform(
      user,
      "customer.receivable",
      "read",
    );
    const canReadTransactions = await canAuthenticatedUserPerform(
      user,
      "transaction",
      "read",
    );
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const customer = await db.customer.findFirst({
      where: { id, storeId },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          take: canReadTransactions || canViewReceivables ? 20 : 0,
          select: canReadTransactions
            ? {
                id: true,
                invoiceNumber: true,
                total: true,
                amountPaid: true,
                paymentMethod: true,
                status: true,
                isJobOrder: true,
                productionStatus: true,
                estimatedDoneAt: true,
                createdAt: true,
                items: {
                  select: { productName: true, quantity: true, subtotal: true },
                },
              }
            : {
                id: true,
                invoiceNumber: true,
                total: true,
                amountPaid: true,
                paymentMethod: true,
                status: true,
                createdAt: true,
              },
        },
      },
    });

    if (!customer) {
      return NextResponse.json(
        { message: "Customer not found" },
        { status: 404 }
      );
    }

    const debtByCustomerId = canViewReceivables
      ? await loadCustomerDebtByActiveDp(db, {
          storeId,
          customers: [{ id: customer.id, name: customer.name }],
        })
      : new Map<string, number>();

    const customerResponse = applyComputedCustomerDebt(
      [customer],
      debtByCustomerId,
    )[0];
    const receivableTransactions = (customer.transactions ?? [])
      .filter((transaction) => isActiveDebt({
        status: transaction.status,
        paymentMethod: transaction.paymentMethod,
        total: Number(transaction.total),
        amountPaid: Number(transaction.amountPaid),
      }))
      .map(({ id, invoiceNumber, total, amountPaid, status, createdAt }) => ({
        id,
        invoiceNumber,
        total,
        amountPaid,
        status,
        createdAt,
      }));
    const responseCustomer = canReadTransactions
      ? { ...customerResponse, transactions: customer.transactions }
      : canViewReceivables
        ? { ...customerResponse, transactions: receivableTransactions }
        : { ...customerResponse, transactions: undefined };
    return NextResponse.json(
      canViewReceivables
        ? responseCustomer
        : redactReceivableMetrics(responseCustomer),
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("[GET /api/customers/[id]]", error);
    return NextResponse.json(
      { message: "Failed to fetch customer" },
      { status: 500 }
    );
  }
}

// PATCH /api/customers/[id]
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("customer", "update");
    const { id } = await params;
    const body = await request.json();
    const parsed = updateCustomerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const canViewReceivables = await canAuthenticatedUserPerform(
      user,
      "customer.receivable",
      "read",
    );
    const storeId = user.storeId || "store-main";

    // Check for phone conflict (excluding self)
    if (parsed.data.phone) {
      const conflict = await db.customer.findFirst({
        where: {
          phone: parsed.data.phone,
          storeId,
          NOT: { id },
        },
        select: { id: true, name: true },
      });
      if (conflict) {
        return NextResponse.json(
          {
            message: `Nomor HP sudah terdaftar atas nama "${conflict.name}"`,
            existingId: conflict.id,
          },
          { status: 409 }
        );
      }
    }

    const { type, ...rest } = parsed.data;
    const customer = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "pos_customers" WHERE "id" = ${id} AND "storeId" = ${storeId} FOR UPDATE`;
      const current = await tx.customer.findFirst({
        where: { id, storeId },
        select: { id: true, name: true },
      });
      if (!current) return null;

      await requireCustomerDebtIdentityPermission(
        tx,
        storeId,
        user,
        current,
        rest.name ?? current.name,
      );

      return tx.customer.update({
        where: { id: current.id },
        data: {
          ...rest,
          ...(type ? { type: toDbCustomerType(type) } : {}),
        },
      });
    });

    if (!customer) {
      return NextResponse.json(
        { message: "Customer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      canViewReceivables ? customer : redactReceivableMetrics(customer),
    );
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("[PATCH /api/customers/[id]]", error);
    return NextResponse.json(
      { message: "Failed to update customer" },
      { status: 500 }
    );
  }
}

// DELETE /api/customers/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requirePermission("customer", "delete");
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const customer = await db.customer.findFirst({
      where: { id, storeId },
      select: { id: true, name: true },
    });

    if (!customer) {
      return NextResponse.json(
        { message: "Customer not found" },
        { status: 404 }
      );
    }

    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "pos_customers" WHERE "id" = ${customer.id} AND "storeId" = ${storeId} FOR UPDATE`;
      const current = await tx.customer.findFirst({
        where: { id: customer.id, storeId },
        select: { id: true, name: true },
      });
      if (!current) return "missing";
      if (await tx.customerReceivable.count({ where: { customerId: customer.id, storeId } }) > 0) return "history";
      await requireCustomerDebtIdentityPermission(tx, storeId, user, current, null);
      await tx.transaction.updateMany({ where: { customerId: customer.id, storeId }, data: { customerId: null } });
      await tx.customer.delete({ where: { id: customer.id } });
      return "deleted";
    });
    if (result === "missing") return NextResponse.json({ message: "Pelanggan tidak ditemukan." }, { status: 404 });
    if (result === "history") return NextResponse.json({ message: "Pelanggan memiliki riwayat piutang manual dan belum bisa dihapus. Riwayat disimpan sebagai catatan pembayaran." }, { status: 409 });

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("[DELETE /api/customers/[id]]", error);
    return NextResponse.json(
      { message: "Failed to delete customer" },
      { status: 500 }
    );
  }
}
