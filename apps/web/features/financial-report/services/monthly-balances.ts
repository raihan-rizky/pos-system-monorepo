import { db, type Prisma } from '@pos/db';
import type { MonthlyPeriod } from '../helpers/monthly-report-core';
import type { MonthlySupplierDebt } from '../helpers/monthly-report-types';

type ValuationRow = {
  opening: string | null;
  closing: string | null;
  opening_unvalued: number | null;
  closing_unvalued: number | null;
};
type DebtRow = { id: string; date: string; dueDate: string | null; supplier: string; note: string | null; amount: string };

/** A period before the baseline is unknown; it must never be represented as zero. */
export async function getMonthlyBalances(storeId: string, period: MonthlyPeriod, now: Date, tx?: Prisma.TransactionClient) {
  const currentPeriod = now < period.end;
  const client = tx ?? db;
  const [valuationRows, debtRows] = await Promise.all([
    client.$queryRaw<ValuationRow[]>`
      SELECT
        CASE WHEN b."capturedAt" <= ${period.start}::timestamptz
          AND EXISTS (SELECT 1 FROM pos_inventory_valuation_v2_closures c WHERE c."cutoff" = ${period.start}::timestamptz) THEN
          ROUND(b."value" + history.opening_delta, 2)::text
        ELSE NULL END AS opening,
        CASE WHEN ${currentPeriod} THEN
          current_value.value::text
        WHEN b."capturedAt" < ${period.end}::timestamptz
          AND EXISTS (SELECT 1 FROM pos_inventory_valuation_v2_closures c WHERE c."cutoff" = ${period.end}::timestamptz) THEN
          ROUND(b."value" + history.closing_delta, 2)::text
        ELSE NULL END AS closing,
        CASE WHEN b."capturedAt" <= ${period.start}::timestamptz
          AND EXISTS (SELECT 1 FROM pos_inventory_valuation_v2_closures c WHERE c."cutoff" = ${period.start}::timestamptz) THEN
          (b."unvaluedCount" + history.opening_unvalued)::int ELSE NULL END AS opening_unvalued,
        CASE WHEN ${currentPeriod} THEN current_value.unvalued
          WHEN b."capturedAt" < ${period.end}::timestamptz
            AND EXISTS (SELECT 1 FROM pos_inventory_valuation_v2_closures c WHERE c."cutoff" = ${period.end}::timestamptz) THEN
            (b."unvaluedCount" + history.closing_unvalued)::int ELSE NULL END AS closing_unvalued
      FROM (SELECT ${storeId}::text AS "storeId") s
      LEFT JOIN "pos_inventory_valuation_baselines" b ON b."storeId" = s."storeId" AND b.method = 'unit_hpp'
      CROSS JOIN LATERAL (
        SELECT COALESCE(SUM(e.value), 0) AS value, COALESCE(SUM(e.unvalued_count), 0)::int AS unvalued
        FROM pos_inventory_cost_entities(${storeId}) e
      ) current_value
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(c.delta) FILTER (WHERE c."occurredAt" < ${period.start}::timestamptz), 0) AS opening_delta,
          COALESCE(SUM(c.delta) FILTER (WHERE c."occurredAt" < ${period.end}::timestamptz), 0) AS closing_delta,
          COALESCE(SUM(c."unvaluedDelta") FILTER (WHERE c."occurredAt" < ${period.start}::timestamptz), 0) AS opening_unvalued,
          COALESCE(SUM(c."unvaluedDelta") FILTER (WHERE c."occurredAt" < ${period.end}::timestamptz), 0) AS closing_unvalued
        FROM pos_inventory_valuation_changes c
        WHERE c."storeId" = s."storeId" AND c.method = 'unit_hpp' AND c."occurredAt" >= b."capturedAt"
      ) history ON true
    `,
    client.$queryRaw<DebtRow[]>`
      SELECT d."id", d."debtDate"::text AS date, d."dueDate"::text AS "dueDate",
        d."supplierName" AS supplier, d."note",
        (d."amount" - COALESCE(p."paid", 0))::text AS amount
      FROM "pos_supplier_payables" d
      LEFT JOIN LATERAL (
        SELECT SUM(payment."amount") AS paid FROM "pos_supplier_payable_payments" payment
        WHERE payment."payableId" = d."id" AND payment."paidAt" <= ${period.to}::date
      ) p ON true
      WHERE d."storeId" = ${storeId} AND d."debtDate" <= ${period.to}::date
        AND (d."goodsPurchaseId" IS NULL OR d."giroHistoryVerifiedAt" IS NOT NULL)
        AND d."amount" - COALESCE(p."paid", 0) > 0
      ORDER BY d."debtDate", d."id"
    `,
  ]);
  const valuation = valuationRows[0];
  const debts: MonthlySupplierDebt[] = debtRows.map(row => ({ ...row, amount: Number(row.amount) }));
  return {
    openingInventoryBalance: valuation?.opening == null ? null : Number(valuation.opening),
    inventoryBalance: valuation?.closing == null ? null : Number(valuation.closing),
    openingInventoryUnvaluedCount: valuation?.opening_unvalued ?? null,
    inventoryUnvaluedCount: valuation?.closing_unvalued ?? null,
    supplierDebts: debts,
    supplierDebtBalance: debts.reduce((sum, debt) => sum + Math.round(debt.amount * 100), 0) / 100,
  };
}
