"use client";

import React, { useState, useEffect, useRef } from "react";
import { Modal, Button, Input } from "@pos/ui";
import { formatRupiah } from "@/lib/utils";
import type { CartItem } from "@/hooks/useCart";
import { useDebounce } from "@/hooks/useDebounce";
import type { Customer } from "@/hooks/useCustomers";
import { useRole } from "@/components/providers/RoleProvider";

interface SalespersonOption {
  id: string;
  name: string;
}

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  items: CartItem[];
  subtotal: number;
  onConfirm: (data: {
    paymentMethod: string;
    amountPaid: number;
    discount: number;
    note: string;
    customerName: string;
    customerId: string | null;
    salesName: string;
    salespersonId: string;
    paymentStatus: string;
    isJobOrder: boolean;
    estimatedDoneAt: string | null;
  }) => void;
  isProcessing?: boolean;
}

const paymentMethods = [
  { value: "CASH", label: "Tunai", icon: "💵" },
  { value: "QRIS", label: "QRIS", icon: "📱" },
  { value: "DEBIT", label: "Debit", icon: "💳" },
  { value: "TRANSFER", label: "Transfer", icon: "🏦" },
];

const quickAmounts = [10000, 20000, 50000, 100000];

export function PaymentModal({
  open,
  onClose,
  items,
  subtotal,
  onConfirm,
  isProcessing,
}: PaymentModalProps) {
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [discount, setDiscount] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);
  const [note, setNote] = useState("");
  // Customer search
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(customerQuery, 300);
  const [salespersonId, setSalespersonId] = useState("");
  const [salespersons, setSalespersons] = useState<SalespersonOption[]>([]);
  const [isDP, setIsDP] = useState(false);
  const [isJobOrder, setIsJobOrder] = useState(false);
  const [estimatedDoneAt, setEstimatedDoneAt] = useState("");
  
  const { role } = useRole();
  const isSalesRole = role === "SALES";

  useEffect(() => {
    if (open) {
      fetch("/api/salespersons?storeId=store-main&activeOnly=true")
        .then(res => {
          if (!res.ok) throw new Error(`Failed to fetch salespersons: ${res.status}`);
          return res.json();
        })
        .then(data => setSalespersons(data))
        .catch(err => console.error("Error fetching salespersons:", err));
    } else {
      // reset on close
      setCustomerQuery("");
      setSelectedCustomer(null);
      setCustomerResults([]);
      setShowDropdown(false);
    }
  }, [open]);

  // Search customers when query changes
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setCustomerResults([]);
      setShowDropdown(false);
      return;
    }
    fetch(`/api/customers?search=${encodeURIComponent(debouncedQuery)}&limit=5`)
      .then(r => r.json())
      .then(d => {
        setCustomerResults(d.data ?? []);
        setShowDropdown(true);
      })
      .catch(() => {});
  }, [debouncedQuery]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const total = subtotal - discount;
  const change = amountPaid - total;
  const remaining = total - amountPaid;

  // Full payment: must pay >= total. DP: must pay > 0 and < total.
  // SALES role just submits the request, no payment required yet.
  const canPay = isSalesRole 
    ? total > 0
    : isDP
      ? amountPaid > 0 && amountPaid < total && total > 0
      : amountPaid >= total && total > 0;

  const handleConfirm = () => {
    const selectedSales = salespersons.find(s => s.id === salespersonId);
    onConfirm({
      paymentMethod,
      amountPaid,
      discount,
      note,
      customerName: selectedCustomer?.name || customerQuery || "Pelanggan Umum",
      customerId: selectedCustomer?.id ?? null,
      salesName: selectedSales?.name || "",
      salespersonId,
      paymentStatus: isDP ? "DP" : "COMPLETED",
      isJobOrder,
      estimatedDoneAt: estimatedDoneAt || null,
    });
  };

  const handleExactAmount = () => {
    setAmountPaid(total);
  };

  return (
    <Modal open={open} onClose={onClose} title="Pembayaran" size="lg">
      <div className="space-y-5 px-1 py-1">
        {/* Order Summary */}
        <div className="bg-surface-50 rounded-xl p-4 space-y-2 max-h-[200px] overflow-y-auto">
          {items.map((item) => (
            <div key={item.productId} className="flex justify-between text-sm">
              <span className="text-surface-600">
                {item.name} × {item.quantity}
              </span>
              <span className="font-medium text-surface-900">
                {formatRupiah(item.price * item.quantity)}
              </span>
            </div>
          ))}
        </div>

        {/* Customer Search Combobox */}
        <div ref={comboRef} className="relative">
          <label className="text-sm font-medium text-surface-700 mb-1.5 block">Pelanggan</label>
          {selectedCustomer ? (
            <div>
              <div className="flex items-center justify-between px-3 py-2.5 border border-brand-300 bg-brand-50 rounded-xl">
                <div>
                  <p className="font-semibold text-brand-900 text-sm">{selectedCustomer.name}</p>
                  {selectedCustomer.phone && <p className="text-xs text-brand-600">{selectedCustomer.phone}</p>}
                </div>
                <button
                  onClick={() => { setSelectedCustomer(null); setCustomerQuery(""); }}
                  className="text-brand-400 hover:text-brand-700 text-xs px-2 py-1 rounded transition-colors"
                >
                  Ganti
                </button>
              </div>
              {/* Debt warning */}
              {Number(selectedCustomer.totalDebt) > 0 && (
                <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
                  <span className="text-sm">⚠️</span>
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-red-700">Piutang belum lunas</p>
                    <p className="text-sm font-extrabold text-red-800">{formatRupiah(Number(selectedCustomer.totalDebt))}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="relative">
              <input
                value={customerQuery}
                onChange={e => setCustomerQuery(e.target.value)}
                onFocus={() => customerResults.length > 0 && setShowDropdown(true)}
                placeholder="Cari nama atau HP, atau ketik walk-in…"
                className="w-full px-3 py-2.5 border border-surface-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-400 bg-surface-50"
              />
              {showDropdown && customerResults.length > 0 && (
                <div className="absolute z-50 top-full mt-1 w-full bg-white border border-surface-200 rounded-xl shadow-lg overflow-hidden">
                  {customerResults.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => { setSelectedCustomer(c); setShowDropdown(false); }}
                      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-brand-50 transition-colors text-left"
                    >
                      <div>
                        <p className="text-sm font-medium text-surface-900">{c.name}</p>
                        <p className="text-xs text-surface-500">{c.phone ?? c.email ?? c.company ?? ""}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {Number(c.totalDebt) > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-700">
                            Piutang
                          </span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          c.type === "VIP" ? "bg-amber-100 text-amber-700" :
                          c.type === "CORPORATE" ? "bg-violet-100 text-violet-700" :
                          "bg-slate-100 text-slate-600"
                        }`}>{c.type}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Salesperson Dropdown */}
        <div>
          <label className="text-sm font-medium text-surface-700 mb-2 block">
            Salesperson (Opsional)
          </label>
          <select
            value={salespersonId}
            onChange={(e) => setSalespersonId(e.target.value)}
            className="w-full bg-surface-50 border border-surface-200 rounded-xl px-4 py-2.5 text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">-- Pilih Salesperson --</option>
            {salespersons.map(sp => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
        </div>

        {/* Payment Method */}
        {!isSalesRole && (
        <div>
          <label className="text-sm font-medium text-surface-700 mb-2 block">
            Metode Pembayaran
          </label>
          <div className="grid grid-cols-4 gap-2">
            {paymentMethods.map((method) => (
              <button
                key={method.value}
                onClick={() => setPaymentMethod(method.value)}
                className={`
                  flex flex-col items-center gap-1 p-3 rounded-xl border text-sm font-medium
                  transition-all duration-200
                  ${paymentMethod === method.value
                    ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                    : "border-surface-200 text-surface-600 hover:border-surface-300"
                  }
                `}
              >
                <span className="text-lg">{method.icon}</span>
                <span className="text-xs">{method.label}</span>
              </button>
            ))}
          </div>
        </div>
        )}

        {/* DP Toggle */}
        {!isSalesRole && (
        <div>
          <label className="text-sm font-medium text-surface-700 mb-2 block">
            Tipe Pembayaran
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setIsDP(false)}
              className={`
                flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium
                transition-all duration-200
                ${!isDP
                  ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                  : "border-surface-200 text-surface-600 hover:border-surface-300"
                }
              `}
            >
              <span>✅</span>
              <span>Lunas</span>
            </button>
            <button
              onClick={() => setIsDP(true)}
              className={`
                flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium
                transition-all duration-200
                ${isDP
                  ? "border-amber-500 bg-amber-50 text-amber-700 shadow-sm"
                  : "border-surface-200 text-surface-600 hover:border-surface-300"
                }
              `}
            >
              <span>💰</span>
              <span>Uang Muka (DP)</span>
            </button>
          </div>
        </div>
        )}

        {/* Job Order Toggle */}
        <div>
          <label className="text-sm font-medium text-surface-700 mb-2 block">
            Tipe Pesanan
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setIsJobOrder(false)}
              className={`
                flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium
                transition-all duration-200
                ${!isJobOrder
                  ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
                  : "border-surface-200 text-surface-600 hover:border-surface-300"
                }
              `}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                <path d="M3 6h18" />
              </svg>
              <span>Beli Langsung</span>
            </button>
            <button
              onClick={() => setIsJobOrder(true)}
              className={`
                flex items-center justify-center gap-2 p-3 rounded-xl border text-sm font-medium
                transition-all duration-200
                ${isJobOrder
                  ? "border-violet-500 bg-violet-50 text-violet-700 shadow-sm"
                  : "border-surface-200 text-surface-600 hover:border-surface-300"
                }
              `}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
                <path d="M15 3v18" />
              </svg>
              <span>Job Order</span>
            </button>
          </div>

          {/* Deadline Picker — only shown when Job Order */}
          {isJobOrder && (
            <div className="mt-3 p-3 bg-violet-50/50 border border-violet-200 rounded-xl">
              <label className="text-xs font-semibold text-violet-700 uppercase tracking-wider block mb-1.5">
                Estimasi Selesai
              </label>
              <input
                type="date"
                value={estimatedDoneAt}
                onChange={(e) => setEstimatedDoneAt(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full px-3 py-2 bg-white border border-violet-200 rounded-lg text-sm
                           focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
              />
            </div>
          )}
        </div>

        {/* Discount */}
        <Input
          label="Diskon (Rp)"
          type="number"
          value={discount || ""}
          onChange={(e) => setDiscount(Number(e.target.value) || 0)}
          placeholder="0"
        />

        {/* Totals */}
        <div className={`rounded-xl p-4 text-white ${isDP ? 'bg-gradient-to-r from-amber-500 to-amber-600' : 'bg-gradient-to-r from-brand-600 to-brand-700'}`}>
          <div className="flex justify-between text-sm opacity-80">
            <span>Subtotal</span>
            <span>{formatRupiah(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm opacity-80 mt-1">
              <span>Diskon</span>
              <span>-{formatRupiah(discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-xl font-extrabold mt-2 pt-2 border-t border-white/20">
            <span>Total</span>
            <span>{formatRupiah(total)}</span>
          </div>
        </div>

        {/* Amount Paid */}
        {!isSalesRole && (
        <div>
          <Input
            label={isDP ? "Jumlah DP / Uang Muka (Rp)" : "Jumlah Bayar (Rp)"}
            type="number"
            value={amountPaid || ""}
            onChange={(e) => setAmountPaid(Number(e.target.value) || 0)}
            placeholder="0"
          />
          <div className="flex flex-wrap gap-2 mt-2">
            {!isDP && (
              <button
                onClick={handleExactAmount}
                className="px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
              >
                Uang Pas
              </button>
            )}
            {isDP && (
              <>
                <button
                  onClick={() => setAmountPaid(Math.round(total * 0.25))}
                  className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  25%
                </button>
                <button
                  onClick={() => setAmountPaid(Math.round(total * 0.50))}
                  className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  50%
                </button>
                <button
                  onClick={() => setAmountPaid(Math.round(total * 0.75))}
                  className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  75%
                </button>
              </>
            )}
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                onClick={() => setAmountPaid(amount)}
                className="px-3 py-1.5 text-xs font-medium text-surface-600 bg-surface-100 rounded-lg hover:bg-surface-200 transition-colors"
              >
                {(amount / 1000)}K
              </button>
            ))}
          </div>
        </div>
        )}

        {/* Change / Remaining */}
        {amountPaid > 0 && (
          <div>
            {isDP ? (
              <div className={`flex justify-between items-center p-3 rounded-xl ${
                remaining > 0
                  ? "bg-amber-50 text-amber-700"
                  : "bg-danger-50 text-danger-600"
              }`}>
                <span className="text-sm font-medium">
                  {remaining > 0 ? "Sisa Tagihan" : "Kelebihan (gunakan Lunas)"}
                </span>
                <span className="text-lg font-extrabold">
                  {formatRupiah(Math.abs(remaining))}
                </span>
              </div>
            ) : (
              <div
                className={`flex justify-between items-center p-3 rounded-xl ${
                  change >= 0
                    ? "bg-success-50 text-success-600"
                    : "bg-danger-50 text-danger-600"
                }`}
              >
                <span className="text-sm font-medium">
                  {change >= 0 ? "Kembalian" : "Kurang"}
                </span>
                <span className="text-lg font-extrabold">
                  {formatRupiah(Math.abs(change))}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Note */}
        <Input
          label="Catatan (opsional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Contoh: untuk pak Budi"
        />

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" size="lg" onClick={onClose} className="flex-1">
            Batal
          </Button>
          <Button
            variant="accent"
            size="lg"
            onClick={handleConfirm}
            disabled={!canPay}
            loading={isProcessing}
            className="flex-1"
          >
            {isProcessing
              ? "Memproses..."
              : isSalesRole
                ? "Kirim Permintaan"
                : isDP
                  ? `Bayar DP ${amountPaid > 0 ? formatRupiah(amountPaid) : ''}`
                  : "Konfirmasi Bayar"
            }
          </Button>
        </div>
      </div>
    </Modal>
  );
}
