import { db, Prisma } from "@pos/db";
import { backdatedPurchaseView } from "./backdated-purchase-repository";
import { listShoppingRequests, type ShoppingRequestListFilters } from "../../shopping-requests/repositories/shopping-requests-repository";

export type MergedPurchaseFilters = ShoppingRequestListFilters & {
  recordType?: "SHOPPING_REQUEST" | "BACKDATED_PURCHASE";
  paymentStatus?: "UNPAID" | "PARTIAL" | "PAID";
};

/** Select the page from the union before loading the two kinds of detail. */
export async function listMergedPurchases(filters: MergedPurchaseFilters) {
  const q = filters.q ? `%${filters.q.replace(/[\\%_]/g, "\\$&")}%` : null;
  const due = filters.paymentDueDate ? new Date(`${filters.paymentDueDate}T00:00:00.000Z`) : null;
  const ordinary = filters.recordType === "BACKDATED_PURCHASE" || filters.paymentStatus
    ? Prisma.sql`SELECT NULL::text AS id, NULL::text AS kind, NULL::timestamp AS "createdAt" WHERE FALSE`
    : Prisma.sql`
      SELECT sr.id, 'SHOPPING_REQUEST'::text AS kind, sr."createdAt"
      FROM "pos_shopping_requests" sr
      WHERE sr."storeId" = ${filters.storeId}
        ${filters.status === "CANCELLED" ? Prisma.empty : Prisma.sql`
          AND NOT EXISTS (
            SELECT 1 FROM "pos_shopping_request_deletions" deleted
            WHERE deleted."shoppingRequestId" = sr.id AND deleted."storeId" = sr."storeId"
          )`}
        AND (${filters.status ?? null}::text IS NULL OR sr.status::text = ${filters.status ?? null})
        AND (${filters.supplierId ?? null}::text IS NULL OR sr."supplierId" = ${filters.supplierId ?? null})
        AND (${q}::text IS NULL OR sr.name ILIKE ${q} OR sr.number ILIKE ${q}
          OR sr."requestedByName" ILIKE ${q} OR EXISTS (
            SELECT 1 FROM "pos_goods_purchases" search_gp
            WHERE search_gp."shoppingRequestId" = sr.id AND search_gp.number ILIKE ${q}))
        AND ((${filters.fulfillmentStatus ?? null}::text IS NULL AND ${filters.paymentMethod ?? null}::text IS NULL AND ${due}::date IS NULL)
          OR EXISTS (SELECT 1 FROM "pos_goods_purchases" gp
            WHERE gp."shoppingRequestId" = sr.id AND (gp.status::text = 'APPROVED'
              ${filters.status === "CANCELLED" ? Prisma.sql`OR (gp.status::text = 'CANCELLED' AND gp."statusBeforeCancellation"::text = 'APPROVED')` : Prisma.empty})
              AND (${filters.fulfillmentStatus ?? null}::text IS NULL OR gp."fulfillmentStatus"::text = ${filters.fulfillmentStatus ?? null})
              AND ((${filters.paymentMethod ?? null}::text IS NULL AND ${due}::date IS NULL)
                OR EXISTS (SELECT 1 FROM "pos_goods_purchase_payments" payment
                  WHERE payment."goodsPurchaseId" = gp.id
                    AND (${filters.paymentMethod ?? null}::text IS NULL OR payment.method::text = ${filters.paymentMethod ?? null})
                    AND (${due}::date IS NULL OR payment."dueDate" = ${due}::date))
                OR (NOT EXISTS (SELECT 1 FROM "pos_goods_purchase_payments" payment WHERE payment."goodsPurchaseId" = gp.id)
                  AND (${filters.paymentMethod ?? null}::text IS NULL OR gp."paymentMethod"::text = ${filters.paymentMethod ?? null})
                  AND (${due}::date IS NULL OR gp."paymentDueDate" = ${due}::date)))))`;
  const historical = filters.recordType === "SHOPPING_REQUEST" || filters.status || filters.supplierId || filters.fulfillmentStatus
    ? Prisma.sql`SELECT NULL::text AS id, NULL::text AS kind, NULL::timestamp AS "createdAt" WHERE FALSE`
    : Prisma.sql`
      SELECT bp.id, 'BACKDATED_PURCHASE'::text AS kind, bp."createdAt"
      FROM "pos_backdated_purchases" bp
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(p.amount), 0) AS paid FROM "pos_backdated_purchase_payments" p WHERE p."purchaseId" = bp.id
      ) totals ON TRUE
      WHERE bp."storeId" = ${filters.storeId}
        AND (${q}::text IS NULL OR bp.reference ILIKE ${q})
        AND (${filters.paymentMethod ?? null}::text IS NULL OR bp."paymentMethod"::text = ${filters.paymentMethod ?? null})
        AND (${due}::date IS NULL OR bp."dueDate" = ${due}::date)
        AND (${filters.paymentStatus ?? null}::text IS NULL OR
          CASE WHEN totals.paid = 0 THEN 'UNPAID' WHEN totals.paid >= bp.amount THEN 'PAID' ELSE 'PARTIAL' END = ${filters.paymentStatus ?? null})`;
  const union = Prisma.sql`${ordinary} UNION ALL ${historical}`;
  const [ids, counts] = await Promise.all([
    db.$queryRaw<Array<{ id: string; kind: "SHOPPING_REQUEST" | "BACKDATED_PURCHASE" }>>`
      SELECT id, kind FROM (${union}) combined ORDER BY "createdAt" DESC, kind ASC, id DESC
      LIMIT ${filters.take} OFFSET ${filters.skip}
    `,
    db.$queryRaw<Array<{ total: bigint }>>`SELECT COUNT(*) AS total FROM (${union}) combined`,
  ]);
  const ordinaryIds = ids.filter(row => row.kind === "SHOPPING_REQUEST").map(row => row.id);
  const historicalIds = ids.filter(row => row.kind === "BACKDATED_PURCHASE").map(row => row.id);
  const [ordinaryRows, historicalRows] = await Promise.all([
    ordinaryIds.length ? listShoppingRequests({ storeId: filters.storeId, ids: ordinaryIds, skip: 0, take: ordinaryIds.length }) : [],
    historicalIds.length ? db.backdatedPurchase.findMany({
      where: { storeId: filters.storeId, id: { in: historicalIds } },
      include: { payments: { orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }, { id: "asc" }] } },
    }) : [],
  ]);
  const ordinaryMap = new Map(ordinaryRows.map(row => [row.id, { ...row, kind: "SHOPPING_REQUEST" as const }]));
  const historicalMap = new Map(historicalRows.map(row => [row.id, { ...backdatedPurchaseView(row), kind: "BACKDATED_PURCHASE" as const }]));
  const requests = ids.flatMap(({ id, kind }) => {
    const row = kind === "SHOPPING_REQUEST" ? ordinaryMap.get(id) : historicalMap.get(id);
    return row ? [row] : [];
  });
  return { total: Number(counts[0]?.total ?? 0), requests };
}
