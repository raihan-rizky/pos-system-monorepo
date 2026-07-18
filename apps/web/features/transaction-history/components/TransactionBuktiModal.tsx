"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal, Button } from "@pos/ui";
import { updateBuktiTransaksi } from "../api/transactionHistoryApi";
import { ProofImageUploader, deleteUploadedProof } from "@/features/proof-upload/components/ProofImageUploader";

export interface TransactionBuktiModalProps {
  open: boolean;
  onClose: () => void;
  transactionId: string;
  initialUrls: string[];
  onSaved: () => void;
}

const TransactionBuktiModal = ({
  open,
  onClose,
  transactionId,
  initialUrls,
  onSaved,
}: TransactionBuktiModalProps) => {
  const [urls, setUrls] = useState<string[]>(
    initialUrls.length > 0 ? [...initialUrls] : [""],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUrls(initialUrls.length > 0 ? [...initialUrls] : [""]);
      setError(null);
    }
  }, [open, initialUrls]);

  const handleUrlChange = useCallback((index: number, val: string) => {
    setUrls((prev) => {
      const newUrls = [...prev];
      newUrls[index] = val;
      return newUrls;
    });
  }, []);

  const handleAddInput = useCallback(() => {
    setUrls((prev) => [...prev, ""]);
  }, []);

  const handleRemoveInput = useCallback((index: number) => {
    setUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDeleteProof = useCallback(async (url: string) => {
    if (!initialUrls.includes(url)) return deleteUploadedProof(url);
    const response = await fetch(`/api/transactions/${transactionId}/bukti`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const body = await response.json().catch(() => null) as { message?: string } | null;
    if (!response.ok) throw new Error(body?.message || "Gagal menghapus foto bukti.");
  }, [initialUrls, transactionId]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    setSubmitting(true);
    try {
      // Filter out empty urls
      const validUrls = urls.filter((u) => u.trim() !== "");
      await updateBuktiTransaksi(transactionId, validUrls);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setSubmitting(false);
    }
  }, [urls, transactionId, onSaved, onClose]);

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Upload Bukti Transaksi">
      <div className="space-y-4">
        {urls.map((url, index) => {
          return (
            <div key={index} className="flex flex-col gap-1.5 p-3 border border-surface-200 rounded-lg bg-surface-50">
              <div className="flex items-center justify-end">
                {urls.length > 1 && !url && (
                  <button
                    type="button"
                    onClick={() => handleRemoveInput(index)}
                    className="text-red-500 hover:text-red-700 hover:underline"
                    disabled={submitting}
                  >
                    Hapus
                  </button>
                )}
              </div>
              <ProofImageUploader
                context="transaction"
                label={`Lampiran transaksi ${index + 1}`}
                value={url}
                onChange={(nextUrl) => handleUrlChange(index, nextUrl)}
                disabled={submitting}
                onDelete={handleDeleteProof}
              />
            </div>
          );
        })}

        <div className="flex justify-start">
          <Button type="button" variant="ghost" onClick={handleAddInput} disabled={submitting}>
            + Tambah Gambar Lain
          </Button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-surface-200 mt-4">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Batal
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default TransactionBuktiModal;
