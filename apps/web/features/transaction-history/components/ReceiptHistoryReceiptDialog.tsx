"use client";

import { Modal } from "@pos/ui";
import { ReceiptModal } from "@/components/ReceiptModal";
import { useTransaction } from "@/hooks/useTransactions";

export function ReceiptHistoryReceiptDialog({ transactionId, onClose }: { transactionId: string; onClose: () => void }) {
  const { data, isLoading, error, refetch } = useTransaction(transactionId);
  if (data && !error) return <ReceiptModal open onClose={onClose} transaction={data} />;
  return <Modal open onClose={onClose} title="Rincian nota">
    {isLoading ? <p role="status" className="text-sm text-surface-600">Memuat nota...</p> :
      <div role="alert" className="text-sm text-red-800">Nota belum dapat dimuat. <button type="button" onClick={() => void refetch()} className="min-h-11 font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700">Coba lagi</button></div>}
  </Modal>;
}
