import { Tag } from "lucide-react";
import { getPricingBadgeLabel, type AppliedCategoryPricing } from "../helpers/pricing-rules";

export function SpecialPriceBadge({ appliedPricing, className = "" }: { appliedPricing: Pick<AppliedCategoryPricing, "ruleId"> | null | undefined; className?: string }) {
  const label = getPricingBadgeLabel(appliedPricing);
  if (!label) return null;
  const colors = label === "Harga manual"
    ? "border-sky-200 bg-sky-50 text-sky-800"
    : "border-emerald-200 bg-emerald-50 text-emerald-800";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${colors} ${className}`}
    >
      <Tag aria-hidden="true" className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}
