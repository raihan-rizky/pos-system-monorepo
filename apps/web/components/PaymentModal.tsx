"use client";

import React, { useState } from "react";
import { Modal, Button, Input } from "@pos/ui";
import { formatRupiah } from "@/lib/utils";
import type { CartItem } from "@/hooks/useCart";

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
  const [customerName, setCustomerName] = useState("Pelanggan Umum");

  const total = subtotal - discount;
  const change = amountPaid - total;
  const canPay = amountPaid >= total && total > 0;

  const handleConfirm = () => {
    onConfirm({ paymentMethod, amountPaid, discount, note, customerName });
  };

  const handleExactAmount = () => {
    setAmountPaid(total);
  };

  return (
    <Modal open={open} onClose={onClose} title="Pembayaran" size="lg">
      <div className="space-y-5 max-h-[80vh] overflow-y-auto px-1 py-1">
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

        {/* Customer Name */}
        <Input
          label="Nama Pelanggan"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="Pelanggan Umum"
        />

        {/* Payment Method */}
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

        {/* Discount */}
        <Input
          label="Diskon (Rp)"
          type="number"
          value={discount || ""}
          onChange={(e) => setDiscount(Number(e.target.value) || 0)}
          placeholder="0"
        />

        {/* Totals */}
        <div className="bg-gradient-to-r from-brand-600 to-brand-700 rounded-xl p-4 text-white">
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
        <div>
          <Input
            label="Jumlah Bayar (Rp)"
            type="number"
            value={amountPaid || ""}
            onChange={(e) => setAmountPaid(Number(e.target.value) || 0)}
            placeholder="0"
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleExactAmount}
              className="px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
            >
              Uang Pas
            </button>
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

        {/* Change */}
        {amountPaid > 0 && (
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
            {isProcessing ? "Memproses..." : "Konfirmasi Bayar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
