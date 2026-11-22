"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./ProductClassificationPanel.module.css";

export type ProductClassificationGroup = "ATK" | "PERCETAKAN";
export type ClassificationStatusFilter = "all" | "classified" | "unclassified";

export interface ClassificationSubcategory {
  id: string;
  group: ProductClassificationGroup;
  name: string;
  legacyCategoryId?: string | null;
}

export interface ClassificationUnit {
  id: string;
  name: string;
  unit: string;
  imageUrl?: string | null;
  isActive: boolean;
  legacyCategoryName: string | null;
  catalogSubcategory: Pick<ClassificationSubcategory, "id" | "group" | "name"> | null;
}

export interface ClassificationProductGroup {
  id: string;
  name: string;
  imageUrl?: string | null;
  // This must contain every member of the stock group, including inactive units.
  units: ClassificationUnit[];
}

export interface ClassificationPreview {
  token: string;
  expiresAt: number;
  target: Pick<ClassificationSubcategory, "id" | "group" | "name">;
  totals: { selected: number; moving: number; unchanged: number; active: number; inactive: number };
  units: ClassificationUnit[];
  pricingImpact: {
    changed: number;
    examples: { unitId: string; unitName: string; customerType: string; before: number; after: number; beforeRule: { id: string; scope: "CATEGORY" | "SUBCATEGORY" | "MEMBER"; label: string } | null; afterRule: { id: string; scope: "CATEGORY" | "SUBCATEGORY" | "MEMBER"; label: string } | null }[];
  } | null;
}

export interface ProductClassificationPanelProps {
  headingAction?: ReactNode;
  groups: ClassificationProductGroup[];
  subcategories: ClassificationSubcategory[];
  selectedUnitIds: ReadonlySet<string>;
  onSelectionChange: (ids: Set<string>) => void;
  canUpdate?: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  legacyCategories?: { id: string; name: string }[];
  legacyCategory?: string;
  onLegacyCategoryChange?: (value: string) => void;
  classificationStatus?: ClassificationStatusFilter;
  onClassificationStatusChange?: (value: ClassificationStatusFilter) => void;
  filterMainCategory?: ProductClassificationGroup | "";
  onFilterMainCategoryChange?: (value: ProductClassificationGroup | "") => void;
  filterSubcategoryId?: string;
  onFilterSubcategoryChange?: (value: string) => void;
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  preview: ClassificationPreview | null;
  onPreview: (destinationId: string) => void | Promise<void>;
  onPreviewClose: () => void;
  onApply: (token: string) => void | Promise<void>;
  loading?: boolean;
  previewLoading?: boolean;
  applyLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  actionError?: string | null;
  successMessage?: string | null;
}

const printingNames = new Set(["PRINT", "STEMPEL", "PLAT", "CETAK", "SPANDUK"]);
const currency = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 2 });

function allowedSubcategories(subcategories: ClassificationSubcategory[], group: ProductClassificationGroup | "") {
  return subcategories.filter(item => item.group === group &&
    (item.group !== "PERCETAKAN" || printingNames.has(item.name.trim().toUpperCase())));
}

function Checkbox({ label, checked, partial, disabled, onChange }: {
  label: string;
  checked: boolean;
  partial: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return <label className={styles.checkTarget}>
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      ref={element => { if (element) element.indeterminate = partial; }}
      onChange={event => onChange(event.target.checked)}
    />
  </label>;
}

function Thumbnail({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return <span className={styles.thumbnail}>
    {src && !failed
      // The URL is supplied by the product catalog and may be a local or remote image.
      ? <img src={src} alt="" onError={() => setFailed(true)} />
      : <span className={styles.placeholder} role="img" aria-label="Foto tidak tersedia">▧</span>}
  </span>;
}

function classificationLabel(value: ClassificationUnit["catalogSubcategory"]) {
  return value ? `${value.group} / ${value.name}` : "Belum diatur";
}

function commonLabel(values: string[]) {
  const unique = new Set(values);
  return unique.size === 1 ? values[0] : unique.size ? "Beragam" : "Belum tersedia";
}

function ProductGroupRow({ group, selected, expanded, canUpdate, onExpand, onToggle }: {
  group: ClassificationProductGroup;
  selected: ReadonlySet<string>;
  expanded: boolean;
  canUpdate: boolean;
  onExpand: () => void;
  onToggle: (ids: string[], checked: boolean) => void;
}) {
  const ids = group.units.map(unit => unit.id);
  const count = ids.filter(id => selected.has(id)).length;
  const oldLabel = commonLabel(group.units.map(unit => unit.legacyCategoryName || "Belum ditentukan"));
  const newLabel = commonLabel(group.units.map(unit => classificationLabel(unit.catalogSubcategory)));
  const inactive = group.units.filter(unit => !unit.isActive).length;

  return <li className={styles.group}>
    <div className={`${styles.productRow} ${count ? styles.selectedRow : ""}`}>
      <Checkbox label={`Pilih semua satuan ${group.name}`} checked={ids.length > 0 && count === ids.length}
        partial={count > 0 && count < ids.length} disabled={!canUpdate || !ids.length} onChange={checked => onToggle(ids, checked)} />
      <div className={styles.productCell}>
        <button type="button" className={styles.expand} aria-expanded={expanded}
          aria-label={`${expanded ? "Sembunyikan" : "Tampilkan"} satuan ${group.name}`} onClick={onExpand}>
          <span aria-hidden="true">{expanded ? "⌄" : "›"}</span>
        </button>
        <Thumbnail src={group.imageUrl} />
        <div className={styles.productName}>{group.name}
          <small>{group.units.length} satuan{inactive ? ` · ${inactive} tidak aktif` : ""}</small>
        </div>
      </div>
      <div className={styles.categoryCell}><span className={styles.cellLabel}>Kategori lama: </span>{oldLabel}</div>
      <div className={styles.categoryCell}><span className={styles.cellLabel}>Kategori baru: </span><span className={newLabel === "Belum diatur" ? styles.badge : styles.badgeDone}>{newLabel}</span></div>
    </div>
    {expanded && <ul className={styles.units} aria-label={`Satuan ${group.name}`}>
      {group.units.map(unit => <li key={unit.id} className={`${styles.productRow} ${styles.unitRow} ${selected.has(unit.id) ? styles.selectedRow : ""}`}>
        <Checkbox label={`Pilih ${unit.name}`} checked={selected.has(unit.id)} partial={false} disabled={!canUpdate}
          onChange={checked => onToggle([unit.id], checked)} />
        <div className={styles.productCell}>
          <span className={styles.unitIndent} aria-hidden="true">↳</span>
          <Thumbnail src={unit.imageUrl || group.imageUrl} />
          <div className={styles.productName}>{unit.name}
            <small>{unit.unit}{!unit.isActive && <> · <strong>Tidak aktif</strong></>}</small>
          </div>
        </div>
        <div className={styles.categoryCell}><span className={styles.cellLabel}>Kategori lama: </span>{unit.legacyCategoryName || "Belum ditentukan"}</div>
        <div className={styles.categoryCell}><span className={styles.cellLabel}>Kategori baru: </span><span className={unit.catalogSubcategory ? styles.badgeDone : styles.badge}>{classificationLabel(unit.catalogSubcategory)}</span></div>
      </li>)}
    </ul>}
  </li>;
}

function ReviewDialog({ preview, selected, destinationId, destinationGroup, busy, error, onClose, onApply }: {
  preview: ClassificationPreview;
  selected: ReadonlySet<string>;
  destinationId: string;
  destinationGroup: ProductClassificationGroup | "";
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onApply: (token: string) => void | Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [expired, setExpired] = useState(() => preview.expiresAt <= Date.now());
  const [impactPage, setImpactPage] = useState(0);
  const previewIds = new Set(preview.units.map(unit => unit.id));
  const matches = preview.target.id === destinationId && preview.target.group === destinationGroup &&
    preview.totals.selected === selected.size && previewIds.size === selected.size &&
    preview.units.length === selected.size && [...previewIds].every(id => selected.has(id));

  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal();
  }, []);
  useEffect(() => {
    setExpired(preview.expiresAt <= Date.now());
    const delay = Math.min(Math.max(0, preview.expiresAt - Date.now()), 2147483647);
    const timer = window.setTimeout(() => setExpired(true), delay);
    return () => window.clearTimeout(timer);
  }, [preview.expiresAt]);

  function apply() {
    if (busy || !matches || expired || preview.expiresAt <= Date.now() || !preview.pricingImpact || !preview.totals.moving) return;
    void onApply(preview.token);
  }

  return <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId}
    onClose={onClose} onCancel={event => { if (busy) event.preventDefault(); }}>
    <div className={styles.dialogHead}>
      <div><span className={styles.eyebrow}>Langkah terakhir</span><h2 id={titleId}>Tinjau pemindahan</h2></div>
      <button type="button" className={styles.close} aria-label="Tutup" disabled={busy} onClick={() => dialog.current?.close()}>×</button>
    </div>
    <div className={styles.dialogBody}>
      {!matches && <p className={styles.alert} role="alert">Pilihan atau tujuan berubah. Tutup dan tinjau ulang sebelum memindahkan.</p>}
      {expired && <p className={styles.alert} role="alert">Pratinjau kedaluwarsa. Tutup dan tinjau ulang sebelum memindahkan.</p>}
      {error && <p className={styles.alert} role="alert">{error}</p>}
      <div className={styles.reviewSummary}>
        <strong>{preview.totals.selected} satuan dipilih</strong>
        <p>Tujuan: <strong>{preview.target.group} / {preview.target.name}</strong></p>
        <p>{preview.totals.moving} akan dipindahkan · {preview.totals.unchanged} sudah di tujuan</p>
        <p>{preview.totals.active} aktif · {preview.totals.inactive} tidak aktif</p>
      </div>
      <h3 className={styles.reviewTitle}>Satuan dalam pilihan</h3>
      <ul className={styles.reviewUnits}>{preview.units.map(unit => <li key={unit.id}>
        <span><strong>{unit.name}</strong> <span>({unit.unit})</span>{!unit.isActive && <span className={styles.inactive}>Tidak aktif</span>}</span>
        <small>{classificationLabel(unit.catalogSubcategory)}{unit.catalogSubcategory?.id === preview.target.id ? " · Sudah di tujuan" : ""}</small>
      </li>)}</ul>
      <div className={styles.pricing}>
        <h3>Dampak harga pelanggan</h3>
        {preview.pricingImpact === null
          ? <p>Dampak harga pelanggan belum diketahui. Tinjau kembali sebelum memindahkan.</p>
          : preview.pricingImpact.changed === 0
            ? <p>Tidak ada perubahan harga pelanggan yang terdeteksi. Aturan harga yang berlaku juga tetap sama.</p>
            : <><p>{preview.pricingImpact.changed} perubahan harga atau aturan pelanggan terdeteksi.</p>
              {preview.pricingImpact.examples.length > 0 && <ul>{preview.pricingImpact.examples.slice(impactPage * 10, impactPage * 10 + 10).map((example) =>
                <li key={`${example.unitId}-${example.customerType}`}><strong>{example.unitName} · {example.customerType}</strong><br />
                  Sebelum: {currency.format(example.before)} — {example.beforeRule?.label ?? "Harga biasa"}<br />
                  Sesudah: {currency.format(example.after)} — {example.afterRule?.label ?? "Harga biasa"}{example.before === example.after ? " (harga tetap)" : ""}</li>)}</ul>}
              {preview.pricingImpact.examples.length > 10 && <div className={styles.impactPages} aria-label="Halaman dampak harga">
                <span>{impactPage * 10 + 1}–{Math.min((impactPage + 1) * 10, preview.pricingImpact.examples.length)} dari {preview.pricingImpact.examples.length}</span>{" "}
                <button type="button" className={styles.secondaryButton} disabled={impactPage === 0} onClick={() => setImpactPage(page => page - 1)}>Dampak sebelumnya</button>{" "}
                <button type="button" className={styles.secondaryButton} disabled={(impactPage + 1) * 10 >= preview.pricingImpact.examples.length} onClick={() => setImpactPage(page => page + 1)}>Dampak berikutnya</button>
              </div>}
            </>}
        <p>Stok bersama, konversi satuan, dan harga dasar tetap tersimpan.</p>
      </div>
    </div>
    <div className={styles.dialogActions}>
      <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => dialog.current?.close()}>Kembali</button>
      <button type="button" className={styles.primaryButton} disabled={busy || !matches || expired || !preview.pricingImpact || !preview.totals.moving}
        onClick={apply}>{busy ? "Memindahkan..." : "Pindahkan satuan"}</button>
    </div>
  </dialog>;
}

export function ProductClassificationPanel({
  headingAction, groups, subcategories, selectedUnitIds, onSelectionChange, canUpdate = true, search, onSearchChange,
  legacyCategories = [], legacyCategory = "", onLegacyCategoryChange,
  classificationStatus = "all", onClassificationStatusChange,
  filterMainCategory = "", onFilterMainCategoryChange, filterSubcategoryId = "", onFilterSubcategoryChange,
  page, pageCount, onPageChange, preview, onPreview, onPreviewClose, onApply,
  loading = false, previewLoading = false, applyLoading = false, error, onRetry, actionError, successMessage,
}: ProductClassificationPanelProps) {
  const id = useId();
  const tray = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [destinationGroup, setDestinationGroup] = useState<ProductClassificationGroup | "">("");
  const [destinationId, setDestinationId] = useState("");
  const visibleIds = [...new Set(groups.flatMap(group => group.units.map(unit => unit.id)))];
  const selectedVisible = visibleIds.filter(unitId => selectedUnitIds.has(unitId)).length;
  const destinationOptions = allowedSubcategories(subcategories, destinationGroup);
  const destination = destinationOptions.find(item => item.id === destinationId);
  const filteredOptions = allowedSubcategories(subcategories, filterMainCategory);

  function toggle(ids: string[], checked: boolean) {
    const next = new Set(selectedUnitIds);
    ids.forEach(unitId => { if (checked) next.add(unitId); else next.delete(unitId); });
    onSelectionChange(next);
  }
  function toggleExpanded(groupId: string) {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  }

  return <div className={styles.panel}>
    <header className={styles.heading}>
      <div><span className={styles.eyebrow}>Katalog produk</span><h1>Tempat yang tepat untuk setiap produk.</h1><p>Pilih beberapa satuan, tentukan tujuannya, dan tinjau sebelum dipindahkan.</p></div>
      {headingAction ?? <p className={styles.headingNote}>Mulai dengan mencari produk atau menyaring berdasarkan kategori.</p>}
    </header>
    <div className={styles.workspace}>
      <section className={styles.catalog} aria-labelledby={`${id}-catalog-title`}>
        <div className={styles.catalogHead}><h2 id={`${id}-catalog-title`}>Daftar produk</h2><span>{groups.length} produk pada halaman ini</span></div>
        <div className={styles.filters}>
          <label className={styles.fieldLabel} htmlFor={`${id}-search`}>Cari produk<input id={`${id}-search`} type="search" value={search} placeholder="Cari nama produk..." onChange={event => onSearchChange(event.target.value)} /></label>
          {onLegacyCategoryChange && <label className={styles.fieldLabel}>Kategori lama<select value={legacyCategory} onChange={event => onLegacyCategoryChange(event.target.value)}><option value="">Semua kategori lama</option>{legacyCategories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          {onClassificationStatusChange && <label className={styles.fieldLabel}>Status klasifikasi<select value={classificationStatus} onChange={event => onClassificationStatusChange(event.target.value as ClassificationStatusFilter)}><option value="all">Semua status</option><option value="unclassified">Belum diatur</option><option value="classified">Sudah diatur</option></select></label>}
          {onFilterMainCategoryChange && <label className={styles.fieldLabel}>Kategori baru<select value={filterMainCategory} onChange={event => { onFilterMainCategoryChange(event.target.value as ProductClassificationGroup | ""); onFilterSubcategoryChange?.(""); }}><option value="">Semua kategori baru</option><option value="ATK">ATK</option><option value="PERCETAKAN">PERCETAKAN</option></select></label>}
          {onFilterSubcategoryChange && <label className={styles.fieldLabel}>Subkategori baru<select value={filterSubcategoryId} disabled={!filterMainCategory} onChange={event => onFilterSubcategoryChange(event.target.value)}><option value="">Semua subkategori</option>{filteredOptions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        </div>
        <div className={styles.selectionNote}><span><strong>{selectedUnitIds.size} satuan dipilih</strong> · Pilihan tetap tersimpan saat mencari atau berpindah halaman.</span><button type="button" disabled={!canUpdate || !selectedUnitIds.size} onClick={() => onSelectionChange(new Set())}>Batal pilih semua</button></div>
        {error && <p className={styles.listAlert} role="alert">{error} {onRetry && <button type="button" className={styles.retry} onClick={onRetry}>Coba lagi</button>}</p>}
        {successMessage && <p className={styles.result} role="status">{successMessage}</p>}
        {loading ? <p className={styles.empty}>Memuat produk...</p> : groups.length === 0 ? !error && <p className={styles.empty}>Tidak ada produk yang cocok. Coba ubah pencarian atau filter.</p> : <>
          <div className={styles.columnHead}>
            <Checkbox label="Pilih semua satuan pada halaman ini" checked={visibleIds.length > 0 && selectedVisible === visibleIds.length}
              partial={selectedVisible > 0 && selectedVisible < visibleIds.length} disabled={!canUpdate || !visibleIds.length} onChange={checked => toggle(visibleIds, checked)} />
            <span>Produk &amp; satuan</span><span>Kategori lama</span><span>Kategori baru</span>
          </div>
          <ul className={styles.groups} aria-label="Daftar produk">{groups.map(group => <ProductGroupRow key={group.id} group={group} selected={selectedUnitIds}
            expanded={expanded.has(group.id)} canUpdate={canUpdate} onExpand={() => toggleExpanded(group.id)} onToggle={toggle} />)}</ul>
        </>}
        <div className={styles.catalogFoot}><span>Pilih seluruh satuan dari produk yang terlihat pada halaman ini, termasuk satuan yang tertutup dan tidak aktif, atau pilih satuan satu per satu.</span></div>
        <nav className={styles.pagination} aria-label="Halaman daftar produk"><button type="button" disabled={page <= 1 || loading} onClick={() => onPageChange(page - 1)}>Halaman sebelumnya</button><span>Halaman {page} dari {Math.max(pageCount, 1)}</span><button type="button" disabled={page >= pageCount || loading} onClick={() => onPageChange(page + 1)}>Halaman berikutnya</button></nav>
      </section>

      <aside ref={tray} tabIndex={-1} className={styles.tray} aria-label="Baki pemindahan">
        <div className={styles.trayTop}><span className={styles.trayKicker}>Baki pemindahan</span><h2>Atur tujuan bersama</h2><div className={styles.trayCount}><strong>{selectedUnitIds.size}</strong><span>satuan dipilih<br />Siap untuk dikelompokkan</span></div></div>
        <div className={styles.trayBody}>
          {!canUpdate && <p className={styles.readOnlyNotice}>Anda dapat melihat klasifikasi. Izin memperbarui produk diperlukan untuk memindahkan satuan.</p>}
          <fieldset className={styles.fieldset}><legend><span>01</span> Pilih kategori utama</legend><div className={styles.categoryChoices}>
            {(["ATK", "PERCETAKAN"] as const).map(group => <label className={styles.choice} key={group}><input type="radio" name={`${id}-destination-group`} value={group} checked={destinationGroup === group} disabled={!canUpdate || previewLoading || applyLoading} onChange={() => { setDestinationGroup(group); setDestinationId(""); }} /><span>{group}</span></label>)}
          </div></fieldset>
          <fieldset className={styles.fieldset}><legend><span>02</span> Pilih subkategori</legend><div className={styles.subcategoryChoices}>
            {!destinationGroup ? <p>Pilih kategori utama terlebih dahulu.</p> : destinationOptions.length === 0 ? <p>Belum ada subkategori untuk kategori ini.</p> : destinationOptions.map(item => <label className={styles.subcategoryChoice} key={item.id}><input type="radio" name={`${id}-destination-subcategory`} value={item.id} checked={destinationId === item.id} disabled={!canUpdate || previewLoading || applyLoading} onChange={() => setDestinationId(item.id)} /><span>{item.name}</span></label>)}
          </div></fieldset>
          <div className={styles.destination}><span>Tujuan pemindahan<strong>{destination ? `${destination.group} / ${destination.name}` : "Belum dipilih"}</strong></span><span aria-hidden="true">→</span></div>
          {actionError && !preview && <p className={styles.listAlert} role="alert">{actionError}</p>}
          <button type="button" className={styles.primaryButton} disabled={!canUpdate || !selectedUnitIds.size || !destination || previewLoading || applyLoading}
            onClick={() => { if (destination) void onPreview(destination.id); }}>{previewLoading ? "Menyiapkan tinjauan..." : "Tinjau pemindahan"}</button>
          <p className={styles.trayHelp}>Hanya satuan yang dipilih yang dipindahkan. Dampak harga ditampilkan sebelum konfirmasi.</p>
        </div>
      </aside>
    </div>
    <div className={styles.mobileBar}><strong>{selectedUnitIds.size} satuan dipilih</strong><button type="button" onClick={() => { tray.current?.scrollIntoView({ behavior: "smooth", block: "start" }); tray.current?.focus({ preventScroll: true }); }}>Atur tujuan</button></div>
    {preview && <ReviewDialog key={preview.token} preview={preview} selected={selectedUnitIds} destinationId={destinationId} destinationGroup={destinationGroup}
      busy={applyLoading} error={actionError} onClose={onPreviewClose} onApply={onApply} />}
  </div>;
}
