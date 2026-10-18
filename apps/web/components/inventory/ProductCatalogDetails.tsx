"use client";

import type { CSSProperties } from "react";
import type { Product } from "@/hooks/useProducts";
import { ProductDescriptionTooltip } from "@/features/pos-product-variants/components/ProductDescriptionTooltip";
import { formatCompoundStock } from "@/features/product-stock-groups/stock-display";

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

export function ProductCatalogDetails({ product }: { product: Pick<Product, "description" | "unit" | "variants" | "stock" | "unitMultiplierToBase" | "stockGroup"> }) {
  const badges = getProductUnitBadges(product).map(badge => {
    const variant = product.variants?.find(item => item.unit.trim().toLowerCase() === badge.unit);
    const isProductUnit = product.unit.trim().toLowerCase() === badge.unit;
    const multiplier = variant?.unitMultiplierToBase ?? (isProductUnit ? product.unitMultiplierToBase : undefined);
    const stockGroup = variant?.stockGroup ?? product.stockGroup;
    const stockLabel = formatCompoundStock({
      stock: variant ? variant.stock : product.stock,
      unit: badge.unit,
      unitMultiplierToBase: multiplier,
      stockGroup,
    });
    const baseUnit = stockGroup?.baseUnit?.trim();
    const conversionLabel = baseUnit && baseUnit.toLowerCase() !== badge.unit &&
      typeof multiplier === "number" && Number.isFinite(multiplier) && multiplier > 0
      ? `1 ${badge.unit} = ${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 20 }).format(multiplier)} ${baseUnit}`
      : undefined;
    return { ...badge, stockLabel, conversionLabel };
  });
  return (
    <div className="mt-1.5 min-w-0 space-y-1.5">
      <ProductDescriptionTooltip description={product.description} />
      {badges.length > 0 && (
        <div aria-label="Satuan tersedia" className="flex flex-wrap gap-1.5">
          {badges.map(badge => (
            <span key={badge.unit}
              className="max-w-full break-words rounded-md border px-2 py-0.5 text-[11px] font-semibold text-slate-900 supports-[color:contrast-color(red)]:[color:contrast-color(var(--unit-badge-bg))]"
              style={{ backgroundColor: badge.backgroundColor, borderColor: badge.borderColor, "--unit-badge-bg": badge.backgroundColor } as CSSProperties}
            >{badge.stockLabel}</span>
          ))}
        </div>
      )}
      {badges.map(badge => badge.conversionLabel && (
        <p key={badge.unit} aria-label="Konversi satuan" className="break-words text-[11px] text-slate-600">
          {badge.conversionLabel}
        </p>
      ))}
    </div>
  );
}
