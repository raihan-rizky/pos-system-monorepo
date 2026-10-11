"use client";

import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Printer, Loader2 } from "lucide-react";
import { Button, Modal } from "@pos/ui";

import { useStoreSettings } from "@/hooks/useSettings";
import { getShoppingRequest } from "../api/shopping-requests-api";
import {
  buildShoppingRequestPrintRows,
  formatShoppingRequestDate,
  SHOPPING_REQUEST_PRINT_LAYOUTS,
} from "../helpers/shopping-request-print";
import type {
  ShoppingRequestDetail,
  ShoppingRequestListItem,
} from "../types/shopping-request";
import "./shopping-request-print.css";

type ShoppingRequestPrintColumn =
  (typeof SHOPPING_REQUEST_PRINT_LAYOUTS)[number]["columns"][number];

const PRINT_COLUMN_LABELS: Record<ShoppingRequestPrintColumn, string> = {
  no: "NO",
  productName: "NAMA BARANG",
  requestedQty: "KEBUTUHAN BELANJA",
  stockOnHand: "SISA STOCK BARANG DI GUDANG",
  approvedQty: "JUMLAH YANG DI ACC",
};

export function ShoppingRequestPrintPages({
  detail,
  storeName,
  storeAddress,
  storePhone,
  activePage = 0,
}: {
  detail: ShoppingRequestDetail | (ShoppingRequestListItem & { items: ShoppingRequestDetail["items"] });
  storeName: string;
  storeAddress: string;
  storePhone: string;
  activePage?: number;
}) {
  const rows = buildShoppingRequestPrintRows(detail);

  return (
    <div id="shopping-request-print" className="shopping-request-print-pages">
      {SHOPPING_REQUEST_PRINT_LAYOUTS.map((layout) => (
        <section
          key={layout.kind}
          data-print-page={layout.kind}
          className={`shopping-request-print-page${SHOPPING_REQUEST_PRINT_LAYOUTS[activePage]?.kind === layout.kind ? " shopping-request-print-page--active" : ""}`}
        >
          <header className="shopping-request-print-header">
            <div className="shopping-request-print-store">
              <img src="/images/logo_teladan.png" alt="Logo Toko" />
              <div>
                <h2>PERMOHONAN KEBUTUHAN BARANG</h2>
                <p className="shopping-request-print-store-name">{storeName}</p>
                <p>{storeAddress}</p>
                <p>Telp: {storePhone}</p>
              </div>
            </div>
            <dl className="shopping-request-print-document">
              <div>
                <dt>Nama Daftar Belanja</dt>
                <dd>{detail.name}</dd>
              </div>
              <div>
                <dt>No. Daftar Belanja</dt>
                <dd>{detail.number}</dd>
              </div>
              <div>
                <dt>Tanggal</dt>
                <dd>{formatShoppingRequestDate(detail.approvedAt ?? detail.createdAt)}</dd>
              </div>
              <div>
                <dt>Pemohon</dt>
                <dd>{detail.requestedByName ?? "-"}</dd>
              </div>
            </dl>
          </header>

          <h3 className="shopping-request-print-page-title">
            {layout.kind === "summary" ? "Ringkasan Kebutuhan Belanja" : "Rincian Daftar Belanja"}
          </h3>

          <table className="shopping-request-print-table">
            <thead>
              <tr>
                {layout.columns.map((column) => (
                  <th key={column} scope="col">
                    {PRINT_COLUMN_LABELS[column]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${layout.kind}-${index}`}>
                  {layout.columns.map((column) => {
                    const value = row[column];
                    return (
                      <td key={column}>
                        {value === "" ? <>&nbsp;</> : value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {layout.kind === "full" && (
            <div className="shopping-request-print-signatures">
              <p>Mengetahui:</p>
              <div>
                <section>
                  <p>Wakil Direktur</p>
                  <span />
                  <p>(_______________)</p>
                </section>
                <section>
                  <p>Kepala Gudang</p>
                  <span />
                  <p>(_______________)</p>
                </section>
              </div>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

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
  const [activePage, setActivePage] = useState(0);

  useEffect(() => {
    setActivePage(0);
  }, [open, detail?.id]);

  useEffect(() => {
    if (!open || !detail) {
      setLoaded(null);
      return;
    }
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

  return (
    <Modal
      open={open === true && detail !== null}
      onClose={onClose}
      title="Detail Daftar Belanja"
      size="6xl"
    >
      <div className="space-y-6">
        <div className="shopping-request-print-hide mb-3 flex items-center gap-2">
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
          <>
            <nav className="shopping-request-print-hide flex items-center justify-center gap-3" aria-label="Navigasi halaman struk">
              <button
                type="button"
                aria-label="Halaman sebelumnya"
                disabled={activePage === 0}
                onClick={() => setActivePage(0)}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-surface-200 text-surface-700 hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <span className="min-w-28 text-center text-sm font-medium text-surface-700" aria-live="polite">
                Halaman {activePage + 1} dari {SHOPPING_REQUEST_PRINT_LAYOUTS.length}
              </span>
              <button
                type="button"
                aria-label="Halaman berikutnya"
                disabled={activePage === SHOPPING_REQUEST_PRINT_LAYOUTS.length - 1}
                onClick={() => setActivePage(1)}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-surface-200 text-surface-700 hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </nav>
            <div className="shopping-request-print-preview -mx-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
              <ShoppingRequestPrintPages
                detail={loaded}
                storeName={storeSettings?.name || "TOKO TELADAN"}
                storeAddress={storeSettings?.address || "Jl. Temu Putih No.30 Cilegon"}
                storePhone={storeSettings?.phone || "0254 393022"}
                activePage={activePage}
              />
            </div>
          </>
        )}

        <div className="shopping-request-print-hide sticky bottom-[-16px] z-10 mt-4 flex flex-col gap-3 border-t border-surface-100 bg-white px-6 pb-4 pt-4 shadow-[0_-4px_10px_-1px_rgba(0,0,0,0.05)] sm:flex-row-reverse">
          <Button
            type="button"
            variant="accent"
            size="lg"
            icon={<Printer className="h-4 w-4" />}
            onClick={() => window.print()}
            className="flex-1 sm:min-w-[180px] sm:flex-none"
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
