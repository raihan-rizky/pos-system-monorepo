import { roundSellingPrice, type PriceRoundingSettings } from "../rounding";
import { PriceRoundingBadge } from "./PriceRoundingBadge";

const money = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 2 });

/** Master prices and conversion inputs stay raw; only this selling preview is rounded. */
export function PriceRoundingPreview({ price, settings, label = "Harga jual berlaku" }: {
  price: number | string | null | undefined;
  settings?: PriceRoundingSettings;
  label?: string;
}) {
  if (price == null || String(price).trim() === "") return null;
  let rounding;
  try { rounding = roundSellingPrice(Number(price), settings); } catch { return null; }
  return <div className="min-w-0 text-xs text-surface-600">
    <span>{label} · <strong className="tabular-nums">{money.format(rounding.roundedPrice)}</strong></span>
    <PriceRoundingBadge rounding={rounding} />
  </div>;
}
