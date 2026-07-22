"use client";

import React, { useEffect, useState } from "react";
import { Printer, Store, MapPin, Phone, FileText, Loader2 } from "lucide-react";
import { Button, Modal } from "@pos/ui";

import { useStoreSettings } from "@/hooks/useSettings";
import { getShoppingRequest } from "../api/shopping-requests-api";
import {
  buildShoppingRequestPrintRows,
  formatShoppingRequestDate,
} from "../helpers/shopping-request-print";
import type { ShoppingRequestDetail } from "../types/shopping-request";
import "./shopping-request-print.css";

export function ShoppingRequestPrintModal({
  detail,
  open,
  onClose,
}: {
  detail: ShoppingRequestDetail | null;
  onClose: () => void;
  open?: boolean;
}) {
  const { data: storeSettings } = useStoreSettings();
  const [loaded, setLoaded] = useState<ShoppingRequestDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !detail) {
      setLoaded(null);
      return;
    }
    // If items are missing, fetch full detail
    if (detail.items.length > 0) {
      setLoaded(detail);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getShoppingRequest(detail.id)
      .then((res) => {
        if (!cancelled) setLoaded(res.data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, detail]);

  const storeName = storeSettings?.name || "TOKO TELADAN";
  const storeAddress = storeSettings?.address || "Jl. Temu Putih No.30 Cilegon";
  const storePhone = storeSettings?.phone || "0254 393022";

  return (
    <Modal open={open === true && detail !== null} onClose={onClose} title="Detail Daftar Belanja" size="6xl">
      <div className="space-y-6">
        <div className="shopping-request-print-hide mb-3 flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-surface-400" />
          <p className="text-[10px] font-bold uppercase tracking-wide text-surface-500">
            Pratinjau Cetak
          </p>
        </div>

        {loading || !loaded ? (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 p-8 text-sm font-semibold text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin text-slate-400" />
            Memuat detail...
          </div>
        ) : (
          <div className="overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
            <div
              id="shopping-request-print"
              className="mx-auto min-h-[297mm] w-[210mm] overflow-hidden bg-white p-[4mm_6mm] font-sans text-xs text-black shadow-lg ring-1 ring-black/5"
            >
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <img
                    src="/images/logo_teladan.png"
                    alt="Logo Toko"
                    className="h-16 w-16 object-contain"
                  />
                  <div>
                    <h2 className="mb-0.5 text-base font-bold text-black">
                      PERMOHONAN KEBUTUHAN BARANG
                    </h2>
                    <p className="text-sm font-bold text-[#003366]">{storeName}</p>
                    <p className="text-[11px] text-black">{storeAddress}</p>
                    <p className="text-[11px] text-black">Telp: {storePhone}</p>
                  </div>
                </div>
                <div className="min-w-[250px] space-y-2 text-[12px]">
                  <div className="flex justify-between gap-3">
                    <span>No. Daftar Belanja</span>
                    <span className="font-bold text-[#cc0000]">{loaded.number}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Tanggal</span>
                    <span className="font-semibold">
                      {formatShoppingRequestDate(loaded.approvedAt ?? loaded.createdAt)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Pemohon</span>
                    <span className="font-bold">{loaded.requestedByName ?? "-"}</span>
                  </div>
                </div>
              </div>

              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="w-10 border border-black px-3 py-2 text-center font-extrabold text-black">
                      NO
                    </th>
                    <th className="border border-black px-3 py-2 text-left font-extrabold text-black">
                      NAMA BARANG
                    </th>
                    <th className="w-32 border border-black px-3 py-2 text-center font-extrabold text-black">
                      KEBUTUHAN BELANJA
                    </th>
                    <th className="w-32 border border-black px-3 py-2 text-center font-extrabold text-black">
                      SISA STOCK BARANG DI GUDANG
                    </th>
                    <th className="w-32 border border-black px-3 py-2 text-center font-extrabold text-black">
                      JUMLAH YANG DI ACC
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {buildShoppingRequestPrintRows(loaded).map((row, idx) => (
                    <tr key={idx}>
                      <td className="border border-black px-3 py-2 text-center">{row.no || <>&nbsp;</>}</td>
                      <td className="border border-black px-3 py-2">{row.productName || <>&nbsp;</>}</td>
                      <td className="border border-black px-3 py-2 text-center">{row.requestedQty || <>&nbsp;</>}</td>
                      <td className="border border-black px-3 py-2 text-center">{row.stockOnHand || <>&nbsp;</>}</td>
                      <td className="border border-black px-3 py-2 text-center">{row.approvedQty || <>&nbsp;</>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="mt-6 text-center text-[12px] font-bold text-black">
                Mengetahui:
              </div>
              <div className="mt-3 grid grid-cols-2 gap-8 text-center text-[12px]">
                <div>
                  <p>Wakil Direktur</p>
                  <div className="h-20" />
                  <p>(_______________)</p>
                </div>
                <div>
                  <p>Kepala Gudang</p>
                  <div className="h-20" />
                  <p>(_______________)</p>
                </div>
              </div>

            </div>
          </div>
        )}

        <div className="sticky bottom-[-16px] z-10 bg-white mt-4 flex flex-col gap-3 border-t border-surface-100 pt-4 pb-4 -mx-6 px-6 shadow-[0_-4px_10px_-1px_rgba(0,0,0,0.05)] sm:flex-row-reverse print:hidden">
          <Button
            type="button"
            variant="accent"
            size="lg"
            icon={<Printer className="h-4 w-4" />}
            onClick={() => window.print()}
            className="flex-1 sm:flex-none sm:min-w-[180px]"
          >
            Cetak
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={onClose}
            className="flex-1 sm:flex-none"
          >
            Tutup
          </Button>
        </div>
      </div>
    </Modal>
  );
}
