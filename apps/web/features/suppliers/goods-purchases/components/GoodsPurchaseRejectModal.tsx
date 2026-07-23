"use client";

import { useState } from "react";
import { Button, Modal } from "@pos/ui";
import { useRejectGoodsPurchase } from "../hooks/useGoodsPurchases";

export function GoodsPurchaseRejectModal({
  purchaseId,
  onClose,
}: {
  purchaseId: string | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const rejectPurchase = useRejectGoodsPurchase();
  const close = () => {
    setReason("");
    onClose();
  };
  const submit = async () => {
    if (!purchaseId || !reason.trim()) return;
    await rejectPurchase.mutateAsync({ id: purchaseId, reason });
    close();
  };

  return (
    <Modal
      open={purchaseId !== null}
      onClose={close}
      title="Tolak Pembelian Barang"
      size="md"
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-slate-700">
            Alasan penolakan
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            className="min-h-28 w-full rounded-xl border border-slate-200 p-3 text-sm"
            placeholder="Jelaskan alasan Pembelian Barang ditolak..."
          />
        </label>
        {rejectPurchase.error && (
          <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">
            {rejectPurchase.error.message}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={close}
            className="w-full sm:w-auto"
          >
            Tutup
          </Button>
          <Button
            type="button"
            disabled={!reason.trim()}
            loading={rejectPurchase.isPending}
            onClick={submit}
            className="w-full sm:w-auto"
          >
            Tolak Pembelian Barang
          </Button>
        </div>
      </div>
    </Modal>
  );
}
