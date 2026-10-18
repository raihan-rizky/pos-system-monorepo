"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Maximize2 } from "lucide-react";
import type { ChangeEntry } from "../types";
import { formatChangeDate } from "../helpers/changelog";
import { ChangeIllustration } from "./ChangeIllustration";
import { ChangeDialog } from "./ChangeDialog";

const KIND_LABELS = { feature: "Fitur baru", improvement: "Peningkatan", fix: "Perbaikan" };

export function ChangeCard({ entry, canOpenFeature = false, compact = false }: { entry: ChangeEntry; canOpenFeature?: boolean; compact?: boolean }) {
  const [enlarged, setEnlarged] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const screenshot = entry.screenshot;

  return (
    <article id={entry.id} className="scroll-mt-8 overflow-hidden rounded-3xl border border-surface-200 bg-white">
      <div className={compact ? "" : "grid lg:grid-cols-[1.05fr_1fr]"}>
        <div className="relative min-w-0 bg-brand-50">
          {screenshot && !imageFailed ? (
            <button type="button" aria-label={`Perbesar gambar: ${entry.title}`} onClick={() => setEnlarged(true)} className={`group flex w-full flex-col items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-brand-600 ${compact ? "gap-2 px-4 py-4" : "min-h-72 gap-4 px-5 py-8"}`}>
              <img src={screenshot.src} alt={screenshot.alt} loading="lazy" onError={() => setImageFailed(true)} className={`${compact ? "max-h-36" : "max-h-80"} max-w-full rounded-xl border border-surface-200 bg-white object-contain shadow-sm transition-transform duration-200 group-hover:scale-[1.02] motion-reduce:transform-none`} />
              <span className="inline-flex items-center gap-2 text-xs font-semibold text-brand-800"><Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />Perbesar gambar</span>
            </button>
          ) : <ChangeIllustration visual={entry.visual} compact={compact} />}
        </div>
        <div className={`flex min-w-0 flex-col justify-center ${compact ? "p-4 sm:p-5" : "p-5 sm:p-7 lg:p-8"}`}>
          <div className={`${compact ? "mb-3" : "mb-4"} flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-semibold`}><span className="rounded-md bg-brand-50 px-2 py-1 text-brand-800">{KIND_LABELS[entry.kind]}</span><span className="text-surface-500">{entry.area}</span></div>
          <h2 className={`${compact ? "text-xl" : "text-2xl sm:text-3xl"} font-extrabold leading-tight tracking-tight text-surface-900`}>{entry.title}</h2>
          <p className={`${compact ? "mt-2 text-xs" : "mt-3 text-sm"} max-w-lg leading-relaxed text-surface-600`}>{entry.summary}</p>
          <div className={`${compact ? "mt-3" : "mt-6"} flex flex-wrap items-center justify-between gap-3`}>
            <time dateTime={entry.date} className="text-xs text-surface-500">{formatChangeDate(entry.date)}</time>
            {canOpenFeature && <Link href={entry.href} prefetch={false} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-bold text-brand-700 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">Buka fitur<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>}
          </div>
        </div>
      </div>
      <ol aria-label="Alur penggunaan" className={`grid border-t border-surface-100 bg-surface-50/70 ${compact ? "grid-cols-3 gap-2 p-3" : "gap-4 p-5 sm:grid-cols-3 sm:gap-6 sm:px-7"}`}>
        {entry.steps.map((step, i) => <li key={step.title} className={`relative flex min-w-0 items-start ${compact ? "flex-col gap-2" : "gap-3"}`}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-brand-200 bg-white text-xs font-bold text-brand-700">{i + 1}</span><div className="min-w-0 pr-2"><h3 className={`text-xs font-bold text-surface-800 ${compact ? "" : "sm:text-sm"}`}>{step.title}</h3><p className={compact ? "sr-only" : "mt-1 text-xs leading-relaxed text-surface-500"}>{step.detail}</p></div>{!compact && i < entry.steps.length - 1 && <ArrowRight className="absolute -right-3 top-1.5 hidden h-4 w-4 text-surface-300 sm:block" aria-hidden="true" />}</li>)}
      </ol>
      {screenshot && <ChangeDialog open={enlarged} onClose={() => setEnlarged(false)} title={entry.title} wide><figure className="flex flex-col items-center gap-4 p-5 sm:p-8"><img src={screenshot.src} alt={screenshot.alt} className="max-h-[68dvh] max-w-full rounded-xl object-contain" /><figcaption className="text-center text-sm text-surface-600">{screenshot.alt}</figcaption></figure></ChangeDialog>}
    </article>
  );
}
