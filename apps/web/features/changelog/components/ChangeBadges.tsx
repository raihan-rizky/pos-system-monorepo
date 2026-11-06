import { CircleDot, Rocket, SlidersHorizontal, Sparkles, Wrench } from "lucide-react";
import type { ChangeEntry } from "../types";

const kinds = {
  feature: { label: "Fitur baru", Icon: Rocket, className: "border-brand-200 bg-brand-50 text-brand-800" },
  improvement: { label: "Peningkatan", Icon: SlidersHorizontal, className: "border-surface-200 bg-white text-surface-700" },
  fix: { label: "Perbaikan bug", Icon: Wrench, className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
} as const;

export function ChangeBadges({ entry }: { entry: Pick<ChangeEntry, "kind" | "impact"> }) {
  const major = entry.impact === "major";
  const ImpactIcon = major ? Sparkles : CircleDot;
  const { label, Icon, className } = kinds[entry.kind];
  const badge = "inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-bold leading-4";

  return <>
    <span className={`${badge} ${major ? "border-brand-200 bg-brand-100 text-brand-800" : "border-surface-200 bg-surface-100 text-surface-700"}`}>
      <ImpactIcon className="h-3 w-3 shrink-0" aria-hidden="true" />Pembaruan {major ? "besar" : "kecil"}
    </span>
    <span className={`${badge} ${className}`}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />{label}
    </span>
  </>;
}
