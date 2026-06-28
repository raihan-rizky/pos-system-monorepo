"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { X, ImagePlus, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { skuFromFilename, filterImageFiles } from "../helpers/bulk-photo-import";
import { lookupSkus, uploadProductImage, patchProductImage } from "../api/bulkPhotoImportApi";

interface FileResult {
  filename: string;
  sku: string;
  status: "pending" | "uploading" | "done" | "error" | "no_match";
  error?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BulkPhotoImportDrawer({ open, onClose }: Props): React.ReactElement | null {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<FileResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const counts = useMemo(
    () =>
      results.reduce<Record<string, number>>((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
      }, {}),
    [results],
  );

  const handleFiles = useCallback((selected: FileList | null): void => {
    const imgs = filterImageFiles(selected);
    setFiles(imgs);
    setResults(imgs.map((f) => ({ filename: f.name, sku: skuFromFilename(f.name), status: "pending" })));
    setDone(false);
  }, []);

  const run = useCallback(async (): Promise<void> => {
    if (!files.length || running) return;
    setRunning(true);
    setDone(false);

    const next: FileResult[] = results.map((r) => ({ ...r }));
    try {
      const skuToId = await lookupSkus(files.map((f) => skuFromFilename(f.name)));

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const sku = skuFromFilename(file.name);
        const productId = skuToId.get(sku);

        if (!productId) {
          next[i] = { ...next[i], status: "no_match", error: "SKU tidak ditemukan" };
          setResults([...next]);
          continue;
        }

        next[i] = { ...next[i], status: "uploading" };
        setResults([...next]);

        try {
          const url = await uploadProductImage(file);
          await patchProductImage(productId, url);
          next[i] = { ...next[i], status: "done" };
        } catch (err) {
          next[i] = { ...next[i], status: "error", error: err instanceof Error ? err.message : "Gagal" };
        }
        setResults([...next]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Gagal mencari SKU";
      for (let i = 0; i < next.length; i++) {
        next[i] = { ...next[i], status: "error", error: message };
      }
      setResults([...next]);
    } finally {
      setRunning(false);
      setDone(true);
    }
  }, [files, results, running]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white shadow-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
              <ImagePlus className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-900">Import Foto Produk</p>
              <p className="text-xs text-slate-500">Pilih folder — nama file = SKU</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={running}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div
            onClick={() => !running && inputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-10 transition-colors cursor-pointer ${running ? "opacity-50 cursor-not-allowed" : "border-slate-200 hover:border-purple-300 hover:bg-purple-50/40"}`}
          >
            <ImagePlus className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-bold text-slate-500">
              {files.length ? `${files.length} foto dipilih` : "Klik untuk pilih folder"}
            </p>
            <p className="text-xs text-slate-400">Contoh: atk-027.jpg → SKU atk-027</p>
            <input
              ref={inputRef}
              type="file"
              // @ts-expect-error webkitdirectory is non-standard
              webkitdirectory=""
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {results.length > 0 && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {results.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-700 truncate">{r.filename}</p>
                    <p className="text-[11px] text-slate-400">SKU: {r.sku}</p>
                  </div>
                  <div className="shrink-0">
                    {r.status === "pending" && <span className="text-[11px] font-bold text-slate-400">Menunggu</span>}
                    {r.status === "uploading" && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                    {r.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    {(r.status === "error" || r.status === "no_match") && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-red-600">
                        <AlertCircle className="h-3 w-3" />
                        {r.error}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {done && (
            <div className="flex gap-3 rounded-2xl bg-slate-50 border border-slate-100 p-4 text-center">
              {counts.done > 0 && (
                <div className="flex-1">
                  <p className="text-lg font-black text-emerald-600">{counts.done}</p>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Berhasil</p>
                </div>
              )}
              {(counts.no_match ?? 0) + (counts.error ?? 0) > 0 && (
                <div className="flex-1">
                  <p className="text-lg font-black text-red-600">{(counts.no_match ?? 0) + (counts.error ?? 0)}</p>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Gagal</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 px-6 py-4 shrink-0">
          <button
            onClick={onClose}
            disabled={running}
            className="min-h-11 rounded-xl bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
          >
            {done ? "Tutup" : "Batal"}
          </button>
          <button
            onClick={run}
            disabled={running || files.length === 0}
            className="min-h-11 rounded-xl bg-purple-600 px-5 text-sm font-bold text-white hover:bg-purple-700 disabled:opacity-40 flex items-center gap-2"
          >
            {running && <Loader2 className="h-4 w-4 animate-spin" />}
            {running ? "Mengupload..." : `Upload ${files.length || ""} Foto`}
          </button>
        </div>
      </div>
    </div>
  );
}
