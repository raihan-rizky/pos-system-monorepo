import { db } from "@pos/db";
import { calculateReceivableBalance } from "../helpers/receivable-balance";

const jakartaDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Jakarta",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getAsOfBounds(asOfDate: string) {
  const jakartaStart = new Date(`${asOfDate}T00:00:00+07:00`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ||
    !Number.isFinite(jakartaStart.getTime()) ||
    jakartaDateFormatter.format(jakartaStart) !== asOfDate
  ) {
    throw new RangeError("Pilih tanggal yang valid.");
  }

  return {
    invoiceDateEndExclusive: new Date(jakartaStart.getTime() + 86_400_000),
    debtDateInclusive: new Date(`${asOfDate}T00:00:00.000Z`),
  };
}

export async function loadReceivableBalance(storeId: string, asOfDate: string): Promise<number> {
  const { invoiceDateEndExclusive, debtDateInclusive } = getAsOfBounds(asOfDate);
  const [transactions, manualReceivables] = await Promise.all([
    db.transaction.findMany({
      where: {
        storeId,
        status: "COMPLETED",
        paymentMethod: "TEMPO",
        invoiceDate: { lt: invoiceDateEndExclusive },
      },
      select: { status: true, paymentMethod: true, total: true, amountPaid: true },
    }),
    db.customerReceivable.findMany({
      where: { storeId, debtDate: { lte: debtDateInclusive } },
      select: { amount: true, amountPaid: true },
    }),
  ]);

  return calculateReceivableBalance({ transactions, manualReceivables });
}
