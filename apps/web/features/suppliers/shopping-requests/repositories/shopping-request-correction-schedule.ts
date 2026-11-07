import { Prisma } from "@pos/db";
import type { CorrectionPaymentSchedule } from "../types/shopping-request-correction";

export function resolveCorrectionSchedule(input: { total: string; schedule?: CorrectionPaymentSchedule[]; previous: CorrectionPaymentSchedule[]; method: "TRANSFER" | "GIRO" | null; dueDate: string | null }): CorrectionPaymentSchedule[] {
  if (!input.schedule && input.previous.length > 1) throw new Error("Isi rincian seluruh jadwal pembayaran untuk koreksi ini.");
  const rows = input.schedule ?? (input.method ? [{ method: input.method, amount: input.total, dueDate: input.dueDate, note: input.previous[0]?.note ?? null }] : []);
  if (!rows.length) return [];
  if (rows.some(row => row.method === "GIRO" && !row.dueDate)) throw new Error("Tanggal jatuh tempo Giro wajib diisi.");
  if (!rows.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)).equals(input.total)) throw new Error("Total jadwal pembayaran harus sama dengan biaya pembelian terkoreksi.");
  return rows.map(row => ({ ...row, amount: new Prisma.Decimal(row.amount).toFixed(2), dueDate: row.method === "GIRO" ? row.dueDate : null }));
}

/** Keep early commitments; absorb decreases in the latest Giro first. Actual cash is separate. */
export function resizeCorrectionSchedule(rows: CorrectionPaymentSchedule[], total: string): CorrectionPaymentSchedule[] {
  if (!rows.length) return [];
  const result = rows.map(row => ({ ...row }));
  let delta = new Prisma.Decimal(total).minus(rows.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)));
  const priority = result.map((row, index) => ({ ...row, index })).sort((a, b) =>
    Number(b.method === "GIRO") - Number(a.method === "GIRO") || (b.dueDate ?? "").localeCompare(a.dueDate ?? "") || b.index - a.index);
  if (delta.greaterThan(0)) result[priority[0].index].amount = new Prisma.Decimal(result[priority[0].index].amount).plus(delta).toFixed(2);
  else for (const row of priority) {
    const reduction = Prisma.Decimal.min(new Prisma.Decimal(row.amount), delta.negated());
    result[row.index].amount = new Prisma.Decimal(row.amount).minus(reduction).toFixed(2);
    delta = delta.plus(reduction);
    if (delta.isZero()) break;
  }
  return result;
}
