"use client";

import Link from "next/link";
import { ArrowUpRight, FileClock, FileText, FolderInput, History, Layers, Package, ReceiptText, ShieldCheck, ShoppingBag } from "lucide-react";
import type { ChangeEntry } from "../types";
import { formatChangeDate } from "../helpers/changelog";
import { ChangeBadges } from "./ChangeBadges";
import { ChangeDialog } from "./ChangeDialog";

const icons = { changelog: History, tax: ReceiptText, categories: FolderInput, units: Package, quotation: FileText, "stock-groups": Layers, printing: FileText, shopping: ShoppingBag, "history-table": History, "receipt-audit": FileClock, financial: FileText, rbac: ShieldCheck };
const badgeDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });

export function WhatsNewDialog({ entries, onClose, canAccess }: {
  entries: readonly ChangeEntry[]; onClose: () => void; canAccess: (href: string) => boolean;
}) {
  return (
    <ChangeDialog open onClose={onClose} title="Apa yang baru" compact>
      <div className="min-h-0 overflow-y-auto overscroll-contain bg-white px-4 sm:px-6">
        <p className="flex items-center justify-between gap-3 px-1 pb-2 pt-4 text-xs text-surface-500">
          <span>7 hari terakhir</span><span>{entries.length} pembaruan</span>
        </p>
        {entries.length ? <ul aria-label="Pembaruan 7 hari terakhir" className="space-y-1.5 pb-4">
          {entries.map(entry => {
            const Icon = icons[entry.visual];
            const content = <>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${entry.impact === "major" ? "bg-brand-600 text-white" : "bg-white text-brand-700"}`}><Icon className="h-[18px] w-[18px]" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 text-sm font-bold leading-5 text-surface-900">{entry.highlight.title}</span>
                  <time dateTime={entry.date} title={formatChangeDate(entry.date)} className="shrink-0 whitespace-nowrap text-[10px] font-semibold leading-5 text-surface-500">{badgeDate.format(new Date(`${entry.date}T00:00:00+07:00`))}</time>
                </span>
                <span className="mt-0.5 block text-xs leading-[18px] text-surface-600">{entry.highlight.summary}</span>
                <span className="mt-2 flex flex-wrap items-center gap-1"><ChangeBadges entry={entry} /></span>
              </span>
            </>;
            const rowClass = `flex items-start gap-3 rounded-2xl border px-3 py-2.5 ${entry.impact === "major" ? "border-brand-200 bg-brand-50/70" : "border-surface-100 bg-surface-50/70"}`;
            return <li key={entry.id}>
              {canAccess(entry.href) ? <Link href={entry.href} prefetch={false} onClick={onClose} className={`${rowClass} transition-colors hover:border-brand-300 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600`}>
                {content}<ArrowUpRight className="mt-1 h-4 w-4 shrink-0 text-surface-400" aria-hidden="true" />
              </Link> : <div className={rowClass}>{content}</div>}
            </li>;
          })}
        </ul> : <p className="px-1 py-7 text-sm text-surface-600">Belum ada pembaruan dalam 7 hari terakhir</p>}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-surface-200 bg-surface-50 px-5 py-3 sm:px-7">
        <Link href="/changelog" prefetch={false} onClick={onClose} className="py-2 text-xs font-semibold text-brand-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600 sm:text-sm">Lihat semua catatan</Link>
        <button type="button" onClick={onClose} className="min-h-11 shrink-0 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">Sudah lihat</button>
      </footer>
    </ChangeDialog>
  );
}
