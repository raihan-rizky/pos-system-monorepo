import { History } from "lucide-react";
import type { ChangeEntry } from "../types";
import { ChangeCard } from "./ChangeCard";

export function ChangelogFeed({ entries, recent = false, compact = false, canAccess = () => false }: {
  entries: readonly ChangeEntry[]; recent?: boolean; compact?: boolean; canAccess?: (href: string) => boolean;
}) {
  if (!entries.length) return <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-surface-200 bg-white px-6 py-16 text-center"><History className="h-9 w-9 text-surface-400" aria-hidden="true" /><h2 className="text-base font-bold text-surface-800">{recent ? "Belum ada pembaruan dalam 7 hari terakhir" : "Belum ada catatan perubahan"}</h2><p className="max-w-xs text-sm leading-relaxed text-surface-500">Kabar terbaru akan muncul di sini saat tersedia.</p></div>;
  return <div className="space-y-6 sm:space-y-9">{entries.map(entry => <ChangeCard key={entry.id} entry={entry} canOpenFeature={canAccess(entry.href)} compact={compact} />)}</div>;
}
