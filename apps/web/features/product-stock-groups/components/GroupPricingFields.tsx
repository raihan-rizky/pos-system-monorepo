import { PriceRoundingBadge } from "@/features/product-price-rounding/components/PriceRoundingBadge";
import { PriceRoundingPreview } from "@/features/product-price-rounding/components/PriceRoundingPreview";
import { roundSellingPrice, type PriceRoundingSettings } from "@/features/product-price-rounding/rounding";
import type { StockGroupDetail } from "../api/stock-group-api";
import type { ExactRatio, GroupPricingMemberProjection, GroupPricingProjection, PricingReview } from "../automatic-pricing";
import type { PricingMemberDraft } from "../pricing-drafts";
import styles from "./GroupPricingPanel.module.css";

export type PricingMetadata = NonNullable<StockGroupDetail["pricingMembers"]>;
const moneyFormat = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 2 });
const money = (value: string | null) => value === null ? "Belum diketahui" : moneyFormat.format(Number(value));
const reasons = {
  SOURCE_UNAVAILABLE: "Sumber tidak tersedia. Pilih sumber aktif.",
  SOURCE_AMBIGUOUS: "Sumber belum dipilih. Pilih sumber aktif.",
  CONVERSION_INVALID: "Konversi perlu diperbaiki di tab Satuan.",
  SOURCE_PRICE_ZERO: "Harga jual sumber nol; harga otomatis perlu ditinjau.",
  SOURCE_COST_UNKNOWN: "HPP sumber belum diketahui.",
};

export function PricingReviewNotes({ review }: { review: PricingReview }) {
  return <>{(["price", "costPrice"] as const).map(field => review[field].length > 0 &&
    <p key={field} className={styles.review}>{field === "price" ? "Harga jual" : "HPP"}: {review[field].map(reason => reasons[reason]).join(" ")}</p>)}</>;
}

export function PricingMoneyFields({ unit, value, onChange, roundingSettings }: {
  unit: string; value: PricingMemberDraft; onChange: (next: Partial<PricingMemberDraft>) => void; roundingSettings?: PriceRoundingSettings;
}) {
  return <div className={styles.moneyFields}>{(["price", "costPrice"] as const).map(field =>
    <div key={field}><label className={styles.field}>
      <span>{field === "price" ? "Harga jual" : "HPP (opsional)"} {unit}</span>
      <span className={styles.moneyInput}><span aria-hidden="true">Rp</span><input aria-label={`${field === "price" ? "Harga jual" : "HPP (opsional)"} ${unit}`} type="number" inputMode="decimal" min="0" step="any" value={value[field]} onChange={event => onChange({ [field]: event.target.value })} /></span>
    </label>{field === "price" && <><p className="text-xs text-surface-500">Harga asal sebelum pembulatan.</p><PriceRoundingPreview price={value.price} settings={roundingSettings} /></>}</div>)}</div>;
}

export function PricingFollower({ meta, source, member, projected, value, factor, preserveSelling, disabled, onChange, roundingSettings }: {
  meta: PricingMetadata[number]; source?: PricingMetadata[number]; member: GroupPricingMemberProjection;
  projected?: GroupPricingMemberProjection; value: PricingMemberDraft; factor?: ExactRatio | null;
  roundingSettings?: PriceRoundingSettings; preserveSelling: boolean; disabled: boolean; onChange: (next: Partial<PricingMemberDraft>) => void;
}) {
  const automatic = value.mode === "AUTO";
  const ratio = source && !source.conversionNeedsReview && !meta.conversionNeedsReview && source.unitMultiplierToBase > 0 && meta.unitMultiplierToBase > 0
    ? meta.unitMultiplierToBase / source.unitMultiplierToBase : null;
  // This relationship is display-only; the submitted factor remains exact.
  const conversion = ratio === null ? "Konversi perlu ditinjau" : `1 ${meta.unit} = ${Number.isInteger(ratio) ? ratio : `${meta.unitMultiplierToBase} / ${source!.unitMultiplierToBase}`} ${source!.unit}`;
  const displayed = projected ?? member;
  return <fieldset className={`${styles.follower} ${!meta.isActive ? styles.inactive : ""}`} disabled={disabled || !meta.isActive}>
    <legend className={styles.srOnly}>{meta.name} · {meta.unit}{!meta.isActive ? " · Tidak aktif" : ""}</legend>
    <div className={styles.followerHeading}>
      <div className={styles.memberIdentity}><span className={styles.unit}>{meta.unit}</span><h4>{meta.name}</h4></div>
      {meta.isActive ? <label className={styles.mode}><span className={styles.srOnly}>Mode harga {meta.unit}</span><select aria-label={`Mode harga ${meta.unit}`} value={value.mode} onChange={event => onChange({ mode: event.target.value as "AUTO" | "MANUAL", adjustmentEdited: false })}>
        <option value="AUTO">Auto</option><option value="MANUAL">Manual</option>
      </select></label> : <span className={styles.inactiveLabel}>Tidak aktif · hanya baca</span>}
    </div>
    <p className={styles.conversion}>{conversion}</p>
    {automatic && meta.isActive && (preserveSelling ? <div className={styles.preserve}>
      <p>Harga jual saat ini dipertahankan. Penyesuaian dihitung ulang oleh server pada pratinjau.</p>
      <button type="button" className={styles.textButton} onClick={() => onChange({ adjustment: "none", percent: "0", adjustmentEdited: true })}>Atur penyesuaian baru {meta.unit}</button>
    </div> : <div className={styles.adjustment}>
      <label className={styles.field}><span>Penyesuaian {meta.unit}</span><select aria-label={`Penyesuaian ${meta.unit}`} value={value.adjustment} onChange={event => onChange({ adjustment: event.target.value as PricingMemberDraft["adjustment"], adjustmentEdited: true })}>
        <option value="none">Tanpa penyesuaian</option><option value="discount">Diskon</option><option value="markup">Markup</option>
      </select></label>
      {value.adjustment !== "none" && <label className={styles.field}><span>Persentase {meta.unit}</span><span className={styles.percentInput}><input aria-label={`Persentase ${meta.unit}`} type="number" inputMode="decimal" min="0" step="any" value={value.percent} onChange={event => onChange({ percent: event.target.value, adjustmentEdited: true })} /><span aria-hidden="true">%</span></span></label>}
    </div>)}
    {automatic || !meta.isActive ? <div className={styles.derived}>
      {meta.isActive && <p className={styles.derivedState}>{projected ? "Hasil pratinjau" : "Harga tersimpan"}{automatic ? " · mengikuti sumber" : " · Manual"}</p>}
      <div className={styles.derivedMoney}>{(["price", "costPrice"] as const).map(field => <div key={field}>
        <span className={styles.caption}>{field === "price" ? "Harga jual" : automatic ? "HPP · tanpa penyesuaian" : "HPP"}</span>
        <output aria-label={`${field === "price" ? automatic ? "Harga otomatis" : "Harga jual" : automatic ? "HPP otomatis" : "HPP"} ${meta.unit}`} aria-live="off">{money(field === "price" && displayed.price !== null ? String(roundSellingPrice(Number(displayed.price), roundingSettings).roundedPrice) : displayed[field])}</output>
        {field === "price" && displayed.price !== null && <PriceRoundingBadge rounding={roundSellingPrice(Number(displayed.price), roundingSettings)} />}
      </div>)}</div>
    </div> : <><p className={styles.manualNote}>Isi harga satuan ini sendiri; perubahan sumber tidak mengubahnya.</p><PricingMoneyFields roundingSettings={roundingSettings} unit={meta.unit} value={value} onChange={onChange} /></>}
    {automatic && meta.isActive && <details className={styles.formula}>
      <summary>Rumus &amp; faktor eksak</summary>
      <p>Harga = harga sumber × ({meta.unitMultiplierToBase} / {source?.unitMultiplierToBase ?? "?"}) × faktor <strong>{factor ? `${factor.numerator}/${factor.denominator}` : "yang dihitung server"}</strong>.</p>
      <p>HPP = HPP sumber × konversi yang sama, tanpa diskon atau markup.</p>
    </details>}
    <PricingReviewNotes review={displayed.review} />
  </fieldset>;
}

export function PricingLedger({ current, after, metadata, pending, roundingSettings }: {
  current: GroupPricingProjection; after?: GroupPricingProjection; metadata: PricingMetadata; pending: boolean; roundingSettings?: PriceRoundingSettings;
}) {
  return <section className={styles.ledger} aria-label={after ? "Pratinjau perubahan harga" : "Harga tersimpan"} aria-busy={pending}>
    <header className={styles.ledgerHeading}><span className={styles.eyebrow}>Periksa per satuan</span><h4>{after ? "Sebelum → sesudah" : "Harga tersimpan"}</h4>
      <p>{after ? "Periksa harga jual, HPP, dan margin sebelum menerapkan." : "Belum dihitung. Pratinjau harga untuk melihat hasil pengaturan Anda."}</p>
    </header>
    <div>{(after ?? current).members.map(member => {
      const before = current.members.find(item => item.productId === member.productId);
      const meta = metadata.find(item => item.id === member.productId);
      const roundedBefore = before?.price == null ? null : roundSellingPrice(Number(before.price), roundingSettings);
      const roundedAfter = member.price == null ? null : roundSellingPrice(Number(member.price), roundingSettings);
      const beforeMargin = before?.costPrice == null || !roundedBefore ? null : String(roundedBefore.roundedPrice - Number(before.costPrice));
      const margin = member.costPrice === null || !roundedAfter ? null : String(roundedAfter.roundedPrice - Number(member.costPrice));
      const rows = [
        { label: "Harga jual", before: roundedBefore ? String(roundedBefore.roundedPrice) : null, after: roundedAfter ? String(roundedAfter.roundedPrice) : null },
        { label: "HPP", before: before?.costPrice ?? null, after: member.costPrice },
        { label: "Margin", before: beforeMargin, after: margin },
      ];
      return <article key={member.productId} className={styles.ledgerMember}>
        <header><h5>{meta?.name ?? "Satuan tidak tersedia"} <span>· {meta?.unit}</span></h5>{meta && !meta.isActive && <span className={styles.inactiveLabel}>Tidak aktif</span>}</header>
        <table className={after ? styles.comparison : undefined}>
          <caption className={styles.srOnly}>{meta?.name} {meta?.unit}: {after ? "sebelum dan sesudah" : "harga tersimpan"}</caption>
          <thead><tr><th scope="col"><span className={styles.srOnly}>Jenis harga</span></th>{after && <th scope="col">Sebelum</th>}<th scope="col">{after ? "Sesudah" : "Saat ini"}</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.label} data-negative={row.label === "Margin" && row.after !== null && Number(row.after) < 0 || undefined}>
            <th scope="row">{row.label}</th>{after && <td>{money(row.before)}</td>}<td>{money(row.after)}{row.label === "Harga jual" && <PriceRoundingBadge rounding={roundedAfter} />}</td>
          </tr>)}</tbody>
        </table>
        {margin !== null && Number(margin) < 0 && <p className={styles.review}>Margin negatif: HPP lebih tinggi dari harga jual.</p>}
        <PricingReviewNotes review={member.review} />
      </article>;
    })}</div>
    <p className={styles.ledgerFootnote}>Margin per satuan = harga jual − HPP.</p>
  </section>;
}
