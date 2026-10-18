"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ChangeEntry } from "../types";
import { ChangeCard } from "./ChangeCard";
import { ChangeDialog } from "./ChangeDialog";
import { ChangelogFeed } from "./ChangelogFeed";

export function WhatsNewDialog({ entries, onClose, canAccess }: {
  entries: readonly ChangeEntry[]; onClose: () => void; canAccess: (href: string) => boolean;
}) {
  const [index, setIndex] = useState(0);
  const current = entries[Math.min(index, Math.max(entries.length - 1, 0))];

  return (
    <ChangeDialog open onClose={onClose} title="Apa yang baru">
      <div className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold text-brand-800">Sorotan 7 hari terakhir</span><span className="text-surface-500">{entries.length} pembaruan</span></div>
        <div onClick={event => { if ((event.target as HTMLElement).closest("a")) onClose(); }}>
          {current ? <ChangeCard key={current.id} entry={current} compact canOpenFeature={canAccess(current.href)} /> : <ChangelogFeed entries={[]} recent />}
        </div>
        {entries.length > 1 && <div className="mt-4 flex items-center justify-between gap-4">
          <button type="button" onClick={() => setIndex(value => Math.max(0, value - 1))} disabled={index === 0} aria-label="Pembaruan sebelumnya" className="flex h-11 w-11 items-center justify-center rounded-xl border border-surface-200 bg-white text-surface-700 hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-40"><ArrowLeft className="h-4 w-4" aria-hidden="true" /></button>
          <span aria-live="polite" className="text-xs font-semibold text-surface-600">{index + 1} dari {entries.length}</span>
          <button type="button" onClick={() => setIndex(value => Math.min(entries.length - 1, value + 1))} disabled={index === entries.length - 1} aria-label="Pembaruan berikutnya" className="flex h-11 w-11 items-center justify-center rounded-xl border border-surface-200 bg-white text-surface-700 hover:bg-surface-100 disabled:cursor-not-allowed disabled:opacity-40"><ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
        </div>}
        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-surface-200 pt-4">
          <Link href="/changelog" prefetch={false} onClick={onClose} className="py-2 text-sm font-bold text-brand-700 hover:underline">Lihat semua catatan</Link>
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-brand-700">Sudah lihat</button>
        </footer>
      </div>
    </ChangeDialog>
  );
}
