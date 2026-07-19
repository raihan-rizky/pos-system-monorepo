"use client";

import React, { useMemo, useState } from "react";
import { Button, Modal } from "@pos/ui";
import {
  PackagePlus,
  Search,
  Building2,
  ShoppingCart,
  Wallet,
  Boxes,
  User,
  Package,
  ChevronRight,
  Store,
  X,
  Plus,
  Upload,
  Inbox,
} from "lucide-react";

import { useDebounce } from "@/hooks/useDebounce";
import { useAssistantModalAction } from "@/features/ai-assistant/hooks/useAssistantModalAction";
import {
  useCreateSupplier,
  useSetSupplierActive,
  useSupplierStockInRecap,
  useSupplierSummary,
  useSuppliers,
  useUpdateSupplier,
} from "@/features/suppliers/hooks/useSuppliers";
import {
  SUPPLIER_TYPES,
  type SupplierInput,
  type SupplierListItem,
} from "@/features/suppliers/types/supplier";
import {
  buildEmptyStateContent,
  buildSupplierCardA11yProps,
  buildSupplierCardKeyDown,
  isSupplierCardInteractiveTarget,
  KPI_ACCENTS,
} from "@/features/suppliers/helpers/supplier-card-helpers";
import { SupplierImportDrawer } from "@/features/supplier-import";
import { SupplierDetailPopup } from "./SupplierDetailPopup";
import { SupplierStatusConfirmDialog } from "./SupplierStatusConfirmDialog";
import { SupplierStockInRecapBundles } from "./SupplierStockInRecapBundles";
import {
  ShoppingRequestCreateModal,
  ShoppingRequestList,
} from "@/features/suppliers/shopping-requests";

const emptyForm: SupplierInput = {
  code: "",
  name: "",
  type: "DISTRIBUTOR",
  phone: "",
  contactPerson: "",
  address: "",
  notes: "",
};

export function SupplierPageShell() {
  const [tab, setTab] = useState<"suppliers" | "recap" | "shopping">("suppliers");
  const [shoppingCreateOpen, setShoppingCreateOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<SupplierInput["type"] | "ALL">("ALL");
  const [showInactive, setShowInactive] = useState(false);
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [importDrawerOpen, setImportDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierListItem | null>(null);
  const [selected, setSelected] = useState<SupplierListItem | null>(null);
  const [statusTarget, setStatusTarget] = useState<SupplierListItem | null>(null);
  const [form, setForm] = useState<SupplierInput>(emptyForm);
  const [warnings, setWarnings] = useState<string[]>([]);
  const debouncedSearch = useDebounce(search.trim(), 300);

  const supplierFilters = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      type: type === "ALL" ? undefined : type,
      isActive: showInactive ? undefined : true,
      limit: 50,
    }),
    [debouncedSearch, showInactive, type],
  );
  const suppliers = useSuppliers(supplierFilters);
  const summary = useSupplierSummary({});
  const recap = useSupplierStockInRecap({ limit: 20 });
  const createSupplier = useCreateSupplier();
  const updateSupplier = useUpdateSupplier();
  const setActive = useSetSupplierActive();

  const supplierRows = suppliers.data?.data ?? [];
  const summaryData = summary.data;
  const recapBundles = recap.data?.data ?? [];
  const filtersActive = search.trim() !== "" || type !== "ALL" || showInactive;

  const resetFilters = () => {
    setSearch("");
    setType("ALL");
    setShowInactive(false);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setWarnings([]);
    setFormDialogOpen(true);
  };
  useAssistantModalAction("supplier-create", openCreate);

  const openEdit = (supplier: SupplierListItem) => {
    setEditing(supplier);
    setForm({
      code: supplier.code ?? "",
      name: supplier.name,
      type: supplier.type,
      phone: supplier.phone ?? "",
      contactPerson: supplier.contactPerson ?? "",
      address: supplier.address ?? "",
      notes: supplier.notes ?? "",
    });
    setWarnings([]);
    setFormDialogOpen(true);
  };

  const closeForm = () => {
    setFormDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setWarnings([]);
  };

  const saveSupplier = async () => {
    const result = editing
      ? await updateSupplier.mutateAsync({ id: editing.id, input: form })
      : await createSupplier.mutateAsync(form);
    setWarnings(result.warnings.map((warning) => warning.message));
    if (result.warnings.length === 0) closeForm();
  };

  const openEditFromDetail = (supplier: SupplierListItem) => {
    setSelected(null);
    openEdit(supplier);
  };

  const confirmStatusChange = (supplier: SupplierListItem) => {
    setActive.mutate(
      { id: supplier.id, active: !supplier.isActive },
      {
        onSuccess: (result) => {
          setStatusTarget(null);
          setSelected((current) =>
            current?.id === result.data.id ? result.data : current,
          );
        },
      },
    );
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 px-4 py-5 pb-32 scroll-pb-32 md:px-6 md:pb-8 md:scroll-pb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-cyan-700">
              <Store className="h-3 w-3" />
              Manajemen Supplier
            </p>
            <h1 className="text-2xl font-black text-slate-950">Supplier</h1>
            <p className="text-sm text-slate-500">
              Kelola supplier dan pantau rekap stock in dari pembelian.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setImportDrawerOpen(true)}
            >
              <Upload className="mr-1.5 h-4 w-4" />
              Import Supplier
            </Button>
            <Button type="button" onClick={openCreate}>
              <Plus className="mr-1.5 h-4 w-4" />
              Tambah Supplier
            </Button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto">
          <TabButton
            active={tab === "suppliers"}
            onClick={() => setTab("suppliers")}
            icon={<Building2 className="h-4 w-4" />}
          >
            Supplier
          </TabButton>
          <TabButton
            active={tab === "recap"}
            onClick={() => setTab("recap")}
            icon={<Boxes className="h-4 w-4" />}
          >
            Rekap Stock In
          </TabButton>
          <TabButton
            active={tab === "shopping"}
            onClick={() => setTab("shopping")}
            icon={<ShoppingCart className="h-4 w-4" />}
          >
            Permohonan Belanja
          </TabButton>
        </div>

        {tab === "suppliers" ? (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              {summary.isPending ? (
                <>
                  <KpiCardSkeleton />
                  <KpiCardSkeleton />
                  <KpiCardSkeleton />
                  <KpiCardSkeleton />
                </>
              ) : (
                <>
                  <KpiCard
                    label="Total Pembelian"
                    value={formatCurrency(summaryData?.totalPurchaseValue ?? 0)}
                    accentIndex={0}
                  />
                  <KpiCard
                    label="Qty Restock"
                    value={formatNumber(summaryData?.totalRestockQuantity ?? 0)}
                    accentIndex={1}
                  />
                  <KpiCard
                    label="Supplier Aktif"
                    value={summaryData?.activeSupplierCount ?? 0}
                    accentIndex={2}
                  />
                  <KpiCard
                    label="Top Supplier"
                    value={summaryData?.topSupplier?.supplierName ?? "-"}
                    accentIndex={3}
                  />
                </>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="grid gap-2 md:grid-cols-[1fr_180px_auto_auto]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="min-h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    placeholder="Cari kode, nama, kontak, atau telepon..."
                  />
                </label>
                <select
                  value={type}
                  onChange={(event) => setType(event.target.value as SupplierInput["type"] | "ALL")}
                  className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm"
                >
                  <option value="ALL">Semua tipe</option>
                  {SUPPLIER_TYPES.map((supplierType) => (
                    <option key={supplierType} value={supplierType}>
                      {supplierType}
                    </option>
                  ))}
                </select>
                <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(event) => setShowInactive(event.target.checked)}
                  />
                  Tampilkan nonaktif
                </label>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100"
                  >
                    <X className="h-4 w-4" />
                    Reset
                  </button>
                )}
              </div>
            </section>

            {suppliers.isPending ? (
              <section className="grid gap-3 lg:grid-cols-2">
                <SupplierCardSkeleton />
                <SupplierCardSkeleton />
                <SupplierCardSkeleton />
              </section>
            ) : suppliers.error ? (
              <ErrorBox message="Gagal memuat supplier." />
            ) : supplierRows.length === 0 ? (
              <EmptyState
                variant={
                  filtersActive ? "no-match" : "no-suppliers"
                }
                onAction={filtersActive ? resetFilters : openCreate}
              />
            ) : (
              <section className="grid gap-3 lg:grid-cols-2">
                {supplierRows.map((supplier) => {
                  const supplierMetric = summaryData?.suppliers.find(
                    (row) => row.supplierId === supplier.id,
                  );
                  return (
                    <SupplierCard
                      key={supplier.id}
                      supplier={supplier}
                      metric={supplierMetric ?? null}
                      onOpen={() => setSelected(supplier)}
                      onEdit={() => openEdit(supplier)}
                      onToggleActive={() =>
                        setActive.mutate({
                          id: supplier.id,
                          active: !supplier.isActive,
                        })
                      }
                      statusActionPending={setActive.isPending}
                    />
                  );
                })}
              </section>
            )}
          </>
        ) : tab === "recap" ? (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm px-1 md:px-4">
            <div className="border-b border-slate-100 p-4">
              <h2 className="text-base font-black text-slate-950">Rekap Stock In</h2>
              <p className="text-sm text-slate-500">Hanya restock supplier yang sudah disetujui.</p>
            </div>
            <SupplierStockInRecapBundles
              bundles={recapBundles}
              isPending={recap.isPending}
              isError={recap.isError}
            />
          </section>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm px-1 md:px-4">
            <div className="border-b border-slate-100 p-4">
              <h2 className="text-base font-black text-slate-950">Permohonan Belanja</h2>
              <p className="text-sm text-slate-500">Buat dan cetak daftar kebutuhan barang untuk pengajuan belanja.</p>
            </div>
            <ShoppingRequestList onCreateClick={() => setShoppingCreateOpen(true)} />
          </section>
        )}
      </div>

      <SupplierFormModal
        open={formDialogOpen}
        form={form}
        warnings={warnings}
        editing={editing}
        saving={createSupplier.isPending || updateSupplier.isPending}
        onChange={setForm}
        onClose={closeForm}
        onSave={saveSupplier}
      />

      <SupplierImportDrawer
        open={importDrawerOpen}
        onClose={() => setImportDrawerOpen(false)}
      />

      <ShoppingRequestCreateModal
        open={shoppingCreateOpen}
        onClose={() => setShoppingCreateOpen(false)}
      />

      <SupplierDetailPopup
        open={selected !== null}
        supplier={selected}
        statusActionPending={setActive.isPending}
        onClose={() => setSelected(null)}
        onEdit={openEditFromDetail}
        onRequestStatusChange={setStatusTarget}
      />

      <SupplierStatusConfirmDialog
        supplier={statusTarget}
        pending={setActive.isPending}
        onClose={() => setStatusTarget(null)}
        onConfirm={confirmStatusChange}
      />
    </main>
  );
}

function SupplierFormModal({
  open,
  form,
  warnings,
  editing,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  open: boolean;
  form: SupplierInput;
  warnings: string[];
  editing: SupplierListItem | null;
  saving: boolean;
  onChange: (form: SupplierInput) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title={editing ? "Edit Supplier" : "Tambah Supplier"} size="lg">
      <div className="space-y-3">
        {warnings.map((warning) => (
          <div key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">
            {warning}
          </div>
        ))}
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-slate-700">
            Kode Supplier
          </span>
          <input
            value={form.code ?? ""}
            onChange={(event) =>
              onChange({ ...form, code: event.target.value.toUpperCase() })
            }
            className="min-h-11 w-full rounded-xl border border-slate-200 px-3 font-mono text-sm uppercase"
            placeholder="SP0001"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-slate-700">Nama</span>
          <input
            value={form.name}
            onChange={(event) => onChange({ ...form, name: event.target.value })}
            className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-slate-700">Tipe</span>
          <select
            value={form.type}
            onChange={(event) => onChange({ ...form, type: event.target.value as SupplierInput["type"] })}
            className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
          >
            {SUPPLIER_TYPES.map((supplierType) => (
              <option key={supplierType} value={supplierType}>
                {supplierType}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Phone" value={form.phone ?? ""} onChange={(value) => onChange({ ...form, phone: value })} />
          <TextInput label="Kontak" value={form.contactPerson ?? ""} onChange={(value) => onChange({ ...form, contactPerson: value })} />
        </div>
        <TextInput label="Alamat" value={form.address ?? ""} onChange={(value) => onChange({ ...form, address: value })} />
        <TextInput label="Catatan" value={form.notes ?? ""} onChange={(value) => onChange({ ...form, notes: value })} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Tutup
          </Button>
          <Button type="button" loading={saving} disabled={!form.name.trim()} onClick={onSave}>
            Simpan
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function TextInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-slate-700">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"
      />
    </label>
  );
}

function TabButton({
  active,
  children,
  onClick,
  icon,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border px-4 text-sm font-bold transition-colors ${active ? "border-slate-950 bg-slate-950 text-white shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function KpiCard({
  label,
  value,
  accentIndex,
}: {
  label: string;
  value: React.ReactNode;
  accentIndex: number;
}) {
  const accent = KPI_ACCENTS[accentIndex] ?? KPI_ACCENTS[0];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${accent.bgClass} ${accent.iconClass}`}>
        <PackagePlus className="h-4 w-4" />
      </div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function KpiCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 h-9 w-9 animate-pulse rounded-xl bg-slate-100" />
      <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
      <div className="mt-2 h-5 w-28 animate-pulse rounded bg-slate-100" />
    </div>
  );
}

function MetricRow({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="truncate text-sm font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{message}</div>;
}

function EmptyState({ variant, onAction }: { variant: "no-suppliers" | "no-match"; onAction: () => void }) {
  const content = buildEmptyStateContent(variant);
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
        <Inbox className="h-6 w-6" />
      </div>
      <div>
        <p className="text-base font-black text-slate-900">{content.title}</p>
        <p className="mt-1 max-w-md text-sm text-slate-500">{content.description}</p>
      </div>
      <Button type="button" variant={variant === "no-match" ? "secondary" : "primary"} onClick={onAction}>
        {content.ctaLabel}
      </Button>
    </div>
  );
}

function SupplierCardSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="h-6 w-16 animate-pulse rounded-full bg-slate-100" />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
      </div>
      <div className="mt-3 flex gap-2">
        <div className="h-9 w-20 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-9 w-24 animate-pulse rounded-xl bg-slate-100" />
      </div>
    </div>
  );
}

function StatusPill({ isActive }: { isActive: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-bold ${isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-400"}`} />
      {isActive ? "Aktif" : "Nonaktif"}
    </span>
  );
}

type SupplierMetricSummary = NonNullable<ReturnType<typeof useSupplierSummary>["data"]>["suppliers"][number];

function SupplierCard({
  supplier,
  metric,
  onOpen,
  onEdit,
  onToggleActive,
  statusActionPending,
}: {
  supplier: SupplierListItem;
  metric: SupplierMetricSummary | null;
  onOpen: () => void;
  onEdit: () => void;
  onToggleActive: () => void;
  statusActionPending: boolean;
}) {
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    if (isSupplierCardInteractiveTarget(event.target)) return;
    onOpen();
  };

  return (
    <article
      {...buildSupplierCardA11yProps()}
      onClick={handleClick}
      onKeyDown={buildSupplierCardKeyDown(onOpen)}
      className="group cursor-pointer rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="truncate text-base font-black text-slate-950">{supplier.name}</p>
            {supplier.code && (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-black uppercase text-slate-500">
                {supplier.code}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs font-bold uppercase tracking-wider text-slate-500">
            {supplier.type}{supplier.phone ? ` - ${supplier.phone}` : ""}
          </p>
        </div>
        <StatusPill isActive={supplier.isActive} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <MetricRow label="Pembelian" value={formatCurrency(metric?.purchaseValue ?? 0)} icon={<Wallet className="h-3.5 w-3.5" />} />
        <MetricRow label="Restock" value={metric?.restockCount ?? 0} icon={<Boxes className="h-3.5 w-3.5" />} />
        <MetricRow label="Kontak" value={supplier.contactPerson || supplier.phone || "-"} icon={<User className="h-3.5 w-3.5" />} />
        <MetricRow label="Produk Top" value={metric?.topProductName ?? "-"} icon={<Package className="h-3.5 w-3.5" />} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="inline-flex items-center gap-1 text-sm font-bold text-cyan-700 transition-colors group-hover:text-cyan-800">
          Lihat Detail
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
        <div className="flex flex-wrap gap-2" data-card-stop="true">
          <Button type="button" size="sm" variant="secondary" onClick={(event) => { event.stopPropagation(); onEdit(); }}>
            Edit
          </Button>
          <Button type="button" size="sm" variant={supplier.isActive ? "ghost" : "primary"} loading={statusActionPending} onClick={(event) => { event.stopPropagation(); onToggleActive(); }}>
            {supplier.isActive ? "Nonaktifkan" : "Aktifkan"}
          </Button>
        </div>
      </div>
    </article>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: 2,
  }).format(value);
}
