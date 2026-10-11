"use client";

import type { CSSProperties } from "react";
import type { Product } from "@/hooks/useProducts";
import { ProductDescriptionTooltip } from "@/features/pos-product-variants/components/ProductDescriptionTooltip";

type UnitProduct = { unit: string; variants?: { unit: string }[] };

const commonUnitHues = new Map<string, number>([
  ["pcs", 215], ["pak", 38], ["dus", 275], ["rim", 145],
  ["lembar", 345], ["botol", 185], ["box", 305], ["kg", 20],
]);

export function getProductUnitBadges(product: UnitProduct) {
  const units = [...new Set([product.unit, ...(product.variants ?? []).map(v => v.unit)]
    .map(unit => unit.trim().toLowerCase()).filter(Boolean))].sort();
  const usedHues = new Set<number>();
  return units.map(unit => {
    let hash = 2166136261;
    for (const character of unit) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
    let hue = commonUnitHues.get(unit) ?? Math.round(((hash * 137.508) % 360) * 1000) / 1000;
    while (usedHues.has(hue)) hue = (hue + 137.508) % 360;
    usedHues.add(hue);
    return { unit, backgroundColor: `hsl(${hue} 80% 94%)`, borderColor: `hsl(${hue} 55% 76%)` };
  });
}

export function ProductCatalogDetails({ product }: { product: Pick<Product, "description" | "unit" | "variants"> }) {
  const badges = getProductUnitBadges(product);
  return (
    <div className="mt-1.5 min-w-0 space-y-1.5">
      <ProductDescriptionTooltip description={product.description} />
      {badges.length > 0 && (
        <div aria-label="Satuan tersedia" className="flex flex-wrap gap-1.5">
          {badges.map(badge => (
            <span key={badge.unit}
              className="max-w-full break-words rounded-md border px-2 py-0.5 text-[11px] font-semibold text-slate-900 supports-[color:contrast-color(red)]:[color:contrast-color(var(--unit-badge-bg))]"
              style={{ backgroundColor: badge.backgroundColor, borderColor: badge.borderColor, "--unit-badge-bg": badge.backgroundColor } as CSSProperties}
            >{badge.unit}</span>
          ))}
        </div>
      )}
    </div>
  );
}
