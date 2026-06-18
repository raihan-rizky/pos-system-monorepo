import { useState, useRef, useEffect, ReactNode } from "react";
import { 
  MoreVertical, 
  Edit2, 
  Trash2, 
  XCircle, 
  CheckCircle,
  XCircle as RejectIcon 
} from "lucide-react";
import { Transaction } from "@/hooks/useTransactions";
import { isTransactionEligibleForSuratJalan } from "@/features/surat-jalan/components/SuratJalanBundleButton";
import { SuratJalanCreateModal } from "@/features/surat-jalan/components/SuratJalanCreateModal";
import { Truck } from "lucide-react";

interface TransactionActionMenuProps {
  tx: Transaction;
  isSalesRole: boolean;
  canUpdateTransactions: boolean;
  canDeleteTransactions: boolean;
  canApproveTransactions: boolean;
  canRejectTransactions: boolean;
  canApproveDrafts: boolean;
  canVoid: boolean;
  isPending: boolean;
  isBundled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onReject: () => void;
  onApproveDraft: () => void;
  onVoid: () => void;
}

export function TransactionActionMenu({
  tx,
  isSalesRole,
  canUpdateTransactions,
  canDeleteTransactions,
  canApproveTransactions,
  canRejectTransactions,
  canApproveDrafts,
  canVoid,
  isPending,
  isBundled,
  onEdit,
  onDelete,
  onApprove,
  onReject,
  onApproveDraft,
  onVoid,
}: TransactionActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [suratJalanModalOpen, setSuratJalanModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Determine if we have any items to show in the dropdown
  const hasUpdateAction = !isBundled && !isSalesRole && canUpdateTransactions;
  const hasDeleteAction = !isBundled && !isSalesRole && canDeleteTransactions;
  const hasVoidAction = !isBundled && !isSalesRole && canVoid;
  const hasSuratJalanAction = !isBundled && isTransactionEligibleForSuratJalan(tx);

  const hasAnyAction = hasUpdateAction || hasDeleteAction || hasVoidAction || 
                       hasSuratJalanAction;

  if (!hasAnyAction) return null;

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
        className="inline-flex items-center justify-center p-1.5 rounded-lg text-surface-500 hover:text-surface-700 hover:bg-surface-100 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/50"
        aria-label="Pilihan aksi"
      >
        <MoreVertical className="h-5 w-5" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl shadow-lg bg-white ring-1 ring-black/5 divide-y divide-surface-100 z-50 overflow-hidden">
          {/* Action groups */}
          


          {(hasUpdateAction || hasVoidAction) && (
            <div className="p-1">
              {hasUpdateAction && (
                <button
                  onClick={(e) => { e.stopPropagation(); setIsOpen(false); onEdit(); }}
                  className="w-full text-left px-3 py-2 text-sm font-medium text-surface-700 hover:bg-brand-50 hover:text-brand-700 flex items-center rounded-lg transition-colors cursor-pointer"
                >
                  <Edit2 className="mr-2 h-4 w-4 text-surface-500" />
                  Ubah
                </button>
              )}
              {hasVoidAction && (
                <button
                  onClick={(e) => { e.stopPropagation(); setIsOpen(false); onVoid(); }}
                  className="w-full text-left px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 flex items-center rounded-lg transition-colors cursor-pointer"
                >
                  <XCircle className="mr-2 h-4 w-4 text-red-500" />
                  Void
                </button>
              )}
            </div>
          )}

          {hasSuratJalanAction && (
            <div className="p-1">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsOpen(false); setSuratJalanModalOpen(true); }}
                className="group flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-surface-700 hover:bg-surface-50 hover:text-brand-600 rounded-lg transition-colors duration-200 cursor-pointer text-left focus:outline-none focus:bg-surface-50"
              >
                <Truck className="h-4 w-4 text-surface-400 group-hover:text-brand-600" />
                Cetak Surat Jalan
              </button>
            </div>
          )}

          {hasDeleteAction && (
            <div className="p-1">
              <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(false); onDelete(); }}
                className="w-full text-left px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 flex items-center rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="mr-2 h-4 w-4 text-red-500" />
                Hapus
              </button>
            </div>
          )}
        </div>
      )}
      {suratJalanModalOpen && (
        <SuratJalanCreateModal
          open={suratJalanModalOpen}
          transactionId={tx.id}
          onClose={() => setSuratJalanModalOpen(false)}
        />
      )}
    </div>
  );
}
