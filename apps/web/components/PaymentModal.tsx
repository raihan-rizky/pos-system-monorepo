"use client";

import React, { useState, useEffect } from "react";
import { Banknote, Smartphone, CreditCard, Landmark, CheckCircle2, Coins, FileClock, PackageCheck, PanelsTopLeft, RotateCcw } from "lucide-react";
import { Modal, Button, Input } from "@pos/ui";
import { formatRupiah } from "@/lib/utils";
import type { CartItem } from "@/hooks/useCart";
import { useCreateCustomer } from "@/hooks/useCustomers";
import { useRole } from "@/components/providers/RoleProvider";
import { useSalespersons } from "@/hooks/useSalespersons";
import { CustomerCheckoutSelect } from "@/features/pos-checkout/components/CustomerCheckoutSelect";
import {
  resolveCheckoutCustomer,
  type CheckoutCustomerSelection,
} from "@/features/pos-checkout/customer-selection";
import { useCustomerCategoryPricingRules } from "@/hooks/useCustomerCategoryPricingRules";
import {
  formatPricingRuleLabel,
  calculateCustomPriceMargin,
  canEditCustomPriceForCustomer,
  priceProductForCustomerType,
  resolveCustomPricedLine,
  isRegularPriceFallback,
  type CategoryPricingRule,
  type CustomerType,
} from "@/features/customer-category-pricing/helpers/pricing-rules";



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
    items: CartItem[];
    payments?: { method: string; amount: number }[];
  }) => void;
  onSaveDraft?: (data: {
    discount: number;
    note: string;
    customerName: string;
    customerId: string | null;
    salesName: string;
    salespersonId: string;
    isJobOrder: boolean;
    estimatedDoneAt: string | null;
    items: CartItem[];
    payments?: { method: "CASH" | "DEBIT" | "CREDIT" | "QRIS" | "TRANSFER"; amount: number }[];
  }) => void;
  isProcessing?: boolean;
  isSavingDraft?: boolean;
  draftError?: string | null;
}

const paymentMethods = [
  { value: "CASH", label: "Tunai", icon: Banknote },
  { value: "QRIS", label: "QRIS", icon: Smartphone },
  { value: "DEBIT", label: "Debit", icon: CreditCard },
  { value: "TRANSFER", label: "Transfer", icon: Landmark },
];

const quickAmounts = [10000, 20000, 50000, 100000];

export function PaymentModal({
  open,
  onClose,
  items,
  subtotal,
  onConfirm,
  onSaveDraft,
  isProcessing,
  isSavingDraft,
  draftError,
}: PaymentModalProps) {
  const [selectedPaymentMethods, setSelectedPaymentMethods] = useState<string[]>(["CASH"]);
  const [discountMode, setDiscountMode] = useState<"RP" | "PERCENT">("RP");
  const [discountInput, setDiscountInput] = useState(0);
  const [amountsPaid, setAmountsPaid] = useState<Record<string, number>>({});
  const amountPaid = selectedPaymentMethods.reduce((sum, method) => sum + (amountsPaid[method] || 0), 0);
  
  const togglePaymentMethod = (method: string) => {
    setSelectedPaymentMethods((prev) => {
      if (prev.includes(method)) {
        if (prev.length === 1) return prev; // Keep at least one
        const newAmounts = { ...amountsPaid };
        delete newAmounts[method];
        setAmountsPaid(newAmounts);
        return prev.filter((m) => m !== method);
      }
      if (prev.length >= 2) return prev; // Restrict max to 2
      return [...prev, method];
    });
  };
  const [note, setNote] = useState("");
  const [customerSelection, setCustomerSelection] =
    useState<CheckoutCustomerSelection>({ kind: "general" });
  const [manualPrices, setManualPrices] = useState<Record<string, number>>({});
  const [customerError, setCustomerError] = useState<string | null>(null);
  const createCustomer = useCreateCustomer();
  const pricingRulesQuery = useCustomerCategoryPricingRules({ activeOnly: true });
  const [salespersonId, setSalespersonId] = useState("");
  const { data: salespersons = [] } = useSalespersons();
  const [isDP, setIsDP] = useState(false);
  const [isJobOrder, setIsJobOrder] = useState(() => {
    return items.some(item => item.lineType === "PRINTING_SERVICE" || item.material || item.size);
  });
  const [estimatedDoneAt, setEstimatedDoneAt] = useState("");
  
  const { role } = useRole();
  const selectedCustomerType: CustomerType =
    customerSelection.kind === "existing"
      ? customerSelection.customer.type ?? "UMUM"
      : "UMUM";
  const canEditCustomPrices = canEditCustomPriceForCustomer(
    role,
    selectedCustomerType,
  );
  const activePricingRules: CategoryPricingRule[] = (pricingRulesQuery.data ?? []).map((rule) => ({
    id: rule.id,
    categoryId: rule.categoryId,
    categoryName: rule.category.name,
    customerType: rule.customerType,
    mode: rule.mode,
    value: Number(rule.value),
    isActive: rule.isActive,
  }));
  const pricedItems = items.map((item): CartItem => {
    if (item.lineType !== "PRODUCT" || !item.categoryId) return item;
    const priced = priceProductForCustomerType(
      {
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        price: item.catalogPrice ?? item.price,
        hargaDinas: item.hargaDinas,
      },
      selectedCustomerType,
      activePricingRules,
    );
    const resolved = resolveCustomPricedLine({
      pricedLine: priced,
      submittedPrice: manualPrices[item.cartLineId],
      role,
      customerType: selectedCustomerType,
    });
    return {
      ...item,
      price: resolved.unitPrice,
      appliedPricing: resolved.appliedPricing,
    };
  });
  const pricedSubtotal = pricedItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const affectedItems = pricedItems.filter(
    (item) =>
      item.lineType === "PRODUCT" &&
      (item.catalogPrice ?? item.price) !== item.price,
  );

  useEffect(() => {
    if (!open) {
      // reset on close
      setCustomerSelection({ kind: "general" });
      setManualPrices({});
      setCustomerError(null);
    } else {
      // auto-set isJobOrder if opening with items that have material/size
      setIsJobOrder(items.some(item => item.lineType === "PRINTING_SERVICE" || item.material || item.size));
    }
  }, [open, items]);

  useEffect(() => {
    if (canEditCustomPrices) return;
    setManualPrices({});
  }, [canEditCustomPrices, selectedCustomerType]);

  const rawDiscount =
    discountMode === "PERCENT"
      ? Math.round(pricedSubtotal * (Math.min(Math.max(discountInput, 0), 100) / 100))
      : Math.max(discountInput, 0);
  const discount = Math.min(rawDiscount, pricedSubtotal);
  const isClamped = rawDiscount > pricedSubtotal;
  const total = pricedSubtotal - discount;
  const change = amountPaid - total;
  const remaining = total - amountPaid;

  // Full payment must pay >= total. DP may be 0 as long as it is still below total.
  const hasInvalidManualPrice = pricedItems.some(
    (item) =>
      item.lineType === "PRODUCT" &&
      manualPrices[item.cartLineId] != null &&
      manualPrices[item.cartLineId] < 0,
  );

  const canPay = isDP
    ? amountPaid >= 0 && amountPaid < total && total > 0 && !hasInvalidManualPrice
    : amountPaid >= total && total > 0 && !hasInvalidManualPrice;

  const resolveCustomerForSubmit = async () => {
    try {
      setCustomerError(null);
      return await resolveCheckoutCustomer(
        customerSelection,
        createCustomer.mutateAsync,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gagal menyimpan pelanggan";
      setCustomerError(message);
      return null;
    }
  };

  const handleConfirm = async () => {
    const selectedSales = salespersons.find(s => s.id === salespersonId);
    const customer = await resolveCustomerForSubmit();
    if (!customer) return;

    onConfirm({
      paymentMethod: selectedPaymentMethods[0] || "CASH",
      amountPaid,
      discount,
      note,
      customerName: customer.customerName,
      customerId: customer.customerId,
      salesName: selectedSales?.name || "",
      salespersonId,
      paymentStatus: isDP ? "DP" : "COMPLETED",
      isJobOrder,
      estimatedDoneAt: estimatedDoneAt || null,
      items: pricedItems,
      payments: selectedPaymentMethods.map(m => ({ method: m, amount: amountsPaid[m] || 0 })).filter(p => p.amount > 0),
    });
  };

  const handleSaveDraft = async () => {
    if (!onSaveDraft) return;
    const selectedSales = salespersons.find((s) => s.id === salespersonId);
    const customer = await resolveCustomerForSubmit();
    if (!customer) return;

    onSaveDraft({
      discount,
      note,
      customerName: customer.customerName,
      customerId: customer.customerId,
      salesName: selectedSales?.name || "",
      salespersonId,
      isJobOrder,
      estimatedDoneAt: estimatedDoneAt || null,
      items: pricedItems,
      payments: selectedPaymentMethods.map(m => ({ method: m as "CASH" | "DEBIT" | "CREDIT" | "QRIS" | "TRANSFER", amount: amountsPaid[m] || 0 })).filter(p => p.amount > 0),
    });
  };

  const canSaveDraft =
    total > 0 &&
    !hasInvalidManualPrice &&
    !isProcessing &&
    !isSavingDraft &&
    !createCustomer.isPending;

  const handleExactAmount = () => {
    const firstMethod = selectedPaymentMethods[0];
    if (firstMethod) {
      setAmountsPaid(prev => ({ ...prev, [firstMethod]: total }));
    }
  };

  const updateManualPrice = (cartLineId: string, value: number) => {
    setManualPrices((current) => ({
      ...current,
      [cartLineId]: value,
    }));
  };

  const resetManualPrice = (cartLineId: string) => {
    setManualPrices((current) => {
      const next = { ...current };
      delete next[cartLineId];
      return next;
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Pembayaran" size="lg">
      <div className="space-y-5 px-1 py-1">
        {/* Order Summary */}
        <div className="bg-surface-50 rounded-xl p-4 space-y-2 max-h-[200px] overflow-y-auto">
          {pricingRulesQuery.isError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              Aturan harga khusus gagal dimuat. Checkout memakai harga katalog.
            </div>
          )}
          {affectedItems.length > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
              Harga {selectedCustomerType} diterapkan untuk {affectedItems.length} item.
            </div>
          )}
          {pricedItems.map((item) => (
            <div key={item.cartLineId} className="rounded-lg bg-white/50 p-2 text-sm">
              <div className="flex justify-between gap-3">
              <span className="text-surface-600">
                {item.name} × {item.quantity}
              </span>
              <span className="font-medium text-surface-900">
                {formatRupiah(item.price * item.quantity)}
              </span>
              </div>
              {item.lineType === "PRODUCT" && canEditCustomPrices && (
                <div className="mt-2 space-y-1.5">
                  {(() => {
                    const catalogPrice = item.catalogPrice ?? item.price;
                    const margin = calculateCustomPriceMargin({
                      costPrice: item.costPrice,
                      catalogPrice,
                      customPrice: item.price,
                    });
                    const inputId = `custom-price-${item.cartLineId}`;
                    const warningId = `custom-price-warning-${item.cartLineId}`;
                    const hasManualPrice = manualPrices[item.cartLineId] != null;
                    const isNegativeManualPrice =
                      hasManualPrice && manualPrices[item.cartLineId] < 0;
                    const warningText = isNegativeManualPrice
                      ? "Harga khusus tidak boleh negatif."
                      : margin.isBelowCost
                        ? "Harga khusus di bawah HPP."
                        : null;

                    return (
                      <>
                        <label
                          htmlFor={inputId}
                          className="text-[11px] font-semibold uppercase tracking-wide text-surface-500"
                        >
                          Harga khusus
                        </label>
                        <div className="flex gap-2">
                          <input
                            id={inputId}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            value={manualPrices[item.cartLineId] ?? item.price}
                            onChange={(event) =>
                              updateManualPrice(
                                item.cartLineId,
                                Number(event.target.value) || 0,
                              )
                            }
                            aria-describedby={warningText ? warningId : undefined}
                            aria-label={`Harga khusus untuk ${item.name}`}
                            className="min-w-0 flex-1 rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm font-semibold text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                          />
                          <button
                            type="button"
                            onClick={() => resetManualPrice(item.cartLineId)}
                            disabled={!hasManualPrice}
                            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-surface-200 text-surface-600 hover:bg-surface-100 disabled:opacity-40 disabled:cursor-not-allowed"
                            aria-label={`Reset harga khusus untuk ${item.name}`}
                            title="Reset"
                          >
                            <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                        {warningText && (
                          <p
                            id={warningId}
                            className={`text-[11px] font-semibold ${
                              isNegativeManualPrice ? "text-red-700" : "text-amber-700"
                            }`}
                          >
                            {warningText}
                          </p>
                        )}
                        {hasManualPrice && (
                          <div className="text-[11px] font-semibold text-brand-700">
                            Harga manual
                          </div>
                        )}
                        {margin.isChanged && (
                          <div className="rounded-lg border border-surface-200 bg-white p-2 text-[11px] text-surface-600">
                            <div className="mb-1 flex justify-between gap-2">
                              <span className="font-semibold text-surface-700">HPP</span>
                              <span className="font-semibold">
                                {margin.hasCostPrice
                                  ? formatRupiah(item.costPrice ?? 0)
                                  : "Tidak tersedia"}
                              </span>
                            </div>
                            {margin.hasCostPrice ? (
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div className="rounded-md bg-surface-50 p-2">
                                  <div className="font-semibold text-surface-700">
                                    Harga saat ini
                                  </div>
                                  <div>{formatRupiah(catalogPrice)}</div>
                                  <div>
                                    Profit {formatRupiah(margin.currentProfit ?? 0)} (
                                    {margin.currentMarginPercent}%)
                                  </div>
                                </div>
                                <div className="rounded-md bg-brand-50 p-2 text-brand-900">
                                  <div className="font-semibold">Harga khusus</div>
                                  <div>{formatRupiah(item.price)}</div>
                                  <div>
                                    Profit {formatRupiah(margin.customProfit ?? 0)} (
                                    {margin.customMarginPercent}%)
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <p>Margin tidak tersedia karena HPP belum diisi.</p>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
              {item.lineType === "PRODUCT" && item.appliedPricing && (
                <div className="mt-1 text-[11px] text-surface-500">
                  <span className="font-semibold text-emerald-700">
                    {formatPricingRuleLabel({
                      ruleId: item.appliedPricing.ruleId,
                      customerType: item.appliedPricing.customerType,
                      mode: item.appliedPricing.mode,
                      value: item.appliedPricing.value,
                    })}
                  </span>
                  <span>
                    {" "}
                    {formatRupiah(item.appliedPricing.originalUnitPrice)} menjadi{" "}
                    {formatRupiah(item.appliedPricing.appliedUnitPrice)}
                  </span>
                </div>
              )}
              {item.lineType === "PRODUCT" &&
                !item.appliedPricing &&
                isRegularPriceFallback({
                  appliedPricing: null,
                  customerType: selectedCustomerType,
                }) && (
                  <div className="mt-1 text-[11px] text-amber-700">
                    <span className="font-semibold">Harga Reguler</span>
                    <span>
                      {" "}
                      — tidak ada Harga Dinas atau Harga Khusus untuk produk
                      ini.
                    </span>
                  </div>
                )}
            </div>
          ))}
        </div>

        <CustomerCheckoutSelect
          value={customerSelection}
          onChange={setCustomerSelection}
          error={customerError}
          disabled={createCustomer.isPending}
          onClearError={() => setCustomerError(null)}
        />

        {/* Salesperson Dropdown */}
        <div>
          <label className="text-sm font-medium text-surface-700 mb-2 block">
            Sales (Opsional)
          </label>
          <select
            value={salespersonId}
            onChange={(e) => setSalespersonId(e.target.value)}
            className="w-full bg-surface-50 border border-surface-200 rounded-xl px-4 py-2.5 text-surface-900 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">-- Pilih Sales --</option>
            {salespersons.map(sp => (
              <option key={sp.id} value={sp.id}>{sp.name}</option>
            ))}
          </select>
        </div>

        {/* Payment Method */}
        <div>
          <label className="text-sm font-medium text-surface-700 mb-2 block">
            Metode Pembayaran
          </label>
          <div className="grid grid-cols-4 gap-2">
            {paymentMethods.map((method) => {
              const Icon = method.icon;
              const isSelected = selectedPaymentMethods.includes(method.value);
              const isDisabled = !isSelected && selectedPaymentMethods.length >= 2;
              return (
                <button
                  key={method.value}
                  onClick={() => togglePaymentMethod(method.value)}
                  disabled={isDisabled}
                  className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all ${
                    isSelected
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : isDisabled
                      ? "border-surface-100 bg-surface-50 text-surface-400 opacity-50 cursor-not-allowed"
                      : "border-surface-200 bg-white text-surface-600 hover:border-brand-300 hover:bg-brand-50"
                  }`}
                >
                  <Icon className={`w-6 h-6 mb-2 ${isSelected ? "text-brand-600" : "text-surface-400"}`} />
                  <span className="text-xs font-semibold">{method.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* DP Toggle */}
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
              <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
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
              <Coins className="w-4 h-4" aria-hidden="true" />
              <span>Uang Muka (DP)</span>
            </button>
          </div>
        </div>

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
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
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
              <PanelsTopLeft className="h-4 w-4" aria-hidden="true" />
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
        <div>
          <label className="text-sm font-medium text-surface-700 mb-1.5 block">
            Diskon
          </label>
          <div className="flex gap-2">
            <select
              value={discountMode}
              onChange={(e) => {
                setDiscountMode(e.target.value as "RP" | "PERCENT");
                setDiscountInput(0);
              }}
              className="bg-white border border-surface-200 rounded-xl px-3 py-2.5 text-sm font-medium text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 cursor-pointer"
              aria-label="Tipe diskon"
            >
              <option value="RP">Rp</option>
              <option value="PERCENT">%</option>
            </select>
            <input
              type="number"
              inputMode="decimal"
              min={0}
              max={discountMode === "PERCENT" ? 100 : undefined}
              step={discountMode === "PERCENT" ? 0.5 : 1}
              value={discountInput || ""}
              onChange={(e) => setDiscountInput(Number(e.target.value) || 0)}
              placeholder="0"
              aria-label={discountMode === "PERCENT" ? "Diskon persen" : "Diskon rupiah"}
              className="flex-1 min-w-0 px-4 py-2.5 rounded-xl bg-white border border-surface-200 text-surface-900 placeholder:text-surface-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400 hover:border-surface-300"
            />
          </div>
          {discountMode === "PERCENT" && (
            <div className="flex flex-wrap gap-2 mt-2">
              {[5, 10, 15, 20, 25, 50].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDiscountInput(p)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                    discountInput === p
                      ? "bg-brand-600 text-white"
                      : "bg-brand-50 text-brand-700 hover:bg-brand-100"
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          )}
          {isClamped && (
            <p className="text-xs text-amber-600 mt-1.5">
              Diskon dipotong sampai subtotal ({formatRupiah(pricedSubtotal)})
            </p>
          )}
        </div>

        {/* Totals */}
        <div className={`rounded-xl p-4 text-white ${isDP ? 'bg-gradient-to-r from-amber-500 to-amber-600' : 'bg-gradient-to-r from-brand-600 to-brand-700'}`}>
          <div className="flex justify-between text-sm opacity-80">
            <span>Subtotal</span>
            <span>{formatRupiah(pricedSubtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-sm opacity-80 mt-1">
              <span>
                Diskon
                {discountMode === "PERCENT" && discountInput > 0 && (
                  <span className="ml-1 opacity-75">
                    ({Math.min(discountInput, 100)}%)
                  </span>
                )}
              </span>
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
          {selectedPaymentMethods.map((method) => (
            <div key={method} className="mb-2">
              <Input
                label={selectedPaymentMethods.length > 1 ? `Jumlah Bayar - ${paymentMethods.find(m => m.value === method)?.label || method} (Rp)` : (isDP ? "Jumlah DP / Uang Muka (Rp)" : "Jumlah Bayar (Rp)")}
                type="number"
                value={amountsPaid[method] || ""}
                onChange={(e) => setAmountsPaid(prev => ({ ...prev, [method]: Number(e.target.value) || 0 }))}
                placeholder="0"
              />
            </div>
          ))}
          <div className="flex flex-wrap gap-2 mt-2">
            {!isDP && (
              <button
                onClick={() => {
                  const firstMethod = selectedPaymentMethods[0];
                  if (firstMethod) {
                    setAmountsPaid({ [firstMethod]: total });
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
              >
                Uang Pas
              </button>
            )}
            {isDP && (
              <>
                {[0.25, 0.50, 0.75].map((percent) => (
                  <button
                    key={percent}
                    onClick={() => {
                      const firstMethod = selectedPaymentMethods[0];
                      if (firstMethod) {
                        setAmountsPaid({ [firstMethod]: Math.round(total * percent) });
                      }
                    }}
                    className="px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
                  >
                    {percent * 100}%
                  </button>
                ))}
              </>
            )}
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                onClick={() => {
                  const firstMethod = selectedPaymentMethods[0];
                  if (firstMethod) {
                    setAmountsPaid({ [firstMethod]: amount });
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium text-surface-600 bg-surface-100 rounded-lg hover:bg-surface-200 transition-colors"
              >
                {(amount / 1000)}K
              </button>
            ))}
          </div>
        </div>

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
        {draftError && (
          <p
            id="payment-draft-error"
            className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
          >
            {draftError}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button
            variant="secondary"
            size="lg"
            onClick={onClose}
            className="sm:flex-1"
          >
            Batal
          </Button>
          {onSaveDraft && (
            <div className="sm:flex-1 flex flex-col items-center gap-1">
              <button
                type="button"
                id="payment-save-draft"
                onClick={handleSaveDraft}
                disabled={!canSaveDraft}
                className="w-full inline-flex items-center justify-center gap-2 min-h-12 px-4 rounded-xl
                  bg-slate-700 text-white text-sm font-semibold cursor-pointer
                  hover:bg-slate-800 transition-colors duration-200
                  disabled:opacity-60 disabled:cursor-not-allowed
                  focus:outline-none focus:ring-2 focus:ring-slate-500/50"
              >
                <FileClock className="h-4 w-4" aria-hidden="true" />
                {isSavingDraft || createCustomer.isPending ? "Menyimpan..." : "Faktur Sementara"}
              </button>
              <span className="text-[10px] text-surface-500 text-center font-medium">
                Aksi ini tidak akan mengubah stok
              </span>
            </div>
          )}
          <Button
            variant="accent"
            size="lg"
            onClick={handleConfirm}
            disabled={!canPay || createCustomer.isPending}
            loading={isProcessing || createCustomer.isPending}
            className="sm:flex-1"
          >
            {isProcessing
              ? "Memproses..."
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
