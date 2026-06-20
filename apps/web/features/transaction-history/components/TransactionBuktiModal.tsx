"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal, Button } from "@pos/ui";
import { updateBuktiTransaksi } from "../api/transactionHistoryApi";

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
  const [urls, setUrls] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvingIndices, setResolvingIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (open) {
      setUrls(initialUrls.length > 0 ? [...initialUrls] : [""]);
      setError(null);
      setResolvingIndices(new Set());
    }
  }, [open, initialUrls]);

  const handleUrlChange = useCallback(async (index: number, val: string) => {
    setUrls((prev) => {
      const newUrls = [...prev];
      newUrls[index] = val;
      return newUrls;
    });

    if (val.includes("prnt.sc") && !resolvingIndices.has(index)) {
      setResolvingIndices((prev) => new Set(prev).add(index));
      try {
        const res = await fetch(`/api/prntsc?url=${encodeURIComponent(val)}&json=true`);
        const data = await res.json();
        if (data.imageUrl) {
          setUrls((prev) => {
            const newUrls = [...prev];
            newUrls[index] = data.imageUrl;
            return newUrls;
          });
        }
      } catch (e) {
        // ignore
      } finally {
        setResolvingIndices((prev) => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }
    }
  }, [resolvingIndices]);

  const handleAddInput = useCallback(() => {
    setUrls((prev) => [...prev, ""]);
  }, []);

  const handleRemoveInput = useCallback((index: number) => {
    setUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

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
          const isResolving = resolvingIndices.has(index);
          return (
            <div key={index} className="flex flex-col gap-1.5 p-3 border border-surface-200 rounded-lg bg-surface-50">
              <label className="text-xs font-semibold text-surface-700 flex justify-between items-center">
                <span>URL Lampiran {index + 1}</span>
                {urls.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveInput(index)}
                    className="text-red-500 hover:text-red-700 hover:underline"
                    disabled={submitting}
                  >
                    Hapus
                  </button>
                )}
              </label>

              <input
                type="url"
                value={url}
                onChange={(e) => handleUrlChange(index, e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-surface-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent text-sm bg-white"
                placeholder="https://prnt.sc/..."
                disabled={submitting || isResolving}
              />

              {isResolving && (
                <p className="text-[11px] text-brand-600 mt-1 animate-pulse">
                  Mengambil gambar otomatis dari Lightshot...
                </p>
              )}

              {url && (
                <div className="mt-2 rounded-lg overflow-hidden border border-surface-200 bg-white relative min-h-[100px] flex justify-center items-center">
                  {url.includes("prnt.sc") ? (
                    <img
                      src={`/api/prntsc?url=${encodeURIComponent(url)}`}
                      alt={`Lampiran Prnt.sc ${index + 1}`}
                      className="w-full h-auto object-contain max-h-[300px]"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <img
                      src={url}
                      alt={`Lampiran ${index + 1}`}
                      className="w-full h-auto object-contain max-h-[300px]"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                    />
                  )}
                  <div className="absolute top-2 right-2">
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs bg-white border border-surface-200 px-2 py-1 rounded shadow-sm text-brand-600 hover:text-brand-700"
                    >
                      Buka di Tab Baru
                    </a>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <div className="flex justify-start">
          <Button type="button" variant="ghost" onClick={handleAddInput} disabled={submitting}>
            + Tambah Gambar Lain
          </Button>
        </div>

        <p className="text-[11px] text-surface-500 mt-1">
          <strong>Cara upload gambar:</strong> Buka <a href="https://prnt.sc/" target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">prnt.sc</a> lalu klik tombol "Browse Images" atau <i>drag</i> gambar ke halaman tersebut. Tunggu hingga proses upload selesai, lalu <i>copy</i> link yang muncul dan <i>paste</i> di sini.
        </p>

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
