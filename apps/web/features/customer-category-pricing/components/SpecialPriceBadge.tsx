import { Tag } from "lucide-react";

export function SpecialPriceBadge({ className = "" }: { className?: string }) {
  return (
    <span
      role="img"
      aria-label="Harga Khusus"
      title="Harga Khusus"
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-800 ${className}`}
    >
      <Tag aria-hidden="true" className="h-3.5 w-3.5" />
    </span>
  );
}
