import { Input } from "@pos/ui";
import {
  createUnitVariantDraft, getProductUnitBadges, relativeUnitQuantity,
  resolveUnitVariantValues, normalizeProductUnitGroup,
  type UnitVariantDraft, type UnitPrimaryValues, type UnitBadgeRole,
} from "@/lib/product-form/product-unit-variants";

const badgeStyles = {
  primary: "bg-surface-100 text-surface-700", additional: "bg-surface-100 text-surface-700",
  small: "bg-emerald-50 text-emerald-800", large: "bg-violet-50 text-violet-800",
  equal: "bg-surface-100 text-surface-700",
};
const badgeLabels = { primary: "Unit utama", additional: "Unit tambahan", small: "Unit kecil", large: "Unit besar", equal: "Unit setara" };

export function UnitSizeBadge({ role }: { role: UnitBadgeRole }) {
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${badgeStyles[role]}`}>{badgeLabels[role]}</span>;
}

interface Props {
  primary: UnitPrimaryValues;
  rows: UnitVariantDraft[];
  onChange: (rows: UnitVariantDraft[]) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}

export function ProductUnitFields({ primary, rows, onChange, errors, disabled }: Props) {
  const badges = getProductUnitBadges(rows);
  let stockSummary: { unit: string; quantity: number }[] = [];
  if (rows.length) {
    try {
      const normalized = normalizeProductUnitGroup(primary.unit, Number(primary.stock), rows.map((row) => ({
        unit: row.unit, sku: "", price: 0, relativeQuantity: relativeUnitQuantity(row.direction, row.quantity),
      })));
      stockSummary = [{ unit: primary.unit, quantity: Number(primary.stock || "0") },
        ...rows.map((row, index) => ({ unit: row.unit, quantity: normalized.baseStock / normalized.additionalMultipliers[index] }))];
    } catch { /* Show the preview once units and conversions are complete. */ }
  }

  return <div className="space-y-4">
    {rows.map((row, index) => {
      const values = resolveUnitVariantValues(primary, row);
      const update = (changes: Partial<UnitVariantDraft>) => onChange(rows.map((item) => item.id === row.id ? { ...item, ...changes } : item));
      const errorId = `${row.id}-error`;
      const accessibility = { "aria-invalid": Boolean(errors[row.id]), "aria-describedby": errors[row.id] ? errorId : undefined };
      return <fieldset key={row.id} id={row.id} disabled={disabled} className="min-w-0 rounded-xl border border-surface-200 p-4">
        <legend className="px-1 text-sm font-medium text-surface-700">Unit tambahan {index + 1}</legend>
        <div className="mb-3 flex items-center justify-between gap-3">
          <UnitSizeBadge role={badges[index + 1]} />
          <button type="button" disabled={disabled} className="min-h-11 rounded-lg px-3 text-sm text-surface-700 hover:bg-surface-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600" aria-label={`Hapus unit tambahan ${index + 1}`} onClick={() => {
            onChange(rows.filter((item) => item.id !== row.id));
            requestAnimationFrame(() => document.getElementById("add-product-unit")?.focus());
          }}>Hapus unit</button>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input id={`${row.id}-unit`} label="Nama unit" placeholder="Contoh: dus, pcs, rim" className="placeholder:text-surface-500" autoFocus value={row.unit} {...accessibility} onChange={(event) => update({ unit: event.target.value })} />
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${row.id}-direction`} className="text-sm font-medium text-surface-700">Ukuran dibanding {primary.unit || "unit utama"}</label>
            <select id={`${row.id}-direction`} value={row.direction} onChange={(event) => update({ direction: event.target.value as UnitVariantDraft["direction"] })} className="min-h-11 w-full rounded-xl border border-surface-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
              <option value="larger">Lebih besar</option><option value="smaller">Lebih kecil</option>
            </select>
          </div>
          <Input id={`${row.id}-quantity`} label={row.direction === "larger" ? `Isi dalam 1 ${row.unit || "unit tambahan"}` : `Isi dalam 1 ${primary.unit || "unit utama"}`} type="number" min="1" step="any" placeholder="Contoh: 12" className="placeholder:text-surface-500" value={row.quantity} {...accessibility} onChange={(event) => update({ quantity: event.target.value })} />
          <Input id={`${row.id}-cost`} label="Harga modal" type="number" min="0" step="0.01" inputMode="decimal" value={values.costPrice} {...accessibility} onChange={(event) => update({ costPrice: event.target.value })} />
        </div>
        <p className="mt-3 text-sm text-surface-700">{row.direction === "larger"
          ? `1 ${row.unit || "unit tambahan"} = ${row.quantity || "…"} ${primary.unit || "unit utama"}`
          : `1 ${primary.unit || "unit utama"} = ${row.quantity || "…"} ${row.unit || "unit tambahan"}`}</p>
        <p className="mt-1 text-xs text-surface-600">Modal mengikuti konversi unit utama. Bisa diubah sesuai harga pembelian.</p>
        <details className="mt-2" data-unit-details>
          <summary className="flex min-h-11 cursor-pointer items-center text-sm text-surface-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">Detail tambahan (SKU, barcode, harga jual)</summary>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input id={`${row.id}-sku`} label="SKU unit" value={values.sku} {...accessibility} onChange={(event) => update({ sku: event.target.value, skuEdited: true })} />
            <Input id={`${row.id}-barcode`} label="Barcode (opsional)" value={row.barcode} onChange={(event) => update({ barcode: event.target.value })} />
            <div>
              <Input id={`${row.id}-price`} label="Harga jual" type="number" min="0" step="any" inputMode="decimal" value={values.price} {...accessibility} onChange={(event) => update({ price: event.target.value, priceEdited: true })} />
              <p className="mt-1 text-xs text-surface-600">Harga awal = modal unit ini + 35%. Bisa diubah sesuai kebutuhan.</p>
            </div>
          </div>
        </details>
        {errors[row.id] && <p id={errorId} role="alert" className="mt-2 text-sm text-red-700">{errors[row.id]}</p>}
      </fieldset>;
    })}
    <button id="add-product-unit" type="button" disabled={disabled} className="min-h-11 rounded-lg border border-surface-200 px-4 text-sm font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600" onClick={() => onChange([...rows, createUnitVariantDraft(`product-unit-${crypto.randomUUID()}`)])}>Tambah unit lain (opsional)</button>
    {rows.length > 0 && <div className="text-sm text-surface-700" aria-live="polite">
      <p>Semua unit otomatis dikelompokkan saat disimpan dan memakai stok yang sama.</p>
      {stockSummary.length > 0 && <div data-unit-stock-summary className="mt-3">
        <p className="font-medium">Stok awal yang sama dalam setiap unit:</p>
        <ul className="mt-2 space-y-2">
          {stockSummary.map((item, index) => <li key={index} className="flex flex-wrap items-center gap-2">
            <span>{new Intl.NumberFormat("id-ID", { maximumFractionDigits: 6 }).format(item.quantity)} {item.unit}</span>
            <UnitSizeBadge role={badges[index]} />
          </li>)}
        </ul>
        <p className="mt-2">Masukkan stok sekali saja di unit utama.</p>
      </div>}
    </div>}
  </div>;
}
