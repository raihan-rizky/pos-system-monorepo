"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Card } from "@pos/ui";
import { useRole } from "@/components/providers/RoleProvider";
import { shouldShowAction, shouldShowUpdateAction } from "@/features/rbac/helpers/rbac-ui";

interface Salesperson {
  id: string;
  name: string;
  isActive: boolean;
  storeId: string;
  createdAt: string;
  _count?: {
    transactions: number;
  };
}

// ─── Status Toggle ─────────────────────────────────────────────────────────────

function StatusToggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean;
  onChange: () => void;
  id: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`
        relative inline-flex h-6 w-11 items-center rounded-full
        transition-colors duration-200 cursor-pointer
        focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:ring-offset-2
        ${checked ? "bg-emerald-500" : "bg-surface-300"}
      `}
    >
      <span
        className={`
          inline-block h-4 w-4 rounded-full bg-white shadow-sm
          transition-transform duration-200
          ${checked ? "translate-x-6" : "translate-x-1"}
        `}
      />
    </button>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  color,
  delay,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  delay?: string;
}) {
  return (
    <Card glass className="animate-fade-in" style={delay ? { animationDelay: delay } : undefined}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-surface-400 uppercase tracking-wider">
            {label}
          </p>
          <p className="text-2xl font-extrabold text-surface-900 mt-2">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────────

export default function SalespersonsPage() {
  const { canPerform } = useRole();
  const canCreateSalespersons = shouldShowAction("salesperson", "create", canPerform);
  const canUpdateSalespersons = shouldShowUpdateAction("salesperson", canPerform);
  const [salespersons, setSalespersons] = useState<Salesperson[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchSalespersons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/salespersons?storeId=store-main");
      if (res.ok) {
        const data = await res.json();
        setSalespersons(data);
      }
    } catch (error) {
      console.error("Error fetching salespersons:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSalespersons();
  }, [fetchSalespersons]);

  // ─── Derived data ───────────────────────────────────────────────────────────
  const totalSales = salespersons.length;
  const activeSales = salespersons.filter((s) => s.isActive).length;
  const totalTransactions = salespersons.reduce(
    (sum: number, s) => sum + (s._count?.transactions || 0),
    0
  );
  const topPerformer = salespersons.reduce(
    (top: Salesperson | undefined, s) => ((s._count?.transactions || 0) > (top?._count?.transactions || 0) ? s : top),
    salespersons[0]
  );

  const filteredSalespersons = salespersons.filter((sp) => {
    const matchesSearch = sp.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "active" && sp.isActive) ||
      (filterStatus === "inactive" && !sp.isActive);
    return matchesSearch && matchesStatus;
  });

  // ─── Handlers ───────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    try {
      let res: Response;
      if (editingId) {
        res = await fetch(`/api/salespersons/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), isActive }),
        });
      } else {
        res = await fetch("/api/salespersons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), storeId: "store-main", isActive }),
        });
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: "Unknown error" }));
        setErrorMessage(errorData.message || "Failed to save salesperson");
        return;
      }

      setIsModalOpen(false);
      setName("");
      setIsActive(true);
      setEditingId(null);
      setErrorMessage(null);
      fetchSalespersons();
    } catch (error) {
      console.error("Error saving salesperson:", error);
      setErrorMessage("Network error. Please try again.");
    }
  };

  const handleQuickToggle = async (sp: Salesperson) => {
    if (!canUpdateSalespersons) return;
    setTogglingId(sp.id);
    try {
      const res = await fetch(`/api/salespersons/${sp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !sp.isActive }),
      });
      if (res.ok) {
        fetchSalespersons();
      }
    } catch (error) {
      console.error("Error toggling status:", error);
    } finally {
      setTogglingId(null);
    }
  };

  const openEditModal = (sp: Salesperson) => {
    if (!canUpdateSalespersons) return;
    setEditingId(sp.id);
    setName(sp.name);
    setIsActive(sp.isActive);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const openAddModal = () => {
    if (!canCreateSalespersons) return;
    setEditingId(null);
    setName("");
    setIsActive(true);
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="px-4 md:px-8 pt-6 md:pt-8 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-surface-900">
              Tim Sales
            </h1>
            <p className="text-sm text-surface-400 mt-1">
              Kelola tim penjualan dan pantau performa mereka
            </p>
          </div>
          {canCreateSalespersons && (
            <button
              id="add-salesperson-btn"
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-semibold text-sm shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer active:scale-95"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Tambah Sales
            </button>
          )}
        </header>

        <div className="px-4 md:px-8 pb-24 md:pb-8 space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Sales"
              value={loading ? "..." : totalSales}
              color="bg-brand-50"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0c98e9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              }
            />
            <StatCard
              label="Aktif"
              value={loading ? "..." : activeSales}
              color="bg-emerald-50"
              delay="0.05s"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              }
            />
            <StatCard
              label="Total Transaksi"
              value={loading ? "..." : totalTransactions}
              color="bg-accent-50"
              delay="0.1s"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f97d12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
              }
            />
            <StatCard
              label="Top Performer"
              value={loading ? "..." : topPerformer?.name || "—"}
              color="bg-purple-50"
              delay="0.15s"
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              }
            />
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 pointer-events-none"
                width="16" height="16" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="salesperson-search"
                type="text"
                placeholder="Cari nama salesperson..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-surface-200 bg-surface-50 text-sm
                  focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-surface-100 rounded-xl p-1">
              {(["all", "active", "inactive"] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilterStatus(status)}
                  className={`
                    px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 cursor-pointer
                    ${filterStatus === status
                      ? "bg-white text-surface-900 shadow-sm"
                      : "text-surface-500 hover:text-surface-700"
                    }
                  `}
                >
                  {status === "all" ? "Semua" : status === "active" ? "Aktif" : "Nonaktif"}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
            {loading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 bg-surface-100 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : filteredSalespersons.length === 0 ? (
              <div className="p-12 flex flex-col items-center justify-center text-surface-400">
                <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mb-4 opacity-40">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
                <p className="font-medium text-surface-600">
                  {searchQuery || filterStatus !== "all"
                    ? "Tidak ada sales yang cocok dengan filter."
                    : "Belum ada salesperson. Mulai tambahkan tim sales Anda!"}
                </p>
                {!searchQuery && filterStatus === "all" && canCreateSalespersons && (
                  <button
                    onClick={openAddModal}
                    className="mt-4 text-sm text-brand-600 hover:text-brand-700 font-semibold underline underline-offset-2 cursor-pointer"
                  >
                    Tambah salesperson pertama
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-50 border-b border-surface-200">
                      <th className="py-4 px-5 font-semibold text-xs text-surface-500 uppercase tracking-wider">Nama</th>
                      <th className="py-4 px-5 font-semibold text-xs text-surface-500 uppercase tracking-wider">Status</th>
                      <th className="py-4 px-5 font-semibold text-xs text-surface-500 uppercase tracking-wider">Transaksi</th>
                      <th className="py-4 px-5 font-semibold text-xs text-surface-500 uppercase tracking-wider text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-100">
                    {filteredSalespersons.map((sp, i) => {
                      const txCount = sp._count?.transactions || 0;
                      return (
                        <tr
                          key={sp.id}
                          className="hover:bg-surface-50 transition-colors duration-150"
                          style={{ animationDelay: `${i * 30}ms` }}
                        >
                          {/* Name + Avatar */}
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-3">
                              <div className={`
                                w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0
                                ${sp.isActive
                                  ? "bg-brand-50 text-brand-600"
                                  : "bg-surface-100 text-surface-400"
                                }
                              `}>
                                {sp.name.charAt(0).toUpperCase()}
                              </div>
                              <span className="font-semibold text-sm text-surface-900">{sp.name}</span>
                            </div>
                          </td>

                          {/* Status Toggle */}
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-2.5">
                              {canUpdateSalespersons ? (
                                <StatusToggle
                                  id={`toggle-${sp.id}`}
                                  checked={sp.isActive}
                                  onChange={() => handleQuickToggle(sp)}
                                />
                              ) : (
                                <span
                                  className={`inline-flex h-6 min-w-11 items-center justify-center rounded-full px-2 text-[10px] font-bold ${sp.isActive ? "bg-emerald-100 text-emerald-700" : "bg-surface-100 text-surface-500"}`}
                                >
                                  {sp.isActive ? "ON" : "OFF"}
                                </span>
                              )}
                              <span className={`text-xs font-semibold ${sp.isActive ? "text-emerald-600" : "text-surface-400"}`}>
                                {togglingId === sp.id ? "..." : sp.isActive ? "Aktif" : "Nonaktif"}
                              </span>
                            </div>
                          </td>

                          {/* Transactions */}
                          <td className="py-4 px-5">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-surface-900">{txCount}</span>
                              {txCount > 0 && (
                                <div className="flex-1 max-w-[80px] h-1.5 bg-surface-100 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-brand-500 rounded-full transition-all duration-500"
                                    style={{
                                      width: `${Math.min(100, (txCount / Math.max(totalTransactions, 1)) * 100)}%`,
                                    }}
                                  />
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-4 px-5 text-right">
                            {canUpdateSalespersons && (
                              <button
                                id={`edit-sp-${sp.id}`}
                                onClick={() => openEditModal(sp)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                                  bg-surface-100 text-surface-600 hover:bg-brand-50 hover:text-brand-700 border border-transparent
                                  hover:border-brand-200 transition-all duration-200 cursor-pointer"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                Edit
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ─── Add/Edit Modal ────────────────────────────────────────────────────── */}
      {isModalOpen && (editingId ? canUpdateSalespersons : canCreateSalespersons) && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />

          {/* Panel */}
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Brand accent bar */}
            <div className="h-1 w-full bg-gradient-to-r from-brand-500 to-accent-500" />

            {/* Header */}
            <div className="px-6 pt-6 pb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-surface-900">
                  {editingId ? "Edit Salesperson" : "Tambah Salesperson"}
                </h2>
                <p className="text-xs text-surface-500 mt-0.5">
                  {editingId ? "Perbarui informasi salesperson" : "Tambahkan anggota baru ke tim sales"}
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl hover:bg-surface-100 transition-colors text-surface-400 hover:text-surface-700 cursor-pointer"
                aria-label="Tutup modal"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <form onSubmit={handleSubmit}>
              <div className="px-6 pb-5 space-y-4">
                {/* Name */}
                <div>
                  <label htmlFor="sp-name" className="block text-xs font-semibold text-surface-600 mb-1.5">
                    Nama Lengkap
                  </label>
                  <input
                    id="sp-name"
                    type="text"
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => { setName(e.target.value); setErrorMessage(null); }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-surface-200 bg-surface-50 text-sm
                      focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 transition-all
                      placeholder:text-surface-400"
                    placeholder="Contoh: Ahmad Rafi"
                  />
                </div>

                {/* Status Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-surface-50 border border-surface-200">
                  <div>
                    <p className="text-sm font-semibold text-surface-900">
                      {isActive ? "Status: Aktif" : "Status: Nonaktif"}
                    </p>
                    <p className="text-xs text-surface-500 mt-0.5">
                      {isActive ? "Tampil di dropdown POS saat checkout" : "Tersembunyi dari dropdown POS"}
                    </p>
                  </div>
                  <StatusToggle
                    id="modal-status-toggle"
                    checked={isActive}
                    onChange={() => setIsActive(!isActive)}
                  />
                </div>

                {/* Error Message */}
                {errorMessage && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-medium flex items-start gap-2">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 mt-0.5">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="15" y1="9" x2="9" y2="15" />
                      <line x1="9" y1="9" x2="15" y2="15" />
                    </svg>
                    {errorMessage}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 pb-6 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-surface-200 text-sm font-semibold text-surface-600
                    hover:bg-surface-50 transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold
                    hover:bg-brand-700 transition-colors cursor-pointer active:scale-95"
                >
                  {editingId ? "Simpan Perubahan" : "Tambah Sales"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
