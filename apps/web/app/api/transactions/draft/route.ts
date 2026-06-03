import { NextResponse } from "next/server";
import { db, Prisma } from "@pos/db";
import { z } from "zod";
import {
  AuthError,
  handleAuthError,
  requireRole,
} from "@/lib/rbac/guard";
import { canRolePerformAction } from "@/features/rbac/helpers/rbac-core";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import type { Role } from "@/lib/rbac/permissions";
import { getLogger } from "@/lib/logger";
import {
  buildDraftNumber,
  formatDraftNumberForDisplay,
} from "@/features/transactions-draft/helpers/draft-number";
import { buildProductPriceLogEntries } from "@/lib/product-price-logs/price-log-entries";

const log = getLogger("api:transactions:draft");

export const dynamic = "force-dynamic";

const draftItemSchema = z.object({
  productId: z.string(),
  name: z.string(),
  size: z.string().optional().nullable(),
  material: z.string().optional().nullable(),
  price: z.number().min(0),
  quantity: z.number().min(1),
});

const createDraftSchema = z.object({
  items: z.array(draftItemSchema).min(1, "Cart is empty"),
  discount: z.number().min(0).optional().default(0),
  note: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  salesName: z.string().optional().nullable(),
  salespersonId: z.string().optional().nullable(),
  isJobOrder: z.boolean().optional().default(false),
  estimatedDoneAt: z.string().optional().nullable(),
});

const MAX_ATTEMPTS = 5;

export async function POST(request: Request) {
  try {
    const user = await requireRole("OWNER", "ADMIN", "CASHIER", "SALES");
    const permissions = await getGlobalRolePermissions();
    if (
      !canRolePerformAction(
        user.role as Role,
        "transaction.draft",
        "create",
        permissions,
      )
    ) {
      throw new AuthError(403, "Insufficient permissions");
    }

    const storeId = user.storeId || "store-main";
    const body = await request.json();
    const parsed = createDraftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Validation error", errors: parsed.error.flatten() },
        { status: 422 },
      );
    }

    const {
      items,
      discount,
      note,
      customerName,
      customerId,
      salesName,
      salespersonId,
      isJobOrder,
      estimatedDoneAt,
    } = parsed.data;

    if (items.length === 0) {
      return NextResponse.json({ message: "Cart is empty" }, { status: 422 });
    }

    const uniqueProductIds = [...new Set(items.map((item) => item.productId))];

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");

    const [customerCheck, salespersonCheck, products, draftCount] =
      await Promise.all([
        customerId
          ? db.customer.findFirst({
              where: { id: customerId, storeId },
              select: { id: true },
            })
          : Promise.resolve(true),
        salespersonId
          ? db.salesperson.findFirst({
              where: { id: salespersonId, storeId },
              select: { id: true },
            })
          : Promise.resolve(true),
        db.product.findMany({
          where: { id: { in: uniqueProductIds }, storeId, isActive: true },
          select: {
            id: true,
            name: true,
            price: true,
            costPrice: true,
            size: true,
            material: true,
          },
        }),
        db.transaction.count({
          where: {
            storeId,
            draftNumber: { startsWith: `PNW-TLD-${dateStr}-` },
          },
        }),
      ]);

    if (customerId && !customerCheck) {
      return NextResponse.json(
        { message: "Customer not found" },
        { status: 404 },
      );
    }
    if (salespersonId && !salespersonCheck) {
      return NextResponse.json(
        { message: "Salesperson not found" },
        { status: 404 },
      );
    }

    const productById = new Map(
      products.map((product) => [product.id, product]),
    );

    if (productById.size !== uniqueProductIds.length) {
      return NextResponse.json(
        { message: "One or more products were not found" },
        { status: 404 },
      );
    }

    const serverItems = items.map((item) => {
      const product = productById.get(item.productId);
      if (!product) throw new Error("PRODUCT_NOT_FOUND");
      return {
        productId: product.id,
        name: product.name,
        size: product.size ?? item.size ?? null,
        material: product.material ?? item.material ?? null,
        price: item.price,
        currentPrice: Number(product.price),
        costPrice: product.costPrice ? Number(product.costPrice) : null,
        quantity: item.quantity,
      };
    });

    const subtotal = serverItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const total = Math.max(0, subtotal - discount);

    const isSalesRequest = user.role === "SALES";
    let draft: unknown = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        draft = await db.$transaction(async (tx: Prisma.TransactionClient) => {
          const draftNumber = buildDraftNumber(
            dateStr,
            draftCount + 1 + attempt,
          );
          const displayDraftNumber = formatDraftNumberForDisplay(draftNumber);

          const created = await tx.transaction.create({
            data: {
              invoiceNumber: null,
              draftNumber,
              storeId,
              cashierId: isSalesRequest ? null : user.id,
              requestedById: isSalesRequest ? user.id : null,
              customerId: customerId || null,
              subtotal,
              discount,
              tax: 0,
              total,
              paymentMethod: "CASH",
              amountPaid: 0,
              change: 0,
              status: "DRAFT",
              note: note || null,
              customerName: customerName || null,
              salesName: salesName || null,
              salespersonId: salespersonId || null,
              isJobOrder,
              productionStatus: null,
              estimatedDoneAt: estimatedDoneAt
                ? new Date(estimatedDoneAt)
                : null,
              items: {
                create: serverItems.map((item) => ({
                  productId: item.productId,
                  productName: item.name,
                  size: item.size,
                  material: item.material,
                  quantity: item.quantity,
                  unitPrice: item.price,
                  unitCost: item.costPrice,
                  discount: 0,
                  subtotal: item.price * item.quantity,
                })),
              },
            },
            include: {
              items: {
                select: {
                  id: true,
                  productId: true,
                  printingServiceId: true,
                  rawMaterialProductId: true,
                  productName: true,
                  size: true,
                  material: true,
                  serviceNote: true,
                  rawMaterialQuantity: true,
                  rawMaterialUnit: true,
                  quantity: true,
                  unitPrice: true,
                  subtotal: true,
                  product: { select: { unit: true } },
                  printingService: { select: { unit: true } },
                },
              },
              salesperson: { select: { name: true } },
            },
          });

          const priceLogEntries = serverItems.flatMap((item) =>
            buildProductPriceLogEntries({
              productId: item.productId,
              storeId,
              before: {
                price: item.currentPrice,
                costPrice: item.costPrice,
              },
              after: {
                price: item.price,
                costPrice: item.costPrice,
              },
              actor: user,
              source: "SYSTEM",
              note: `Harga khusus untuk nota penawaran dengan nomor ${displayDraftNumber}`,
            }),
          );

          if (priceLogEntries.length > 0) {
            await tx.productPriceLog.createMany({ data: priceLogEntries });
          }

          return created;
        });
        break;
      } catch (err) {
        if (
          (err as { code?: string })?.code === "P2002" &&
          attempt < MAX_ATTEMPTS - 1
        ) {
          log.warn(
            `draftNumber collision on attempt ${attempt + 1}, retrying`,
          );
          continue;
        }
        throw err;
      }
    }

    return NextResponse.json(draft, { status: 201 });
  } catch (error) {
    const authErr = handleAuthError(error);
    if (authErr) return authErr;
    log.error("Failed to create draft transaction:", error);
    return NextResponse.json(
      { message: "Failed to create draft" },
      { status: 500 },
    );
  }
}
