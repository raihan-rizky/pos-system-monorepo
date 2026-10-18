"use client";

import { useEffect, useMemo, useState } from "react";
import { History, ArrowUpRight } from "lucide-react";
import { useRole } from "@/components/providers/RoleProvider";
import { CHANGELOG } from "../data/changelog";
import { getPublishedChanges, getRecentChanges } from "../helpers/changelog";
import { ChangelogFeed } from "./ChangelogFeed";
import { WhatsNewDialog } from "./WhatsNewDialog";

export function ChangelogPage() {
  const { canAccess } = useRole();
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState<"all" | "recent">("all");
  const [showHighlights, setShowHighlights] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const published = useMemo(() => getPublishedChanges(CHANGELOG, now), [now]);
  const recent = useMemo(() => getRecentChanges(CHANGELOG, now), [now]);
  const entries = filter === "recent" ? recent : published;

  return (
    <main className="flex-1 overflow-y-auto bg-surface-50">
      <div className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-8 sm:pt-12 lg:px-10">
        <header className="mb-9 border-b border-surface-200 pb-7 sm:mb-12 sm:pb-9">
          <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-brand-700"><History className="h-4 w-4" aria-hidden="true" />Perkembangan aplikasi</div>
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <div><h1 className="text-3xl font-extrabold leading-tight tracking-tight text-surface-900 sm:text-4xl">Catatan Perubahan</h1><p className="mt-3 max-w-md text-sm leading-relaxed text-surface-500">Lihat yang baru. Kenali tampilannya. Langsung coba.</p></div>
            <button type="button" onClick={() => setShowHighlights(true)} className="inline-flex min-h-11 w-fit items-center gap-3 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">Sorotan 7 hari<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></button>
          </div>
        </header>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div role="group" aria-label="Rentang pembaruan" className="flex gap-1 rounded-xl border border-surface-200 bg-white p-1">
            {([{ value: "all", label: "Semua catatan" }, { value: "recent", label: "7 hari terakhir" }] as const).map(option => <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)} className={`min-h-10 rounded-lg px-3 text-xs font-bold transition-colors sm:px-4 sm:text-sm ${filter === option.value ? "bg-surface-900 text-white" : "text-surface-600 hover:bg-surface-100"}`}>{option.label}</button>)}
          </div>
          <p aria-live="polite" className="text-xs text-surface-500">{entries.length} pembaruan<span className="mx-2 text-surface-300">/</span>Waktu Indonesia Barat</p>
        </div>
        <ChangelogFeed entries={entries} recent={filter === "recent"} canAccess={canAccess} />
        <p className="mt-10 text-center text-xs text-surface-500">Setiap perubahan besar, satu catatan yang mudah diikuti.</p>
      </div>
      {showHighlights && <WhatsNewDialog entries={recent} canAccess={canAccess} onClose={() => setShowHighlights(false)} />}
    </main>
  );
}
