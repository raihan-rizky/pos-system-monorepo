"use client";

import type { PriceRoundingSettings } from "@/features/product-price-rounding/rounding";
import { useEffect, useRef, useState } from "react";
import { fetchStockGroupDetail, requestGroupPricing, StockGroupMutationError, type StockGroupDetail } from "../api/stock-group-api";
import type { GroupPricingChanges, GroupPricingPreview } from "../group-pricing-service";
import { adjustmentFactor, createPricingDraft, pricingChanges, selectPricingSource, rebasePricingDraft, type PricingMemberDraft } from "../pricing-drafts";
import { PricingFollower, PricingLedger, PricingMoneyFields, PricingReviewNotes } from "./GroupPricingFields";
import styles from "./GroupPricingPanel.module.css";

export function GroupPricingPanel({ detail: incoming, canUpdate, onApplied, onDirtyChange, onBusyChange, roundingSettings }: {
  roundingSettings?: PriceRoundingSettings; detail: StockGroupDetail; canUpdate: boolean; onApplied: () => void | Promise<void>;
  onDirtyChange?: (dirty: boolean) => void; onBusyChange?: (busy: boolean) => void;
}) {
  const [detail, setDetail] = useState(incoming);
  const [draft, setDraft] = useState(() => createPricingDraft(incoming));
  const [preview, setPreview] = useState<{ result: GroupPricingPreview; changes: GroupPricingChanges; fingerprint: string } | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [message, setMessage] = useState("");
  const requestId = useRef(0), mounted = useRef(true), applying = useRef(false);
  const lastField = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  const baseline = useRef(incoming);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (baseline.current === incoming || applying.current) return;
    const previous = baseline.current;
    baseline.current = incoming;
    setDetail(incoming); setPreview(null); requestId.current++;
    setDraft(current => rebasePricingDraft(previous, incoming, current));
  }, [incoming, busy]);
  let changes: GroupPricingChanges = {}, error = "";
  try {
    changes = pricingChanges(detail, draft);
    for (const member of changes.members ?? []) {
      if (member.price !== undefined && !/^\d+(\.\d+)?$/.test(String(member.price))) throw new Error("Isi harga jual dengan angka nol atau lebih.");
      if (member.costPrice != null && !/^\d+(\.\d+)?$/.test(String(member.costPrice))) throw new Error("Isi HPP dengan angka nol atau lebih.");
    }
  } catch (cause) { error = cause instanceof Error ? cause.message : "Periksa penyesuaian harga."; }
  const fingerprint = JSON.stringify({ draft, changes });
  const dirty = JSON.stringify(draft) !== JSON.stringify(createPricingDraft(detail));
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy === "apply"); }, [busy, onBusyChange]);
  const update = (id: string, next: Partial<PricingMemberDraft>) => {
    requestId.current++; setPreview(null); setMessage("");
    setDraft(current => ({ ...current, members: { ...current.members, [id]: { ...current.members[id], ...next } } }));
  };
  const metadata = detail.pricingMembers ?? detail.variants.map(v => ({ ...v, isActive: true }));
  const label = (id: string) => { const member = metadata.find(v => v.id === id); return member ? `${member.name} · ${member.unit}` : "Satuan tidak tersedia"; };
  const sourceValid = metadata.some(v => v.id === draft.sourceProductId && v.isActive && !v.conversionNeedsReview && v.unitMultiplierToBase > 0);
  async function refresh() {
    const latest = await fetchStockGroupDetail(detail.id);
    if (!mounted.current) return;
    setDetail(latest);
    setDraft(current => rebasePricingDraft(detail, latest, current));
  }
  async function submit(apply: boolean) {
    if (applying.current || error || !sourceValid) return;
    if (apply && (!preview || preview.fingerprint !== fingerprint)) return;
    const id = ++requestId.current;
    const submitted = apply ? preview!.changes : changes;
    applying.current = apply;
    setBusy(apply ? "apply" : "preview"); setMessage("");
    try {
      const result = await requestGroupPricing(detail.id, submitted, apply ? preview!.result : undefined);
      if (!mounted.current || (!apply && id !== requestId.current)) return;
      if (apply) {
        setPreview(null);
        await onApplied();
        try {
          const latest = await fetchStockGroupDetail(detail.id);
          if (!mounted.current) return;
          setDetail(latest); setDraft(createPricingDraft(latest));
          setMessage("Harga grup berhasil diterapkan.");
        } catch { setMessage("Harga sudah diterapkan. Data terbaru belum dapat dimuat; muat ulang sebelum perubahan berikutnya."); }
      } else setPreview({ result: result as GroupPricingPreview, changes: submitted, fingerprint });
    } catch (cause) {
      if (!mounted.current || id !== requestId.current) return;
      setPreview(null);
      if (cause instanceof StockGroupMutationError && cause.status === 409) {
        setMessage("Data grup berubah. Input Anda tetap tersimpan; buat pratinjau baru.");
        try { await refresh(); } catch { setMessage("Data terbaru belum dapat dimuat. Input tetap tersimpan; coba pratinjau lagi."); }
      } else setMessage(cause instanceof Error ? cause.message : "Harga belum dapat disimpan.");
    } finally { if (mounted.current) { applying.current = false; setBusy(null); if (apply) requestAnimationFrame(() => lastField.current?.focus()); } }
  }
  const freshPreview = preview?.fingerprint === fingerprint ? preview.result : undefined;
  const sourceMeta = metadata.find(member => member.id === draft.sourceProductId);
  const sourceMember = detail.pricing?.members.find(member => member.productId === draft.sourceProductId);
  const sourceDraft = draft.members[draft.sourceProductId];
  const disabled = !canUpdate || busy === "apply";
  return <section className={styles.panel} aria-label="Harga otomatis grup" onFocusCapture={event => { if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) lastField.current = event.target; }}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>Pengaturan harga</span><h3>Satu sumber.<br className={styles.mobileBreak} /> Semua satuan terhubung.</h3><p>Atur harga sumber, sesuaikan tiap satuan, lalu periksa hasilnya.</p></div>
      <span className={styles.draftStatus}>{busy === "apply" ? "Menerapkan" : busy === "preview" ? "Menghitung" : freshPreview ? "Pratinjau siap" : dirty ? "Draf berubah" : "Belum ada perubahan"}</span>
    </header>
    <div className={styles.workspace}>
      <div className={styles.editor}>
        <fieldset className={styles.source} disabled={disabled}>
          <legend className={styles.srOnly}>Sumber harga grup</legend>
          <div className={styles.sourceHeading}><span className={styles.sourceMarker}>Sumber</span><span>Harga acuan untuk satuan Auto</span></div>
          <label className={styles.field}><span>Sumber harga</span><select aria-label="Sumber harga" value={draft.sourceProductId} onChange={event => {
            requestId.current++; setPreview(null); setMessage(""); setDraft(current => selectPricingSource(detail, current, event.target.value));
          }}>
            {!sourceValid && <option value={draft.sourceProductId}>{draft.sourceProductId ? label(draft.sourceProductId) : "Pilih sumber aktif"} · perlu diperbaiki</option>}
            {metadata.filter(member => member.isActive && !member.conversionNeedsReview && member.unitMultiplierToBase > 0).map(member => <option key={member.id} value={member.id}>{label(member.id)}</option>)}
          </select></label>
          {!sourceValid && <p className={styles.review}>Pilih sumber aktif dengan konversi yang valid untuk memperbaiki harga otomatis.</p>}
          {sourceDraft && <fieldset className={styles.sourceMoney} disabled={!sourceValid}>
            <legend className={styles.srOnly}>{label(draft.sourceProductId)} · Sumber</legend>
            <PricingMoneyFields roundingSettings={roundingSettings} unit={sourceMeta?.unit ?? "sumber"} value={sourceDraft} onChange={next => update(draft.sourceProductId, next)} />
          </fieldset>}
          <p className={styles.sourceHint}>HPP boleh dikosongkan jika belum diketahui.</p>
          {sourceMember && <PricingReviewNotes review={sourceMember.review} />}
        </fieldset>
        <div className={styles.followers}>
          <p className={styles.railLabel}>Terhubung lewat konversi satuan</p>
          {detail.pricing?.members.filter(member => member.productId !== draft.sourceProductId).map(member => {
            const value = draft.members[member.productId]; if (!value) return null;
            const meta = metadata.find(item => item.id === member.productId) ?? { id: member.productId, name: "Satuan tidak tersedia", unit: "?", isActive: false, unitMultiplierToBase: 0, conversionNeedsReview: true };
            const preserveSelling = value.mode === "AUTO" && !value.adjustmentEdited && (draft.sourceProductId !== detail.pricing!.config.sourceProductId || detail.pricing!.config.members[member.productId]?.mode === "MANUAL");
            let factor = freshPreview?.after.config.members[member.productId]?.factor ?? detail.pricing!.config.members[member.productId]?.factor;
            if (value.adjustmentEdited) { try { factor = adjustmentFactor(value.adjustment, value.percent); } catch { factor = null; } }
            else if (preserveSelling) factor = freshPreview?.after.config.members[member.productId]?.factor ?? null;
            return <PricingFollower roundingSettings={roundingSettings} key={member.productId} meta={meta} source={sourceMeta} member={member} projected={freshPreview?.after.members.find(item => item.productId === member.productId)} value={value} factor={factor} preserveSelling={preserveSelling} disabled={disabled} onChange={next => update(member.productId, next)} />;
          })}
        </div>
      </div>
      {detail.pricing && <PricingLedger roundingSettings={roundingSettings} current={freshPreview?.before ?? detail.pricing} after={freshPreview?.after} metadata={metadata} pending={busy === "preview"} />}
    </div>
    <footer className={styles.actions}>
      <div className={styles.actionStatus} aria-live="polite"><strong>{freshPreview ? "Siap diterapkan" : "Periksa sebelum menyimpan"}</strong><p>{error || message || (freshPreview ? "Hasil pratinjau sesuai dengan pengaturan terbaru." : dirty ? "Draf berubah. Buat pratinjau baru untuk melihat hasilnya." : "Pratinjau dulu, lalu terapkan harga satu grup.")}</p></div>
      <div className={styles.actionButtons}><button type="button" className={styles.previewButton} disabled={!canUpdate || busy !== null || !!error || !sourceValid} onClick={() => submit(false)}>{busy === "preview" ? "Menghitung pratinjau…" : "Pratinjau harga"}</button>
        <button type="button" className={styles.applyButton} disabled={!canUpdate || busy !== null || !freshPreview} onClick={() => submit(true)}>{busy === "apply" ? "Menerapkan…" : "Terapkan harga grup"}</button></div>
    </footer>
  </section>;
}
