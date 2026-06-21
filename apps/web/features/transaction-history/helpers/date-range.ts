export type TransactionHistoryQuickDateFilter = "daily" | "weekly" | "monthly";

export type TransactionHistoryDateRange = {
  dateFrom: string;
  dateTo: string;
};

function jakartaDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function addJakartaDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00+07:00`);
  date.setUTCDate(date.getUTCDate() + days);
  return jakartaDateKey(date);
}

export function buildTransactionHistoryQuickDateRange(
  filter: TransactionHistoryQuickDateFilter,
  now = new Date(),
): TransactionHistoryDateRange {
  const today = jakartaDateKey(now);

  if (filter === "weekly") {
    return {
      dateFrom: addJakartaDays(today, -6),
      dateTo: today,
    };
  }

  if (filter === "monthly") {
    return {
      dateFrom: `${today.slice(0, 8)}01`,
      dateTo: today,
    };
  }

  return {
    dateFrom: today,
    dateTo: today,
  };
}
