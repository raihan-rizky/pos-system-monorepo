"use client";

import React, { useState } from "react";
import {
  Printer,
  Truck,
  Store,
  User,
  Calendar,
  Package,
  MapPin,
  Phone,
} from "lucide-react";
import { Button, Modal } from "@pos/ui";
import { useStoreSettings } from "@/hooks/useSettings";
import type { SuratJalanRecord } from "../types/surat-jalan";
import "./surat-jalan-print.css";

interface SuratJalanPrintModalProps {
  suratJalan: SuratJalanRecord;
}

export const SuratJalanPrintModal: React.FC<SuratJalanPrintModalProps> = ({
  suratJalan,
}) => {
  const { data: storeSettings } = useStoreSettings();
  const [open, setOpen] = useState(false);
  const storeName = storeSettings?.name || "TOKO TELADAN";
  const storeAddress = storeSettings?.address || "Jl. Temu Putih No.30 Cilegon";
  const storePhone = storeSettings?.phone || "0254 393022";
  const printedDate = formatSuratJalanDate(
    suratJalan.confirmedAt || suratJalan.createdAt,
  );
  const totalQty = suratJalan.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  return (
    <>
      <Button
        variant="accent"
        size="sm"
        icon={<Printer className="h-4 w-4" />}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="w-full sm:w-auto"
      >
        <span className="hidden sm:inline">Print Surat Jalan</span>
        <span className="sm:hidden">Print</span>
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Cetak Surat Jalan"
        size="4xl"
      >
        <div className="space-y-6">
          {/* ── Info Cards (Bento Grid) ── */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Surat Jalan Identity Card */}
            <div className="col-span-2 rounded-2xl border border-surface-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-lg font-black tracking-tight text-surface-900">
                      {suratJalan.number}
                    </h3>
                    <StatusBadge status={suratJalan.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-surface-600">
                    <span className="inline-flex items-center gap-1.5">
                      <User
                        className="h-3.5 w-3.5 text-surface-400"
                        aria-hidden="true"
                      />
                      <span className="font-semibold text-surface-800">
                        {suratJalan.recipientName}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar
                        className="h-3.5 w-3.5 text-surface-400"
                        aria-hidden="true"
                      />
                      {printedDate}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Package
                        className="h-3.5 w-3.5 text-surface-400"
                        aria-hidden="true"
                      />
                      <span className="font-semibold text-surface-800">
                        {totalQty} item
                      </span>
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <img
                    src="/images/logo_teladan.png"
                    alt="Logo Toko"
                    className="h-12 w-12 rounded-xl border border-surface-100 object-contain p-1"
                  />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-surface-100 pt-4 text-xs text-surface-500">
                <span className="inline-flex items-center gap-1">
                  <Store className="h-3 w-3" aria-hidden="true" />
                  {storeName}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" aria-hidden="true" />
                  {storeAddress}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" aria-hidden="true" />
                  {storePhone}
                </span>
              </div>
            </div>

            {/* Quick Stats Card */}
            <div className="rounded-2xl border border-surface-200 bg-surface-50 p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase tracking-wide text-surface-500">
                Ringkasan
              </p>
              <div className="mt-3 space-y-3">
                <div>
                  <p className="text-2xl font-black tabular-nums text-surface-900">
                    {totalQty}
                  </p>
                  <p className="text-xs text-surface-500">Total Barang</p>
                </div>
                <div>
                  <p className="text-2xl font-black tabular-nums text-surface-900">
                    {suratJalan.items.length}
                  </p>
                  <p className="text-xs text-surface-500">Jenis Barang</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Paper Preview ── */}
          <div className="surat-jalan-print-hide mb-3 flex items-center gap-2">
            <Truck className="h-3.5 w-3.5 text-surface-400" aria-hidden="true" />
            <p className="text-[10px] font-bold uppercase tracking-wide text-surface-500">
              Pratinjau Cetak
            </p>
          </div>
          <div className="overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
            <div
              id="surat-jalan-print"
              className="mx-auto min-w-[215mm] h-[165mm] w-[215mm] overflow-hidden bg-white p-[4mm_6mm] font-sans text-xs text-black shadow-lg ring-1 ring-black/5"
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
                      SURAT JALAN
                    </h2>
                    <p className="text-sm font-bold text-[#003366]">
                      {storeName}
                    </p>
                    <p className="text-[11px] text-black">{storeAddress}</p>
                    <p className="text-[11px] text-black">
                      Telp: {storePhone}
                    </p>
                  </div>
                </div>
                <div className="min-w-[250px] space-y-2 text-[12px]">
                  <div className="flex justify-between gap-3">
                    <span>No. Surat Jalan</span>
                    <span className="font-bold text-[#cc0000]">
                      {suratJalan.number}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Tanggal</span>
                    <span className="font-semibold">{printedDate}</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Penerima</span>
                    <span className="font-bold">
                      {suratJalan.recipientName}
                    </span>
                  </div>
                </div>
              </div>

              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr>
                    <th className="w-28 border border-black px-3 py-2 text-center font-extrabold text-black">
                      BANYAKNYA
                    </th>
                    <th className="border border-black px-3 py-2 text-left font-extrabold text-black">
                      NAMA BARANG
                    </th>
                    <th className="w-64 border border-black px-3 py-2 text-left font-extrabold text-black">
                      KETERANGAN
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {suratJalan.items.map((item) => (
                    <tr key={item.id}>
                      <td className="border border-black px-3 py-2 text-center">
                        {item.quantity} {item.unit || ""}
                      </td>
                      <td className="border border-black px-3 py-2">
                        {item.productName}
                      </td>
                      <td className="border border-black px-3 py-2">
                        {item.keterangan || ""}
                      </td>
                    </tr>
                  ))}
                  {Array.from({ length: Math.max(0, 5 - suratJalan.items.length) }).map((_, index) => (
                    <tr key={`empty-${index}`}>
                      <td className="border border-black px-3 py-2 text-center">&nbsp;</td>
                      <td className="border border-black px-3 py-2">&nbsp;</td>
                      <td className="border border-black px-3 py-2">&nbsp;</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-16 grid grid-cols-3 gap-8 text-center text-[12px]">
                <div>
                  <p>Tanda Terima</p>
                  <div className="h-20" />
                  <p>(_______________)</p>
                </div>
                <div>
                  <p>Pengirim</p>
                  <div className="h-20" />
                  <p>(_______________)</p>
                </div>
                <div>
                  <p>Hormat Kami,</p>
                  <div className="h-20" />
                  <p>(_______________)</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Actions Footer ── */}
          <div className="sticky -bottom-4 -mx-6 -mb-4 flex flex-col gap-3 border-t border-surface-100 bg-white px-6 pb-4 pt-4 sm:flex-row-reverse z-10 rounded-b-2xl">
            <Button
              variant="accent"
              size="lg"
              icon={<Printer className="h-4 w-4" />}
              onClick={() => window.print()}
              className="flex-1 sm:flex-none sm:min-w-[180px]"
            >
              Cetak
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => setOpen(false)}
              className="flex-1 sm:flex-none"
            >
              Tutup
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SuratJalanRecord["status"] }) {
  const variant = STATUS_VARIANT[status] ?? STATUS_VARIANT.PENDING;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${variant}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${status === "CONFIRMED" ? "bg-current" : status === "PENDING" ? "animate-pulse bg-current" : "bg-current"}`}
        aria-hidden="true"
      />
      {status === "CONFIRMED"
        ? "Terkonfirmasi"
        : status === "PENDING"
          ? "Menunggu"
          : status === "CANCELLED"
            ? "Dibatalkan"
            : status === "REJECTED"
              ? "Ditolak"
              : status}
    </span>
  );
}

const STATUS_VARIANT: Record<string, string> = {
  CONFIRMED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  CANCELLED: "bg-surface-100 text-surface-500 border-surface-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
};

function formatSuratJalanDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}
