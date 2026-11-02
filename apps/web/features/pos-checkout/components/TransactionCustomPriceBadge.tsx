import { Tag } from "lucide-react";

export function TransactionCustomPriceBadge() {
  return (
    <span title="Hanya berlaku untuk nota ini" className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold leading-4 text-amber-800">
      <Tag className="h-3 w-3" aria-hidden="true" />
      Harga custom
    </span>
  );
}
