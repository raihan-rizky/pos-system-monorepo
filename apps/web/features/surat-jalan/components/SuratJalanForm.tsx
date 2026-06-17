import React, { useState, useMemo, useEffect } from "react";
import { AlertTriangle, Truck } from "lucide-react";
import { Button } from "@pos/ui";
import { CustomerCheckoutSelect } from "@/features/pos-checkout/components/CustomerCheckoutSelect";
import {
  GENERAL_CUSTOMER_NAME,
  type CheckoutCustomerSelection,
} from "@/features/pos-checkout/customer-selection";
import { useCreateSuratJalan } from "../hooks/useSuratJalan";
import { SuratJalanQuantityTable } from "./SuratJalanQuantityTable";
import { SuratJalanPrintModal } from "./SuratJalanPrintModal";
import type { SuratJalanBundle } from "../api/surat-jalan-api";
import type { SuratJalanRecord } from "../types/surat-jalan";

interface SuratJalanFormProps {
  transactionId: string;
  bundle: SuratJalanBundle;
  onCancel: () => void;
}

export const SuratJalanForm: React.FC<SuratJalanFormProps> = ({
  transactionId,
  bundle,
  onCancel,
}) => {
  const createMutation = useCreateSuratJalan();
  const [recipientSelection, setRecipientSelection] = useState<CheckoutCustomerSelection>(() => {
    return bundle.transaction.customerId && bundle.transaction.customerName
      ? {
          kind: "existing",
          customer: {
            id: bundle.transaction.customerId,
            name: bundle.transaction.customerName,
            type: bundle.transaction.customerType ?? "UMUM",
          },
        }
      : { kind: "general" };
  });

  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      bundle.remainingItems.map((item) => [item.transactionItemId, item.remainingQuantity])
    )
  );
  const [keterangan, setKeterangan] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [createError, setCreateError] = useState("");

  const recipientName = useMemo(() => {
    if (recipientSelection.kind === "existing") return recipientSelection.customer.name;
    if (recipientSelection.kind === "general") return GENERAL_CUSTOMER_NAME;
    return recipientSelection.name.trim();
  }, [recipientSelection]);

  const selectedQuantity = useMemo(
    () => Object.values(quantities).reduce((sum, quantity) => sum + Number(quantity || 0), 0),
    [quantities],
  );

  const hasInvalidQuantity = useMemo(() => {
    const isFirst = bundle.suratJalan.length === 0;
    const alreadyManaged = bundle.transaction.stockManagedBySuratJalan;
    const addsInvoiceQty = isFirst && !alreadyManaged;
    return Boolean(
      bundle.remainingItems.some((item) => {
        const quantity = quantities[item.transactionItemId] ?? 0;
        if (quantity > item.remainingQuantity) return true;
        const baseStock = item.currentStock ?? 0;
        const effectiveStock = addsInvoiceQty ? baseStock + item.invoiceQuantity : baseStock;
        return effectiveStock - quantity < 0;
      }),
    );
  }, [bundle, quantities]);

  const handleCreate = async () => {
    if (selectedQuantity <= 0 || hasInvalidQuantity) return;
    setCreateError("");
    try {
      await createMutation.mutateAsync({
        transactionId,
        recipientName,
        quantities,
        keterangan,
      });
      setConfirming(false);
      onCancel();
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "Gagal membuat surat jalan");
    }
  };

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
          <CustomerCheckoutSelect
            value={recipientSelection}
            onChange={(next) => {
              if (next.kind === "new") return;
              setRecipientSelection(next);
            }}
            label="Penerima Surat Jalan"
            allowNewCustomer={false}
          />
        </div>
        <div className="rounded-xl border border-brand-200 bg-brand-50/50 px-5 py-4 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-widest text-brand-600">
            Progress Pengiriman
          </div>
          <div className="mt-1 font-black text-brand-900 text-lg">
            {bundle.progress.deliveredQuantity} / {bundle.progress.totalQuantity} Terkirim
          </div>
        </div>
      </div>

      <div className="rounded-xl shadow-sm">
        <SuratJalanQuantityTable
          items={bundle.remainingItems}
          quantities={quantities}
          keterangan={keterangan}
          isFirstSuratJalan={bundle.suratJalan.length === 0}
          stockManagedBySuratJalan={bundle.transaction.stockManagedBySuratJalan}
          onQuantityChange={(transactionItemId, quantity) =>
            setQuantities((current) => ({ ...current, [transactionItemId]: quantity }))
          }
          onKeteranganChange={(transactionItemId, value) =>
            setKeterangan((current) => ({ ...current, [transactionItemId]: value }))
          }
        />
      </div>

      {confirming && (
        <div className="space-y-3 animate-in slide-in-from-bottom-2 fade-in">
          {(createError || createMutation.error) && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-800 shadow-sm flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" />
              <div>{createError || createMutation.error?.message}</div>
            </div>
          )}
          <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/50 p-5 text-sm text-amber-900 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="font-bold text-base">Konfirmasi Pengurangan Stok</p>
                <p className="mt-1 text-amber-800">
                  Melanjutkan aksi ini akan mengurangi stok gudang Anda sesuai dengan jumlah barang yang ada di surat jalan ini. Pastikan data sudah benar.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sticky Actions */}
      <div className="sticky bottom-0 z-10 -mx-6 -mb-6 mt-8 flex flex-col gap-3 border-t border-surface-100 bg-white/95 px-6 py-4 shadow-[0_-12px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row">
        <Button variant="secondary" size="lg" onClick={onCancel} className="flex-1 shadow-sm">
          Batal
        </Button>
        {confirming ? (
          <Button
            variant="accent"
            size="lg"
            loading={createMutation.isPending}
            disabled={hasInvalidQuantity || selectedQuantity <= 0 || !recipientName.trim()}
            onClick={handleCreate}
            className="flex-1 shadow-sm"
          >
            Ya, Kurangi Stok & Buat
          </Button>
        ) : (
          <Button
            variant="accent"
            size="lg"
            icon={<Truck className="h-4 w-4" />}
            disabled={hasInvalidQuantity || selectedQuantity <= 0 || !recipientName.trim()}
            onClick={() => setConfirming(true)}
            className="flex-1 shadow-sm"
          >
            Konfirmasi Surat Jalan
          </Button>
        )}
      </div>
    </div>
  );
};
