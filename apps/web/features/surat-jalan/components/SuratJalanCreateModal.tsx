"use client";

import React from "react";
import { Modal } from "@pos/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRole } from "@/components/providers/RoleProvider";
import { useStoreSettings } from "@/hooks/useSettings";
import { useSuratJalanBundle, suratJalanBundleKey } from "../hooks/useSuratJalan";
import { approveSuratJalan, createSuratJalan, updateSuratJalanDocument } from "../api/surat-jalan-api";
import type { SuratJalanBundle } from "../api/surat-jalan-api";
import type { SuratJalanRecord } from "../types/surat-jalan";
import { SuratJalanReceiptEditor } from "./SuratJalanReceiptEditor";

interface SuratJalanCreateModalProps {
  open: boolean;
  transactionId: string;
  initialRecordId?: string;
  onClose: () => void;
}

export const SuratJalanCreateModal: React.FC<SuratJalanCreateModalProps> = ({ open, ...props }) => {
  if (!open) return null;
  return <SuratJalanCreateModalContent key={`${props.transactionId}:${props.initialRecordId ?? "latest"}`} {...props} />;
};

function SuratJalanCreateModalContent({ transactionId, initialRecordId, onClose }: Omit<SuratJalanCreateModalProps, "open">) {
  const { canPerform } = useRole();
  const { data: bundle, isPending, error, refetch } = useSuratJalanBundle(transactionId);
  const { data: store } = useStoreSettings();
  const queryClient = useQueryClient();
  const publish = (saved: SuratJalanRecord) => {
    queryClient.setQueryData<SuratJalanBundle>(suratJalanBundleKey(transactionId), current => current ? {
      ...current, suratJalan: [...current.suratJalan.filter(item => item.id !== saved.id), saved],
    } : current);
    for (const queryKey of [["surat-jalan"], ["surat-jalans"], ["transaction-history"], ["transactions"], ["products"], ["inventory-management"], ["inventory-movements"], ["product-stock-groups"]]) {
      void queryClient.invalidateQueries({ queryKey });
    }
    return saved;
  };
  if (!bundle) {
    return <Modal open onClose={onClose} title="Surat Jalan" size="5xl">
      {isPending ? <SuratJalanCreateModalSkeleton /> : <div role="alert" className="space-y-3"><p>Surat jalan belum dapat dimuat. Silakan coba lagi.</p><p className="text-sm text-surface-500">{error?.message}</p><button type="button" className="sj-secondary-button" onClick={() => void refetch()}>Coba lagi</button></div>}
    </Modal>;
  }
  return <SuratJalanReceiptEditor
    bundle={bundle}
    initialRecordId={initialRecordId}
    store={{ name: store?.name || "TOKO TELADAN", address: store?.address || "Jl. Temu Putih No.30 Cilegon", phone: store?.phone || "0254 393022" }}
    canCreate={canPerform("surat_jalan", "create")}
    canUpdate={canPerform("surat_jalan", "update")}
    onClose={onClose}
    onSave={async (record, changes) => {
      if (record) {
        if (!record.updatedAt) throw new Error("Versi dokumen belum tersedia. Tutup lalu buka kembali surat jalan.");
        return publish(await updateSuratJalanDocument(record.id, { ...changes, expectedUpdatedAt: record.updatedAt }));
      }
      return publish(await createSuratJalan({ transactionId, ...changes }));
    }}
    onApprove={async record => publish(await approveSuratJalan(record.id))}
  />;
}

function SuratJalanCreateModalSkeleton() {
  return <div role="status" className="animate-pulse space-y-4 py-8"><p>Menyiapkan struk surat jalan…</p><div className="h-64 rounded-lg bg-surface-100" /></div>;
}
