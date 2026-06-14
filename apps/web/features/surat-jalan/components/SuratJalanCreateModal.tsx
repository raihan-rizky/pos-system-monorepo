"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, FileText, Truck } from "lucide-react";
import { Modal, Button } from "@pos/ui";
import { useRole } from "@/components/providers/RoleProvider";
import { formatDate, formatRupiah } from "@/lib/utils";
import { CustomerCheckoutSelect } from "@/features/pos-checkout/components/CustomerCheckoutSelect";
import {
  GENERAL_CUSTOMER_NAME,
  type CheckoutCustomerSelection,
} from "@/features/pos-checkout/customer-selection";
import { useApproveSuratJalan, useCreateSuratJalan, useSuratJalanBundle } from "../hooks/useSuratJalan";
import { SuratJalanQuantityTable } from "./SuratJalanQuantityTable";
import { SuratJalanPrintModal } from "./SuratJalanPrintModal";
import type { SuratJalanRecord } from "../types/surat-jalan";

interface SuratJalanCreateModalProps {
  open: boolean;
  transactionId: string;
  onClose: () => void;
}

export const SuratJalanCreateModal: React.FC<SuratJalanCreateModalProps> = ({
  open,
  transactionId,
  onClose,
}) => {
  const { canPerform } = useRole();
  const { data: bundle, isLoading, error } = useSuratJalanBundle(transactionId, open);
  const createMutation = useCreateSuratJalan();
  const approveMutation = useApproveSuratJalan(transactionId);
  const [recipientSelection, setRecipientSelection] =
    useState<CheckoutCustomerSelection>({ kind: "general" });
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [keterangan, setKeterangan] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [created, setCreated] = useState<SuratJalanRecord | null>(null);
  const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);

  useEffect(() => {
    if (!bundle || !open) return;
    setRecipientSelection(
      bundle.transaction.customerId && bundle.transaction.customerName
        ? {
          kind: "existing",
          customer: {
            id: bundle.transaction.customerId,
            name: bundle.transaction.customerName,
            type: bundle.transaction.customerType ?? "UMUM",
          },
        }
        : { kind: "general" },
    );
    setQuantities(
      Object.fromEntries(
        bundle.remainingItems.map((item) => [
          item.transactionItemId,
          item.remainingQuantity,
        ]),
      ),
    );
    setKeterangan({});
    setCreated(null);
    setConfirming(false);
    setInvoicePreviewOpen(false);
  }, [bundle, open]);

  const recipientName = useMemo(() => {
    if (recipientSelection.kind === "existing") return recipientSelection.customer.name;
    if (recipientSelection.kind === "general") return GENERAL_CUSTOMER_NAME;
    return recipientSelection.name.trim();
  }, [recipientSelection]);

  const selectedQuantity = useMemo(
    () => Object.values(quantities).reduce((sum, quantity) => sum + Number(quantity || 0), 0),
    [quantities],
  );

  const hasInvalidQuantity = useMemo(
    () =>
      Boolean(bundle?.remainingItems.some((item) => {
        const quantity = quantities[item.transactionItemId] ?? 0;
        const afterStock = (item.currentStock ?? 0) - quantity;
        return quantity > item.remainingQuantity || afterStock < 0;
      })),
    [bundle?.remainingItems, quantities],
  );

  const handleCreate = async () => {
    if (!bundle || selectedQuantity <= 0 || hasInvalidQuantity) return;
    const result = await createMutation.mutateAsync({
      transactionId,
      recipientName,
      quantities,
      keterangan,
    });
    setCreated(result);
    setConfirming(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Cetak Surat Jalan" size="5xl">
      <div className="space-y-4">
        {isLoading && <p className="text-sm text-surface-500">Memuat data surat jalan...</p>}
        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error.message}</p>}
        {bundle && (
          <>
            <div className="rounded-xl border border-brand-200 bg-brand-50/70 px-4 py-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setInvoicePreviewOpen((current) => !current)}
                    className="inline-flex items-center gap-2 rounded-lg text-[10px] font-black uppercase tracking-wide text-brand-700 transition-colors hover:text-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    aria-expanded={invoicePreviewOpen}
                  >
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    Invoice Utama
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${invoicePreviewOpen ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-black text-brand-900">
                      {bundle.transaction.invoiceNumber || "-"}
                    </span>
                    <span className="rounded-full border border-brand-200 bg-white px-2 py-0.5 text-[11px] font-bold text-brand-700">
                      {bundle.transaction.status}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-brand-700/80">
                    {bundle.transaction.customerName || "Umum"} · {formatDate(new Date(bundle.transaction.createdAt))}
                  </p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-brand-700/70">
                    Total Invoice
                  </p>
                  <p className="mt-1 text-base font-black text-brand-700">
                    {formatRupiah(bundle.transaction.total)}
                  </p>
                </div>
              </div>
              {invoicePreviewOpen && (
                <div className="mt-3 overflow-x-auto rounded-xl border border-brand-200 bg-white">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead className="bg-brand-50 text-[11px] font-bold uppercase tracking-wide text-brand-700">
                      <tr>
                        <th className="px-3 py-2 text-left">Barang</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Harga</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100">
                      {bundle.transaction.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-2 font-semibold text-surface-900">
                            {item.productName}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {item.quantity} {item.unit || ""}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {formatRupiah(item.unitPrice)}
                          </td>
                          <td className="px-3 py-2 text-right font-bold">
                            {formatRupiah(item.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Metric label="Total Qty" value={bundle.progress.totalQuantity} />
              <Metric label="Terkirim" value={bundle.progress.deliveredQuantity} />
              <Metric label="Sisa" value={bundle.progress.remainingQuantity} />
              <Metric label="Pending" value={bundle.progress.pendingQuantity} />
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <CustomerCheckoutSelect
                  value={recipientSelection}
                  onChange={(next) => {
                    if (next.kind === "new") return;
                    setRecipientSelection(next);
                  }}
                  label="Penerima"
                  allowNewCustomer={false}
                />
              </div>
              <div className="rounded-xl border border-surface-200 bg-surface-50 px-4 py-3 text-sm">
                <div className="text-xs font-bold uppercase tracking-wide text-surface-500">Progress</div>
                <div className="font-black text-surface-900">
                  {bundle.progress.deliveredQuantity}/{bundle.progress.totalQuantity} terkirim
                </div>
              </div>
            </div>

            {bundle.suratJalan.length > 0 && (
              <div className="rounded-xl border border-surface-200 bg-white">
                <div className="border-b border-surface-100 px-4 py-3">
                  <p className="text-sm font-black text-surface-900">Daftar Surat Jalan</p>
                  <p className="text-xs text-surface-500">Semua status tetap tampil untuk audit.</p>
                </div>
                <div className="divide-y divide-surface-100">
                  {bundle.suratJalan.map((record) => (
                    <div key={record.id} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto] md:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-surface-900">{record.number}</span>
                          <StatusPill status={record.status} />
                        </div>
                        <p className="mt-1 text-xs text-surface-500">
                          Penerima: {record.recipientName} · Qty:{" "}
                          {record.items.reduce((sum, item) => sum + item.quantity, 0)}
                        </p>
                        <p className="mt-1 text-xs text-surface-500">
                          Request: {record.requestedByName || "-"} · Approve: {record.approvedByName || "-"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        {record.status === "CONFIRMED" && (
                          <SuratJalanPrintModal suratJalan={record} />
                        )}
                        {record.status === "PENDING" && canPerform("surat_jalan", "update") && (
                          <Button
                            variant="accent"
                            size="sm"
                            loading={approveMutation.isPending}
                            onClick={() => approveMutation.mutate(record.id)}
                          >
                            Setujui
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <SuratJalanQuantityTable
              items={bundle.remainingItems.filter((item) => item.remainingQuantity > 0)}
              quantities={quantities}
              keterangan={keterangan}
              onQuantityChange={(transactionItemId, quantity) =>
                setQuantities((current) => ({ ...current, [transactionItemId]: quantity }))
              }
              onKeteranganChange={(transactionItemId, value) =>
                setKeterangan((current) => ({ ...current, [transactionItemId]: value }))
              }
            />

            {confirming && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <p className="font-bold">Konfirmasi pengiriman</p>
                    <p className="mt-1">
                      Konfirmasi ini akan mengurangi stok sesuai jumlah surat jalan.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex flex-col gap-3 border-t border-surface-100 bg-white/95 px-6 py-4 shadow-[0_-12px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:flex-row">
              <Button variant="secondary" size="lg" onClick={onClose} className="flex-1">
                Tutup
              </Button>
              {created?.status === "CONFIRMED" ? (
                <SuratJalanPrintModal suratJalan={created} />
              ) : confirming ? (
                <Button
                  variant="accent"
                  size="lg"
                  loading={createMutation.isPending}
                  disabled={hasInvalidQuantity || selectedQuantity <= 0 || !recipientName.trim()}
                  onClick={handleCreate}
                  className="flex-1"
                >
                  Ya, Kurangi Stok
                </Button>
              ) : (
                <Button
                  variant="accent"
                  size="lg"
                  icon={<Truck className="h-4 w-4" />}
                  disabled={hasInvalidQuantity || selectedQuantity <= 0 || !recipientName.trim()}
                  onClick={() => setConfirming(true)}
                  className="flex-1"
                >
                  Konfirmasi Surat Jalan
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wide text-surface-500">{label}</div>
      <div className="mt-1 text-xl font-black text-surface-900">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: SuratJalanRecord["status"] }) {
  const className =
    status === "CONFIRMED"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "PENDING"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : status === "REJECTED"
          ? "bg-red-50 text-red-700 border-red-200"
          : "bg-surface-100 text-surface-600 border-surface-200";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-bold ${className}`}>
      {status}
    </span>
  );
}
