import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { CUSTOMER_TYPES, toDbCustomerType } from "@/lib/customers";
import {
  applyComputedCustomerDebt,
  loadCustomerDebtByActiveDp,
} from "@/features/customer-debt/helpers/customer-debt-summary";

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
    const storeId = user.storeId || "store-main";
    const { id } = await params;
    const customer = await db.customer.findFirst({
      where: { id, storeId },
      include: {
        transactions: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
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

    const debtByCustomerId = await loadCustomerDebtByActiveDp(db, {
      storeId,
      customers: [{ id: customer.id, name: customer.name }],
    });

    return NextResponse.json(
      applyComputedCustomerDebt([customer], debtByCustomerId)[0],
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

    const existingCustomer = await db.customer.findFirst({
      where: { id, storeId },
      select: { id: true },
    });

    if (!existingCustomer) {
      return NextResponse.json(
        { message: "Customer not found" },
        { status: 404 }
      );
    }

    const { type, ...rest } = parsed.data;

    const customer = await db.customer.update({
      where: { id: existingCustomer.id },
      data: {
        ...rest,
        ...(type ? { type: toDbCustomerType(type) } : {}),
      },
    });

    return NextResponse.json(customer);
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
      select: { id: true },
    });

    if (!customer) {
      return NextResponse.json(
        { message: "Customer not found" },
        { status: 404 }
      );
    }

    // Don't delete; instead nullify relation on transactions (soft approach)
    await db.transaction.updateMany({
      where: { customerId: customer.id, storeId },
      data: { customerId: null },
    });

    await db.customer.delete({ where: { id: customer.id } });

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
