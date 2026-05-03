import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateCustomerSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  company: z.string().max(100).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  type: z.enum(["REGULAR", "VIP", "CORPORATE"]).optional(),
  notes: z.string().max(500).optional().nullable(),
});

// GET /api/customers/[id]
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const customer = await db.customer.findUnique({
      where: { id: params.id },
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

    return NextResponse.json(customer);
  } catch (error) {
    console.error("[GET /api/customers/[id]]", error);
    return NextResponse.json(
      { message: "Failed to fetch customer" },
      { status: 500 }
    );
  }
}

// PATCH /api/customers/[id]
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const parsed = updateCustomerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 }
      );
    }

    // Check for phone conflict (excluding self)
    if (parsed.data.phone) {
      const conflict = await db.customer.findFirst({
        where: {
          phone: parsed.data.phone,
          storeId: "store-main",
          NOT: { id: params.id },
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

    const customer = await db.customer.update({
      where: { id: params.id },
      data: parsed.data,
    });

    return NextResponse.json(customer);
  } catch (error) {
    console.error("[PATCH /api/customers/[id]]", error);
    return NextResponse.json(
      { message: "Failed to update customer" },
      { status: 500 }
    );
  }
}

// DELETE /api/customers/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    // Don't delete; instead nullify relation on transactions (soft approach)
    await db.transaction.updateMany({
      where: { customerId: params.id },
      data: { customerId: null },
    });

    await db.customer.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/customers/[id]]", error);
    return NextResponse.json(
      { message: "Failed to delete customer" },
      { status: 500 }
    );
  }
}
