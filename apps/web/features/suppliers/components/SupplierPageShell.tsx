"use client";

import React, { useMemo, useState } from "react";
import { Button, Modal } from "@pos/ui";
import { PackagePlus, Search, RefreshCcw } from "lucide-react";

import { useDebounce } from "@/hooks/useDebounce";
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
import { SupplierImportDrawer } from "@/features/supplier-import";
import { SupplierDetailPopup } from "./SupplierDetailPopup";
import { SupplierStatusConfirmDialog } from "./SupplierStatusConfirmDialog";
import { SupplierStockInRecapBundles } from "./SupplierStockInRecapBundles";

const emptyForm: SupplierInput = {
  name: "",
  type: "DISTRIBUTOR",
  phone: "",
  contactPerson: "",
  address: "",
  notes: "",
};

export function SupplierPageShell() {
  const [tab, setTab] = useState<"suppliers" | "recap">("suppliers");
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

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setWarnings([]);
    setFormDialogOpen(true);
  };

  const openEdit = (supplier: SupplierListItem) => {
    setEditing(supplier);
    setForm({
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
              Import Supplier
            </Button>
            <Button type="button" onClick={openCreate}>
              Tambah Supplier
            </Button>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto">
          <TabButton active={tab === "suppliers"} onClick={() => setTab("suppliers")}>
            Supplier
          </TabButton>
          <TabButton active={tab === "recap"} onClick={() => setTab("recap")}>
            Rekap Stock In
          </TabButton>
        </div>

        {tab === "suppliers" ? (
          <>
            <section className="grid gap-3 md:grid-cols-4">
              <KpiCard label="Total Pembelian" value={formatCurrency(summaryData?.totalPurchaseValue ?? 0)} />
              <KpiCard label="Qty Restock" value={formatNumber(summaryData?.totalRestockQuantity ?? 0)} />
              <KpiCard label="Supplier Aktif" value={summaryData?.activeSupplierCount ?? 0} />
              <KpiCard label="Top Supplier" value={summaryData?.topSupplier?.supplierName ?? "-"} />
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="grid gap-2 md:grid-cols-[1fr_180px_auto]">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    className="min-h-11 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                    placeholder="Cari supplier"
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
              </div>
            </section>

            {suppliers.isPending ? (
              <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-sm font-semibold text-slate-500">
                <RefreshCcw className="mr-2 h-5 w-5 animate-spin text-slate-400" />
                Memuat data supplier...
              </div>
            ) : suppliers.error ? (
              <ErrorBox message="Gagal memuat supplier." />
            ) : supplierRows.length === 0 ? (
              <EmptyBox title="Belum ada supplier" />
            ) : (
              <section className="grid gap-3 lg:grid-cols-2">
                {supplierRows.map((supplier) => {
                  const supplierMetric = summaryData?.suppliers.find(
                    (row) => row.supplierId === supplier.id,
                  );
                  return (
                    <article
                      key={supplier.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button
                          type="button"
                          onClick={() => setSelected(supplier)}
                          className="min-w-0 cursor-pointer text-left"
                        >
                          <p className="truncate text-base font-black text-slate-950">{supplier.name}</p>
                          <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-500">{supplier.type}</p>
                        </button>
                        <span className={`rounded-full px-2 py-1 text-xs font-bold ${supplier.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                          {supplier.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                        <Metric label="Pembelian" value={formatCurrency(supplierMetric?.purchaseValue ?? 0)} />
                        <Metric label="Restock" value={supplierMetric?.restockCount ?? 0} />
                        <Metric label="Kontak" value={supplier.contactPerson || supplier.phone || "-"} />
                        <Metric label="Produk Top" value={supplierMetric?.topProductName ?? "-"} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant="secondary" onClick={() => openEdit(supplier)}>
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={supplier.isActive ? "ghost" : "primary"}
                          loading={setActive.isPending}
                          onClick={() => setActive.mutate({ id: supplier.id, active: !supplier.isActive })}
                        >
                          {supplier.isActive ? "Nonaktifkan" : "Aktifkan"}
                        </Button>
                      </div>
                    </article>
                  );
                })}
              </section>
            )}
          </>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
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

function TabButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 cursor-pointer rounded-xl px-4 text-sm font-bold transition-colors ${active ? "bg-slate-950 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
    >
      {children}
    </button>
  );
}

function KpiCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700">
        <PackagePlus className="h-4 w-4" />
      </div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-700">{value}</p>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{message}</div>;
}

function EmptyBox({ title }: { title: string }) {
  return <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">{title}</div>;
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
