"use client";

import React, { useState, Suspense } from "react";
import { Truck } from "lucide-react";
import { Modal, Button } from "@pos/ui";
import { useRole } from "@/components/providers/RoleProvider";
import { ReceiptModal } from "@/components/ReceiptModal";
import type { Transaction as ReceiptTransaction } from "@/hooks/useTransactions";
import { useSuspenseSuratJalanBundle, useApproveSuratJalan } from "../hooks/useSuratJalan";
import type { SuratJalanRecord } from "../types/surat-jalan";

import { SuratJalanHeader } from "./SuratJalanHeader";
import { SuratJalanStats } from "./SuratJalanStats";
import { SuratJalanList } from "./SuratJalanList";
import { SuratJalanForm } from "./SuratJalanForm";

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
  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="Cetak Surat Jalan" size="5xl">
      <Suspense fallback={<SuratJalanCreateModalSkeleton />}>
        <SuratJalanCreateModalContent
          transactionId={transactionId}
          onClose={onClose}
        />
      </Suspense>
    </Modal>
  );
};

interface SuratJalanCreateModalContentProps {
  transactionId: string;
  onClose: () => void;
}

const SuratJalanCreateModalContent: React.FC<SuratJalanCreateModalContentProps> = ({
  transactionId,
  onClose,
}) => {
  const { canPerform } = useRole();
  const { data: bundle } = useSuspenseSuratJalanBundle(transactionId);
  const approveMutation = useApproveSuratJalan(transactionId);
  const [isCreating, setIsCreating] = useState(false);
  const [viewingMainReceipt, setViewingMainReceipt] = useState<
    NonNullable<SuratJalanRecord["transaction"]> | null
  >(null);

  return (
    <div className="space-y-6">
      <SuratJalanHeader transactionId={transactionId} bundle={bundle} />
      
      <SuratJalanStats progress={bundle.progress} />
      
      {!isCreating && bundle.suratJalan.length > 0 && (
        <SuratJalanList 
          records={bundle.suratJalan} 
          canApprove={canPerform("surat_jalan", "update")}
          approveMutation={approveMutation}
          onViewMainReceipt={setViewingMainReceipt}
        />
      )}

      {!isCreating ? (
        <Button
          variant="accent"
          size="lg"
          icon={<Truck className="h-4 w-4" />}
          onClick={() => setIsCreating(true)}
          className="w-full shadow-sm"
          disabled={bundle.progress.remainingQuantity <= 0}
        >
          {bundle.suratJalan.length === 0 ? "Buat Surat Jalan" : "Buat Surat Jalan Baru"}
        </Button>
      ) : (
        <SuratJalanForm 
          transactionId={transactionId} 
          bundle={bundle} 
          onCancel={() => setIsCreating(false)} 
        />
      )}

      {viewingMainReceipt && (
        <ReceiptModal
          open={Boolean(viewingMainReceipt)}
          onClose={() => setViewingMainReceipt(null)}
          transaction={viewingMainReceipt as unknown as ReceiptTransaction}
        />
      )}
    </div>
  );
};

const SuratJalanCreateModalSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="h-28 rounded-2xl bg-surface-100" />
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="h-24 rounded-2xl bg-surface-100" />
      <div className="h-24 rounded-2xl bg-surface-100" />
      <div className="h-24 rounded-2xl bg-surface-100" />
      <div className="h-24 rounded-2xl bg-surface-100" />
    </div>
    <div className="h-40 rounded-2xl bg-surface-100" />
  </div>
);
