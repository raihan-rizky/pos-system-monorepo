import { db } from '@pos/db';
import type { MonthlyPeriod } from '../helpers/monthly-report-core';
import type { MonthlySupplierDebt } from '../helpers/monthly-report-types';

type ValuationRow = { opening: string | null; closing: string | null };
type DebtRow = { id: string; date: string; dueDate: string | null; supplier: string; note: string | null; amount: string };

/** A period before the baseline is unknown; it must never be represented as zero. */
export async function getMonthlyBalances(storeId: string, period: MonthlyPeriod, now: Date) {
  const currentPeriod = now < period.end;
  const [valuationRows, debtRows] = await Promise.all([
    db.$queryRaw<ValuationRow[]>`
      SELECT
        CASE WHEN b."capturedAt" < ${period.start}::timestamptz THEN
          ROUND(b."value" + COALESCE((SELECT SUM(c."delta") FROM "pos_inventory_valuation_changes" c
            WHERE c."storeId" = ${storeId} AND c."occurredAt" >= b."capturedAt" AND c."occurredAt" < ${period.start}::timestamptz), 0), 2)::text
        ELSE NULL END AS opening,
        CASE WHEN ${currentPeriod} THEN
          (SELECT ROUND(COALESCE(SUM(GREATEST(p."stock"::numeric, 0) * p."price"), 0), 2)::text
             FROM "pos_products" p WHERE p."storeId" = ${storeId} AND p."isActive")
        WHEN b."capturedAt" < ${period.end}::timestamptz THEN
          ROUND(b."value" + COALESCE((SELECT SUM(c."delta") FROM "pos_inventory_valuation_changes" c
            WHERE c."storeId" = ${storeId} AND c."occurredAt" >= b."capturedAt" AND c."occurredAt" < ${period.end}::timestamptz), 0), 2)::text
        ELSE NULL END AS closing
      FROM (SELECT ${storeId}::text AS "storeId") s
      LEFT JOIN "pos_inventory_valuation_baselines" b ON b."storeId" = s."storeId"
    `,
    db.$queryRaw<DebtRow[]>`
      SELECT d."id", d."debtDate"::text AS date, d."dueDate"::text AS "dueDate",
        d."supplierName" AS supplier, d."note",
        (d."amount" - COALESCE(p."paid", 0))::text AS amount
      FROM "pos_supplier_payables" d
      LEFT JOIN LATERAL (
        SELECT SUM(payment."amount") AS paid FROM "pos_supplier_payable_payments" payment
        WHERE payment."payableId" = d."id" AND payment."paidAt" <= ${period.to}::date
      ) p ON true
      WHERE d."storeId" = ${storeId} AND d."debtDate" <= ${period.to}::date
        AND d."amount" - COALESCE(p."paid", 0) > 0
      ORDER BY d."debtDate", d."id"
    `,
  ]);
  const valuation = valuationRows[0];
  const debts: MonthlySupplierDebt[] = debtRows.map(row => ({ ...row, amount: Number(row.amount) }));
  return {
    openingInventoryBalance: valuation?.opening == null ? null : Number(valuation.opening),
    inventoryBalance: valuation?.closing == null ? null : Number(valuation.closing),
    supplierDebts: debts,
    supplierDebtBalance: debts.reduce((sum, debt) => sum + Math.round(debt.amount * 100), 0) / 100,
  };
}
