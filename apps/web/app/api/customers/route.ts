import { NextResponse } from "next/server";
import { db } from "@pos/db";
import { z } from "zod";
import { requirePermission, handleAuthError } from "@/lib/rbac/guard";
import { apiList, buildPaginationMeta, parsePagination } from "@/lib/api/responses";

import { getLogger } from "@/lib/logger";

const log = getLogger("api:customers");
export const dynamic = "force-dynamic";

const createCustomerSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  phone: z
    .string()
    .optional()
    .transform((v) => (v ? v.trim() : undefined)),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  company: z.string().max(100).optional(),
  address: z.string().max(300).optional(),
  type: z.enum(["REGULAR", "VIP", "CORPORATE"]).default("REGULAR"),
  notes: z.string().max(500).optional(),
});

// GET /api/customers
export async function GET(request: Request) {
  try {
    const user = await requirePermission("customer", "read");
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const type = searchParams.get("type") || "";
    const { page, limit, skip } = parsePagination(searchParams, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const storeId = user.storeId || "store-main";
    const where: Record<string, unknown> = {
      storeId,
    };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { company: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    if (type && ["REGULAR", "VIP", "CORPORATE"].includes(type)) {
      where.type = type;
    }

    const [total, customers] = await db.$transaction([
      db.customer.count({ where }),
      db.customer.findMany({
        where,
        orderBy: { lastVisitAt: { sort: "desc", nulls: "last" } },
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          company: true,
          address: true,
          type: true,
          notes: true,
          totalSpent: true,
          totalOrders: true,
          totalDebt: true,
          loyaltyPoint: true,
          lastVisitAt: true,
          createdAt: true,
        },
      }),
    ]);

    return apiList(customers, buildPaginationMeta(total, page, limit));
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("[GET /api/customers]", error);
    return NextResponse.json(
      { message: "Failed to fetch customers" },
      { status: 500 }
    );
  }
}

// POST /api/customers
export async function POST(request: Request) {
  try {
    const user = await requirePermission("customer", "create");
    const body = await request.json();
    const parsed = createCustomerSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const storeId = user.storeId || "store-main";
    const { name, phone, email, company, address, type, notes } = parsed.data;

    // Prevent duplicate phone within the same store
    if (phone) {
      const existing = await db.customer.findFirst({
        where: { phone, storeId },
        select: { id: true, name: true },
      });
      if (existing) {
        return NextResponse.json(
          {
            message: `Nomor HP sudah terdaftar atas nama "${existing.name}"`,
            existingId: existing.id,
          },
          { status: 409 }
        );
      }
    }

    const customer = await db.customer.create({
      data: {
        name,
        phone: phone || null,
        email: email || null,
        company: company || null,
        address: address || null,
        type: type ?? "REGULAR",
        notes: notes || null,
        storeId,
      },
    });

    return NextResponse.json(customer, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;

    log.error("[POST /api/customers]", error);
    return NextResponse.json(
      { message: "Failed to create customer" },
      { status: 500 }
    );
  }
}
