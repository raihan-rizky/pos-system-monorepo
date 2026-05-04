"use client";

import React, { useState, useCallback } from "react";
import {
  useCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  usePayDebt,
  Customer,
  CreateCustomerInput,
  CustomerType,
} from "@/hooks/useCustomers";
import { useDebounce } from "@/hooks/useDebounce";

// ─── Type Badge ───────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<CustomerType, { label: string; cls: string }> = {
  REGULAR: { label: "Regular", cls: "bg-slate-100 text-slate-600" },
  VIP: { label: "VIP", cls: "bg-amber-100 text-amber-700" },
  CORPORATE: { label: "Corporate", cls: "bg-violet-100 text-violet-700" },
};

function TypeBadge({ type }: { type: CustomerType }) {
  const { label, cls } = TYPE_CONFIG[type] ?? TYPE_CONFIG.REGULAR;
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ─── Debt Badge ───────────────────────────────────────────────────────────────

function DebtBadge({ amount }: { amount: number }) {
  if (amount <= 0) return <span className="text-surface-400 text-xs">—</span>;
  return (
    <span className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold bg-red-100 text-red-700">
      {fmt(amount)}
    </span>
  );
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }) : "—";

// ─── Pay Debt Modal ───────────────────────────────────────────────────────────

interface PayDebtModalProps {
  customer: Customer;
  onClose: () => void;
}

function PayDebtModal({ customer, onClose }: PayDebtModalProps) {
  const payDebt = usePayDebt();
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  const debt = Number(customer.totalDebt);
  const canPay = amount > 0 && amount <= debt;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await payDebt.mutateAsync({
        customerId: customer.id,
        amount,
        paymentMethod,
        note: note || undefined,
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal memproses pembayaran");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <h2 className="font-bold text-surface-900 text-lg">Bayar Piutang</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-100 text-surface-500 transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Customer Info */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-red-900">{customer.name}</p>
            <div className="flex justify-between items-baseline mt-1">
              <span className="text-xs text-red-600">Sisa Piutang</span>
              <span className="text-lg font-extrabold text-red-700">{fmt(debt)}</span>
            </div>
          </div>

          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {/* Amount */}
          <div>
            <label className="text-sm font-medium text-surface-700 block mb-1">Jumlah Bayar</label>
            <input
              type="number" required min={1} max={debt}
              value={amount || ""}
              onChange={e => setAmount(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400"
              placeholder="0"
            />
            <div className="flex gap-2 mt-2">
              <button type="button" onClick={() => setAmount(debt)}
                className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors">
                Lunas ({fmt(debt)})
              </button>
              {debt > 100000 && (
                <button type="button" onClick={() => setAmount(Math.round(debt * 0.5))}
                  className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors">
                  50%
                </button>
              )}
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="text-sm font-medium text-surface-700 block mb-1.5">Metode</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { v: "CASH", l: "💵 Tunai" },
                { v: "QRIS", l: "📱 QRIS" },
                { v: "DEBIT", l: "💳 Debit" },
                { v: "TRANSFER", l: "🏦 TF" },
              ].map(m => (
                <button key={m.v} type="button" onClick={() => setPaymentMethod(m.v)}
                  className={`py-2 rounded-lg border text-xs font-semibold transition-all ${paymentMethod === m.v ? "border-brand-500 bg-brand-50 text-brand-700" : "border-surface-200 text-surface-600 hover:border-surface-300"}`}>
                  {m.l}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="text-sm font-medium text-surface-700 block mb-1">Catatan</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Opsional"
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400" />
          </div>

          {/* Remaining after payment */}
          {amount > 0 && canPay && (
            <div className={`flex justify-between items-center p-3 rounded-xl ${amount >= debt ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
              <span className="text-sm font-medium">{amount >= debt ? "Lunas!" : "Sisa Piutang"}</span>
              <span className="text-lg font-extrabold">{fmt(debt - amount)}</span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-surface-200 text-sm font-semibold text-surface-600 hover:bg-surface-50 transition-colors">
              Batal
            </button>
            <button type="submit" disabled={!canPay || payDebt.isPending}
              className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors">
              {payDebt.isPending ? "Memproses..." : `Bayar ${amount > 0 ? fmt(amount) : ""}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Customer Form Modal ──────────────────────────────────────────────────────

interface FormModalProps {
  initial?: Customer | null;
  onClose: () => void;
}

function CustomerFormModal({ initial, onClose }: FormModalProps) {
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const isPending = create.isPending || update.isPending;

  const [form, setForm] = useState<CreateCustomerInput>({
    name: initial?.name ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    company: initial?.company ?? "",
    address: initial?.address ?? "",
    type: initial?.type ?? "REGULAR",
    notes: initial?.notes ?? "",
  });
  const [error, setError] = useState("");

  const set = (k: keyof CreateCustomerInput, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (initial) {
        await update.mutateAsync({ id: initial.id, ...form });
      } else {
        await create.mutateAsync(form);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan data");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <h2 className="font-bold text-surface-900 text-lg">
            {initial ? "Edit Pelanggan" : "Tambah Pelanggan"}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-surface-100 text-surface-500 transition-colors">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}

          {/* Name */}
          <div>
            <label className="text-sm font-medium text-surface-700 block mb-1">Nama <span className="text-red-500">*</span></label>
            <input required value={form.name} onChange={e => set("name", e.target.value)}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400" />
          </div>

          {/* Phone */}
          <div>
            <label className="text-sm font-medium text-surface-700 block mb-1">No. HP / WhatsApp</label>
            <input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="08xx / +628xx"
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400" />
          </div>

          {/* Email */}
          <div>
            <label className="text-sm font-medium text-surface-700 block mb-1">Email</label>
            <input type="email" value={form.email} onChange={e => set("email", e.target.value)}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400" />
          </div>

          {/* Company */}
          <div>
            <label className="text-sm font-medium text-surface-700 block mb-1">Perusahaan / Instansi</label>
            <input value={form.company} onChange={e => set("company", e.target.value)}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400" />
          </div>

          {/* Type */}
          <div>
            <label className="text-sm font-medium text-surface-700 block mb-2">Tipe Pelanggan</label>
            <div className="grid grid-cols-3 gap-2">
              {(["REGULAR", "VIP", "CORPORATE"] as CustomerType[]).map(t => (
                <button key={t} type="button" onClick={() => set("type", t)}
                  className={`py-2 rounded-lg border text-xs font-semibold transition-all ${form.type === t ? "border-brand-500 bg-brand-50 text-brand-700" : "border-surface-200 text-surface-600 hover:border-surface-300"}`}>
                  {TYPE_CONFIG[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="text-sm font-medium text-surface-700 block mb-1">Alamat</label>
            <textarea rows={2} value={form.address} onChange={e => set("address", e.target.value)}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 resize-none" />
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium text-surface-700 block mb-1">Catatan</label>
            <textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 resize-none" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-surface-200 text-sm font-semibold text-surface-600 hover:bg-surface-50 transition-colors">
              Batal
            </button>
            <button type="submit" disabled={isPending}
              className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors">
              {isPending ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<CustomerType | "">("");
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Customer | null>(null);
  const [debtTarget, setDebtTarget] = useState<Customer | null>(null);

  const debouncedSearch = useDebounce(search, 300);
  const deleteCustomer = useDeleteCustomer();

  const { data, isLoading, isFetching } = useCustomers({
    search: debouncedSearch,
    type: typeFilter,
    page,
    limit: 20,
  });

  const openCreate = () => { setEditTarget(null); setModalOpen(true); };
  const openEdit = (c: Customer) => { setEditTarget(c); setModalOpen(true); };
  const closeModal = () => setModalOpen(false);

  const handleDelete = useCallback(async (c: Customer) => {
    if (!confirm(`Hapus pelanggan "${c.name}"?`)) return;
    await deleteCustomer.mutateAsync(c.id);
  }, [deleteCustomer]);

  // Summary stats
  const totalDebtAll = data?.data.reduce((sum: number, c: Customer) => sum + Number(c.totalDebt), 0) ?? 0;
  const customersWithDebt = data?.data.filter(c => Number(c.totalDebt) > 0).length ?? 0;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface-50">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-surface-100 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-surface-900">Database Pelanggan</h1>
          <p className="text-sm text-surface-500 mt-0.5">
            {data?.total ?? 0} pelanggan terdaftar
          </p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-xl text-sm font-semibold hover:bg-brand-700 transition-colors shadow-sm">
          + Tambah Pelanggan
        </button>
      </header>

      {/* Debt Summary Banner */}
      {totalDebtAll > 0 && (
        <div className="mx-6 mt-4 flex items-center gap-4 p-4 bg-gradient-to-r from-red-50 to-amber-50 border border-red-200 rounded-2xl">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-lg">💰</div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Total Piutang</p>
            <p className="text-xl font-extrabold text-red-800">{fmt(totalDebtAll)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-surface-500">Pelanggan dgn piutang</p>
            <p className="text-lg font-bold text-red-700">{customersWithDebt}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-surface-100 flex-wrap mt-0">
        <input
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Cari nama, HP, atau perusahaan…"
          className="flex-1 min-w-[200px] px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 bg-surface-50"
        />
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value as CustomerType | ""); setPage(1); }}
          className="px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 bg-surface-50">
          <option value="">Semua Tipe</option>
          <option value="REGULAR">Regular</option>
          <option value="VIP">VIP</option>
          <option value="CORPORATE">Corporate</option>
        </select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-surface-400">
            <div className="animate-spin w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full mr-3" />
            Memuat data…
          </div>
        ) : (data?.data.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-surface-400">
            <div className="text-5xl mb-4">👤</div>
            <p className="font-medium">Belum ada pelanggan</p>
            <p className="text-sm mt-1">Tambahkan pelanggan pertama Anda</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
            <div className={`transition-opacity duration-150 ${isFetching ? "opacity-60" : "opacity-100"}`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-50 border-b border-surface-100">
                    <th className="text-left px-4 py-3 font-semibold text-surface-600 text-xs uppercase tracking-wider">Pelanggan</th>
                    <th className="text-left px-4 py-3 font-semibold text-surface-600 text-xs uppercase tracking-wider hidden md:table-cell">Tipe</th>
                    <th className="text-right px-4 py-3 font-semibold text-surface-600 text-xs uppercase tracking-wider hidden lg:table-cell">Total Belanja</th>
                    <th className="text-right px-4 py-3 font-semibold text-surface-600 text-xs uppercase tracking-wider hidden lg:table-cell">Piutang</th>
                    <th className="text-right px-4 py-3 font-semibold text-surface-600 text-xs uppercase tracking-wider hidden lg:table-cell">Order</th>
                    <th className="text-left px-4 py-3 font-semibold text-surface-600 text-xs uppercase tracking-wider hidden xl:table-cell">Kunjungan Terakhir</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {data?.data.map(c => (
                    <tr key={c.id} className="hover:bg-surface-50 transition-colors group">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-surface-900">{c.name}</p>
                        <p className="text-xs text-surface-500 mt-0.5">{c.phone ?? c.email ?? "—"}</p>
                        {c.company && <p className="text-xs text-surface-400">{c.company}</p>}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell"><TypeBadge type={c.type} /></td>
                      <td className="px-4 py-3 text-right font-medium text-surface-900 hidden lg:table-cell">{fmt(Number(c.totalSpent))}</td>
                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                        <DebtBadge amount={Number(c.totalDebt)} />
                      </td>
                      <td className="px-4 py-3 text-right text-surface-600 hidden lg:table-cell">{c.totalOrders}x</td>
                      <td className="px-4 py-3 text-surface-500 text-xs hidden xl:table-cell">{fmtDate(c.lastVisitAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {Number(c.totalDebt) > 0 && (
                            <button onClick={() => setDebtTarget(c)}
                              className="px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 text-xs font-medium transition-colors">
                              Bayar
                            </button>
                          )}
                          <button onClick={() => openEdit(c)}
                            className="px-3 py-1.5 rounded-lg bg-surface-100 text-surface-700 hover:bg-brand-50 hover:text-brand-700 text-xs font-medium transition-colors">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(c)}
                            className="px-3 py-1.5 rounded-lg bg-surface-100 text-surface-700 hover:bg-red-50 hover:text-red-700 text-xs font-medium transition-colors">
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {(data?.totalPages ?? 1) > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-surface-100 bg-surface-50">
                <p className="text-xs text-surface-500">
                  Halaman {data?.page} dari {data?.totalPages}
                </p>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1.5 rounded-lg border border-surface-200 text-xs font-medium text-surface-600 disabled:opacity-40 hover:bg-surface-100 transition-colors">
                    ← Prev
                  </button>
                  <button disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1.5 rounded-lg border border-surface-200 text-xs font-medium text-surface-600 disabled:opacity-40 hover:bg-surface-100 transition-colors">
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {modalOpen && (
        <CustomerFormModal initial={editTarget} onClose={closeModal} />
      )}
      {debtTarget && (
        <PayDebtModal customer={debtTarget} onClose={() => setDebtTarget(null)} />
      )}
    </div>
  );
}
