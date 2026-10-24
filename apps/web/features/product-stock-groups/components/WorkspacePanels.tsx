"use client";

import { adjustmentFactor } from "../pricing-drafts";
import { decimalToRatio, multiplyRatios, divideRatios, roundMoney } from "../automatic-pricing";
import { useId, useState } from "react";
import type { StockGroupWorkspaceContentProps } from "./StockGroupWorkspace";
import { buildUnitManagementDraft } from "./StockGroupWorkspace";
import { StockGroupTree } from "./StockGroupTree";
import {
  additionResult,
  conversionResult,
  conversionHasChanges,
  parseNumber,
  priceValid,
  stockInUnit,
  type PriceDraft,
} from "../workspace-drafts";

const inputClass =
  "mt-1 min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-blue-600 disabled:bg-slate-100";
const buttonClass =
  "min-h-11 rounded-xl bg-blue-700 px-4 text-sm font-semibold text-white focus-visible:outline-blue-600 disabled:bg-slate-200 disabled:text-slate-600";
const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
const quantity = (value: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 6 }).format(value);
function Field({
  label,
  value,
  onChange,
  error,
  disabled,
  readOnly,
  numeric = true,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  error?: string;
  disabled?: boolean;
  readOnly?: boolean;
  numeric?: boolean;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="text-sm font-semibold text-slate-700">
        {label}
      </label>
      <input
        id={id}
        className={inputClass}
        value={value}
        inputMode={numeric ? "decimal" : "text"}
        onChange={(event) => onChange?.(event.target.value)}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}
function UnitSelect({
  label,
  value,
  detail,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  detail: StockGroupWorkspaceContentProps["detail"];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-700">{label}</label>
      <select
        id={id}
        className={inputClass}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {detail.variants.map((v) => (
          <option value={v.id} key={v.id}>
            {v.unit}
          </option>
        ))}
      </select>
    </div>
  );
}
function Status({ status }: { status?: { error?: string; success?: string } }) {
  return (
    <>
      {status?.error && (
        <p
          role="alert"
          className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
        >
          {status.error}
        </p>
      )}
      {status?.success && (
        <p
          role="status"
          className="rounded-xl bg-green-50 p-3 text-sm text-green-800"
        >
          {status.success}
        </p>
      )}
    </>
  );
}
function PermissionHint() {
  return (
    <p className="text-sm text-slate-700">
      Anda belum memiliki izin untuk menyimpan perubahan ini.
    </p>
  );
}

export function SummaryPanel(
  props: StockGroupWorkspaceContentProps & {
    editorOpen: boolean;
    onOpenEditor: () => void;
  },
) {
  const { detail } = props;
  const [unitMessage, setUnitMessage] = useState("");
  const oldMultiplier =
    props.stockInputMode === "BASE"
      ? 1
      : (detail.variants.find((v) => v.id === props.stockVariantProductId)
          ?.unitMultiplierToBase ?? NaN);
  const amount = parseNumber(props.sharedStock);
  const nextBaseStock =
    amount === null || !Number.isFinite(oldMultiplier)
      ? null
      : amount * oldMultiplier;
  const stockInvalid =
    amount === null ? "Isi jumlah akhir dengan angka yang valid." : undefined;
  const changed = props.stockChanged ?? nextBaseStock !== detail.baseStock;
  return (
    <section className="space-y-6">
      {detail.hasNegativeStock && (
        <p
          role="status"
          className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
        >
          Stok bersama saat ini negatif. Periksa transaksi dan stok fisik
          sebelum mengubahnya.
        </p>
      )}
      {detail.hasDuplicateUnits && (
        <p
          role="status"
          className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
        >
          Ada satuan duplikat. Periksa produk anggota grup sebelum melanjutkan.
        </p>
      )}
      <StockGroupTree {...props} />
      {props.canUpdateStock && (
        <div className="space-y-4 border-t border-slate-200 pt-5">
          {!props.editorOpen ? (
            <button
              type="button"
              className={buttonClass}
              onClick={props.onOpenEditor}
            >
              Tetapkan stok akhir
            </button>
          ) : (
            <>
              <div>
                <h3 className="font-bold">Tetapkan stok akhir</h3>
                <p className="mt-1 text-sm text-slate-700">
                  Angka ini menjadi stok akhir grup, bukan jumlah yang
                  ditambahkan.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Jumlah akhir"
                  value={props.sharedStock}
                  onChange={props.onSharedStockChange}
                  error={stockInvalid}
                  disabled={props.isSaving}
                />
                <label className="text-sm font-semibold text-slate-700">
                  Satuan input
                  <select
                    value={
                      props.stockInputMode === "BASE"
                        ? "BASE"
                        : props.stockVariantProductId
                    }
                    className={inputClass}
                    disabled={props.isSaving}
                    onChange={(event) => {
                      const nextMultiplier =
                        event.target.value === "BASE"
                          ? 1
                          : (detail.variants.find(
                              (v) => v.id === event.target.value,
                            )?.unitMultiplierToBase ?? NaN);
                      const nextAmount = stockInUnit(
                        props.sharedStock,
                        oldMultiplier,
                        nextMultiplier,
                      );
                      props.onSharedStockChange(nextAmount);
                      setUnitMessage(
                        nextAmount
                          ? "Jumlah dikonversi agar persediaan tetap sama."
                          : "Isi kembali jumlah akhir setelah memilih satuan.",
                      );
                      props.onStockInputModeChange(
                        event.target.value === "BASE" ? "BASE" : "VARIANT",
                      );
                      if (event.target.value !== "BASE")
                        props.onStockVariantProductIdChange(event.target.value);
                    }}
                  >
                    <option value="BASE">
                      {detail.baseUnit} (satuan acuan)
                    </option>
                    {detail.variants
                      .filter(
                        (v) =>
                          v.unit.trim().toLowerCase() !==
                          detail.baseUnit.trim().toLowerCase(),
                      )
                      .map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.unit}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {unitMessage && (
                <p role="status" className="text-sm text-slate-700">
                  {unitMessage}
                </p>
              )}
              <Field
                label="Catatan (opsional)"
                value={props.note}
                onChange={props.onNoteChange}
                numeric={false}
                disabled={props.isSaving}
              />
              {nextBaseStock !== null && (
                <div className="space-y-2 rounded-xl bg-slate-50 p-4">
                  <p className="text-sm font-bold">Stok sebelum dan sesudah</p>
                  {detail.variants.map((v) => (
                    <p key={v.id} className="text-sm text-slate-700">
                      {v.unit}:{" "}
                      {quantity(detail.baseStock / v.unitMultiplierToBase)} →{" "}
                      {quantity(nextBaseStock / v.unitMultiplierToBase)}
                    </p>
                  ))}
                  {nextBaseStock < 0 && (
                    <p className="text-sm text-amber-900">
                      Stok akhir negatif. Pastikan sesuai hasil pemeriksaan
                      persediaan.
                    </p>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-700">
                Server memvalidasi data terkini saat menyimpan.
              </p>
              <Status status={props.statuses?.stock} />
              <button
                type="button"
                className={buttonClass}
                disabled={
                  props.isSaving || stockInvalid !== undefined || !changed
                }
                onClick={props.onSaveSharedStock}
              >
                Simpan stok akhir
              </button>
            </>
          )}
          <p className="text-sm text-slate-700">
            Untuk menambah atau mengurangi stok melalui pengajuan, gunakan
            Inventori dan proses persetujuan yang tersedia.
          </p>
          {props.canRequestStockChange && (
            <a
              href="/inventory"
              onClick={props.onInventoryNavigate}
              className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 text-sm font-semibold text-blue-700 focus-visible:outline-blue-600"
            >
              Ajukan perubahan stok di Inventori
            </a>
          )}
        </div>
      )}
    </section>
  );
}

export function ConversionPanel(props: StockGroupWorkspaceContentProps) {
  const draft = props.conversionDraft ?? buildUnitManagementDraft(props.detail);
  const result = conversionResult(props.detail, draft);
  const disabled = props.isSaving || !props.canUpdateProducts;
  const update = (next: Partial<typeof draft>) =>
    props.onConversionDraftChange?.({ ...draft, ...next });
  const base = props.detail.variants.find((v) => v.id === draft.baseProductId);
  const changed =
    props.conversionChanged ??
    conversionHasChanges(props.detail, draft);
  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-lg font-bold">Satuan dan konversi</h3>
        <p className="mt-1 text-sm text-slate-700">
          Tulis hubungan jumlah antar satuan. Satuan acuan dipakai untuk
          mencatat stok bersama.
        </p>
      </div>
      <UnitSelect
        label="Satuan acuan"
        detail={props.detail}
        value={draft.baseProductId}
        disabled={disabled}
        onChange={(id) => {
          const factor = parseNumber(draft.directMultipliers[id] ?? "");
          update({
            baseProductId: id,
            directMultipliers:
              factor && factor > 0
                ? Object.fromEntries(
                    Object.entries(draft.directMultipliers).map(
                      ([key, value]) => [key, String(Number(value) / factor)],
                    ),
                  )
                : draft.directMultipliers,
          });
        }}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Jumlah asal"
          value={draft.fromQuantity}
          onChange={(value) => update({ fromQuantity: value })}
          disabled={disabled || draft.editMode === "DIRECT"}
          error={
            draft.editMode === "PAIR" &&
            (parseNumber(draft.fromQuantity) ?? 0) <= 0
              ? "Isi jumlah positif."
              : undefined
          }
        />
        <UnitSelect
          label="Satuan asal"
          value={draft.fromProductId}
          detail={props.detail}
          disabled={disabled}
          onChange={(value) => update({ fromProductId: value })}
        />
        <Field
          label="Jumlah setara"
          value={draft.toQuantity}
          onChange={(value) => update({ toQuantity: value })}
          disabled={disabled || draft.editMode === "DIRECT"}
          error={
            draft.editMode === "PAIR" &&
            (parseNumber(draft.toQuantity) ?? 0) <= 0
              ? "Isi jumlah positif."
              : undefined
          }
        />
        <UnitSelect
          label="Satuan tujuan"
          value={draft.toProductId}
          detail={props.detail}
          disabled={disabled || draft.editMode === "DIRECT"}
          onChange={(value) => update({ toProductId: value })}
        />
      </div>
      {draft.editMode === "PAIR" && (
        <p className="text-sm font-semibold text-slate-700">
          {draft.fromQuantity || "…"}{" "}
          {
            props.detail.variants.find((v) => v.id === draft.fromProductId)
              ?.unit
          }{" "}
          = {draft.toQuantity || "…"}{" "}
          {props.detail.variants.find((v) => v.id === draft.toProductId)?.unit}
        </p>
      )}
      <details
        className="rounded-xl border border-slate-200 p-4"
        open={draft.editMode === "DIRECT"}
        onToggle={(event) => {
          const next = event.currentTarget.open ? "DIRECT" : "PAIR";
          if (next !== draft.editMode && !disabled) update({
            editMode: next,
            ...(next === "DIRECT" && !draft.directMultipliersEdited && result.resolved
              ? { directMultipliers: Object.fromEntries(result.resolved.variants.map((v) => [v.id, String(v.unitMultiplierToBase)])) }
              : {}),
          });
        }}
      >
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">
          Pengaturan lanjutan
        </summary>
        <p className="mb-3 text-sm text-slate-700">
          Isi pengali setiap satuan terhadap satuan acuan.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {props.detail.variants.map((v) => (
            <Field
              key={v.id}
              label={`1 ${v.unit} = jumlah ${base?.unit ?? props.detail.baseUnit}`}
              value={
                v.id === draft.baseProductId
                  ? "1"
                  : (draft.directMultipliers[v.id] ?? "")
              }
              disabled={disabled || v.id === draft.baseProductId}
              onChange={(value) =>
                update({
                  directMultipliersEdited: true,
                  directMultipliers: {
                    ...draft.directMultipliers,
                    [v.id]: value,
                  },
                })
              }
              error={
                v.id !== draft.baseProductId &&
                (parseNumber(draft.directMultipliers[v.id] ?? "") ?? 0) <= 0
                  ? "Isi jumlah positif."
                  : undefined
              }
            />
          ))}
        </div>
      </details>
      <label className="block text-sm font-semibold text-slate-700">
        Dampak pada stok
        <select
          className={inputClass}
          value={draft.mode}
          disabled={disabled}
          onChange={(event) =>
            update({ mode: event.target.value as typeof draft.mode })
          }
        >
          <option value="KEEP_SHARED_STOCK">Pertahankan stok bersama</option>
          <option value="PRESERVE_SOURCE_STOCK">
            Ikuti stok satuan sumber
          </option>
        </select>
      </label>
      <p className="text-sm text-slate-700">
        {draft.mode === "KEEP_SHARED_STOCK"
          ? "Persediaan bersama tetap sama. Angka stok menyesuaikan bila satuan acuan berubah."
          : "Stok grup dihitung mengikuti stok satuan asal dengan konversi baru."}
      </p>
      {result.error ? (
        <p
          role="alert"
          className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
        >
          {result.error}
        </p>
      ) : (
        <div className="space-y-3 rounded-xl bg-slate-50 p-4">
          <p className="text-sm font-bold">
            Satuan acuan: {props.detail.baseUnit} → {base?.unit}
          </p>
          {result.resolved!.preview.map((row) => {
            const v = props.detail.variants.find(
                (v) => v.id === row.productId,
              )!,
              next = result.resolved!.variants.find(
                (v) => v.id === row.productId,
              )!;
            return (
              <div
                key={row.productId}
                className="border-t border-slate-200 pt-3 text-sm text-slate-700"
              >
                <p className="font-semibold">{v.unit}</p>
                <p>
                  Konversi lama: 1 {v.unit} = {quantity(v.unitMultiplierToBase)}{" "}
                  {props.detail.baseUnit}
                </p>
                <p>
                  Konversi baru: 1 {v.unit} ={" "}
                  {quantity(next.unitMultiplierToBase)} {base?.unit}
                </p>
                <p>
                  Stok sebelum: {quantity(row.oldDisplayStock)} {v.unit}
                </p>
                <p>
                  Stok sesudah: {quantity(row.newDisplayStock)} {v.unit}
                </p>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-slate-700">
        Server memvalidasi data terkini saat menyimpan.
      </p>
      <Status status={props.statuses?.conversion} />
      {!props.canUpdateProducts && <PermissionHint />}
      <button
        type="button"
        className={buttonClass}
        disabled={disabled || !!result.error || !changed}
        onClick={props.onSaveConversion}
      >
        Simpan konversi satuan
      </button>
    </section>
  );
}

export function PricingPanel(props: StockGroupWorkspaceContentProps) {
  return (
    <section className="space-y-5">
      <h3 className="text-lg font-bold">Harga per satuan</h3>
      {!props.canUpdateProducts && <PermissionHint />}
      {props.detail.variants.map((v) => {
        const draft: PriceDraft = props.priceDrafts?.[v.id] ?? {
          price: String(v.price),
          costPrice: v.costPrice == null ? "" : String(v.costPrice),
          note: "",
        };
        const price = parseNumber(draft.price),
          cost = parseNumber(draft.costPrice),
          valid = priceValid(draft),
          amount = valid && price !== null && cost !== null ? price - cost : null;
        const update = (next: Partial<PriceDraft>) =>
          props.onPriceDraftChange?.(v.id, { ...draft, ...next });
        const changed =
          props.priceChanged?.[v.id] ??
          (draft.price !== String(v.price) ||
            draft.costPrice !==
              (v.costPrice == null ? "" : String(v.costPrice)) ||
            !!draft.note.trim());
        return (
          <fieldset
            key={v.id}
            aria-label={`Harga ${v.unit}`}
            className="space-y-4 rounded-xl border border-slate-200 p-4"
          >
            <legend className="px-1 font-semibold">
              {v.unit} • {v.sku}
            </legend>
            <p className="text-sm text-slate-700">
              {!valid
                ? "Periksa harga jual dan HPP sebelum menghitung margin."
                : amount === null
                ? "HPP belum diisi; margin belum dapat dihitung."
                : `Margin ${money(amount)} (${price === 0 ? "0" : ((amount / price!) * 100).toFixed(1)}%)`}
            </p>
            {amount !== null && amount < 0 && (
              <p className="text-sm text-amber-900">
                Harga jual lebih rendah dari HPP. Margin satuan ini negatif.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Harga jual"
                value={draft.price}
                onChange={(value) => update({ price: value })}
                disabled={props.isSaving || !props.canUpdateProducts}
                error={
                  price === null || price < 0
                    ? "Isi harga jual dengan angka nol atau lebih."
                    : undefined
                }
              />
              <Field
                label="HPP (opsional)"
                value={draft.costPrice}
                onChange={(value) => update({ costPrice: value })}
                disabled={props.isSaving || !props.canUpdateProducts}
                error={
                  draft.costPrice.trim() && (cost === null || cost < 0)
                    ? "Isi HPP dengan angka nol atau lebih."
                    : undefined
                }
              />
            </div>
            <Field
              label="Catatan harga (opsional)"
              value={draft.note}
              onChange={(value) => update({ note: value })}
              disabled={props.isSaving || !props.canUpdateProducts}
              numeric={false}
            />
            <Status status={props.statuses?.[`price-${v.id}`]} />
            <button
              type="button"
              className={buttonClass}
              disabled={
                props.isSaving ||
                !props.canUpdateProducts ||
                !priceValid(draft) ||
                !changed
              }
              onClick={() => props.onSavePrice?.(v.id)}
            >
              Simpan harga {v.unit}
            </button>
          </fieldset>
        );
      })}
    </section>
  );
}

export function AdditionPanel(props: StockGroupWorkspaceContentProps) {
  const draft = props.newVariantDraft;
  const result = additionResult(props.detail, draft),
    disabled = props.isSaving || !props.canCreateProducts;
  const automatic = !!props.detail.pricing && draft?.pricingMode !== "MANUAL";
  let estimatedPrice = "", estimatedCost = "";
  try {
    const source = props.detail.pricing?.members.find(member => member.productId === props.detail.pricing?.config.sourceProductId);
    const sourceUnit = props.detail.variants.find(member => member.id === source?.productId);
    const target = props.detail.variants.find(member => member.id === draft?.conversionToProductId);
    if (source && sourceUnit && target && draft) {
      const ratio = divideRatios(multiplyRatios(decimalToRatio(draft.conversionToQuantity), decimalToRatio(target.unitMultiplierToBase)), multiplyRatios(decimalToRatio(draft.conversionFromQuantity), decimalToRatio(sourceUnit.unitMultiplierToBase)));
      estimatedPrice = roundMoney(multiplyRatios(decimalToRatio(source.price), ratio, adjustmentFactor(draft.adjustment ?? "none", draft.percent ?? "0")));
      estimatedCost = source.costPrice === null ? "" : roundMoney(multiplyRatios(decimalToRatio(source.costPrice), ratio));
    }
  } catch { /* The existing validation describes incomplete conversion inputs. */ }
  const update = (next: Partial<NonNullable<typeof draft>>) => {
    if (draft) props.onNewVariantDraftChange?.({ ...draft, ...next });
  };
  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-lg font-bold">Tambah satuan</h3>
        <p className="mt-1 text-sm leading-6 text-slate-700">
          Satuan baru memakai persediaan bersama dan tidak menambah stok grup.
          Nama produk dan SKU mengikuti grup.
        </p>
      </div>
      {props.detail.pricing && <div className="space-y-3">
        <label className="block text-sm font-semibold">Mode harga satuan baru<select aria-label="Mode harga satuan baru" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus-visible:outline-blue-600" value={draft?.pricingMode ?? "AUTO"} disabled={disabled} onChange={event => update({ pricingMode: event.target.value as "AUTO" | "MANUAL" })}><option value="AUTO">Auto — mengikuti sumber</option><option value="MANUAL">Manual — isi sendiri</option></select></label>
        {automatic && <><p className="text-sm text-slate-700">Harga dan HPP mengikuti sumber serta konversi. Tanpa penyesuaian memakai faktor 1. Nilai akhir dihitung server saat disimpan.</p><label className="block text-sm">Penyesuaian satuan baru<select aria-label="Penyesuaian satuan baru" className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" value={draft?.adjustment ?? "none"} disabled={disabled} onChange={e => update({ adjustment: e.target.value as "none" | "discount" | "markup" })}><option value="none">Tanpa penyesuaian</option><option value="discount">Diskon</option><option value="markup">Markup</option></select></label>{draft?.adjustment && draft.adjustment !== "none" && <Field label="Persentase satuan baru" value={draft.percent ?? "0"} disabled={disabled} onChange={percent => update({ percent })} />}</>}
      </div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Nama satuan"
          value={draft?.unit ?? ""}
          onChange={(value) => update({ unit: value })}
          disabled={disabled}
          numeric={false}
          error={
            result.error?.startsWith("Satuan sudah") ? result.error : undefined
          }
        />
        <Field
          label="Harga jual"
          value={automatic ? estimatedPrice : draft?.price ?? ""}
          readOnly={automatic}
          onChange={(value) => update({ price: value })}
          disabled={disabled}
        />
        <Field
          label="Jumlah satuan baru"
          value={draft?.conversionFromQuantity ?? "1"}
          onChange={(value) => update({ conversionFromQuantity: value })}
          disabled={disabled}
        />
        <Field
          label="Jumlah satuan setara"
          value={draft?.conversionToQuantity ?? "1"}
          onChange={(value) => update({ conversionToQuantity: value })}
          disabled={disabled}
        />
        <UnitSelect
          label="Satuan setara"
          value={
            draft?.conversionToProductId ?? props.detail.variants[0]?.id ?? ""
          }
          detail={props.detail}
          onChange={(value) => update({ conversionToProductId: value })}
          disabled={disabled}
        />
        <Field
          label="Stok dari grup"
          value={result.stock === null ? "" : String(result.stock)}
          readOnly
        />
      </div>
      <details className="rounded-xl border border-slate-200 p-4">
        <summary className="min-h-11 cursor-pointer text-sm font-semibold">
          Detail tambahan
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field
            label="HPP (opsional)"
            value={automatic ? estimatedCost : draft?.costPrice ?? ""}
            readOnly={automatic}
            onChange={(value) => update({ costPrice: value })}
            disabled={disabled}
          />
          <Field
            label="Batas stok minimum"
            value={draft?.minStock ?? "5"}
            onChange={(value) => update({ minStock: value })}
            disabled={disabled}
          />
          <Field
            label="Catatan (opsional)"
            value={draft?.note ?? ""}
            onChange={(value) => update({ note: value })}
            disabled={disabled}
            numeric={false}
          />
        </div>
      </details>
      {draft?.unit.trim() && result.error && (
        <p role="alert" className="text-sm text-red-800">
          {result.error}
        </p>
      )}
      <Status status={props.statuses?.addition} />
      {!props.canCreateProducts && <PermissionHint />}
      <button
        type="button"
        className={buttonClass}
        disabled={disabled || !result.payload}
        onClick={props.onAddVariant}
      >
        Tambah satuan
      </button>
    </section>
  );
}
