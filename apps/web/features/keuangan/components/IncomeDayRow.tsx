import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatRupiahPrecise } from "@/lib/utils";
import { buildReceiptHistoryUrl } from "@/features/transaction-history/helpers/receipt-history";

type Props = { date: string; label: string; total: number; count: number; manualCount: number; canOpenHistory: boolean };
export function IncomeDayRow({ date, label, total, count, manualCount, canOpenHistory }: Props) {
  const content = <><div className="flex min-w-0 flex-col"><span className="truncate text-sm font-semibold text-surface-900">{label}</span><span className="text-xs text-surface-500">{count} nota lunas dibuat · {manualCount} manual</span></div><div className="flex shrink-0 items-center gap-2"><span className="text-sm font-semibold tabular-nums text-emerald-700">{formatRupiahPrecise(total)}</span>{canOpenHistory && <ChevronRight className="h-3.5 w-3.5 text-surface-300 transition-colors group-hover:text-emerald-600" aria-hidden="true" />}</div></>;
  const classes = "flex min-h-11 items-center justify-between gap-3 px-3 py-2.5 sm:px-4";
  return canOpenHistory ? <Link href={buildReceiptHistoryUrl({ date, mode: "receipt" })} className={`${classes} group cursor-pointer transition-colors hover:bg-surface-50 focus:outline-none focus-visible:bg-surface-50`}>{content}</Link> : <div className={classes}>{content}</div>;
}
