"use client";

import React, { useState } from "react";
import { Printer } from "lucide-react";
import { Button, Modal } from "@pos/ui";
import { useStoreSettings } from "@/hooks/useSettings";
import type { SuratJalanRecord } from "../types/surat-jalan";
import "./surat-jalan-print.css";

export function SuratJalanPrintModal({ suratJalan }: { suratJalan: SuratJalanRecord }) {
  const { data: storeSettings } = useStoreSettings();
  const [open, setOpen] = useState(false);
  const storeName = storeSettings?.name || "TOKO TELADAN";
  const storeAddress = storeSettings?.address || "Jl. Temu Putih No.30 Cilegon";
  const storePhone = storeSettings?.phone || "0254 393022";
  const printedDate = formatSuratJalanDate(
    suratJalan.confirmedAt || suratJalan.createdAt,
  );

  return (
    <>
      <Button
        variant="accent"
        size="lg"
        icon={<Printer className="h-4 w-4" />}
        onClick={() => setOpen(true)}
        className="flex-1"
      >
        Print Surat Jalan
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Surat Jalan" size="4xl">
        <div className="space-y-4">
          <div
            id="surat-jalan-print"
            className="mx-auto h-[165mm] w-[215mm] overflow-hidden border border-surface-200 bg-white p-[4mm_6mm] font-sans text-xs text-black shadow-sm"
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
                  <p className="text-[11px] text-black">
                    {storeAddress}
                  </p>
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
                  <span className="font-bold">{suratJalan.recipientName}</span>
                </div>
              </div>
            </div>

            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="w-28 border border-black px-3 py-2 text-center font-extrabold text-black">BANYAKNYA</th>
                  <th className="border border-black px-3 py-2 text-left font-extrabold text-black">NAMA BARANG</th>
                  <th className="w-64 border border-black px-3 py-2 text-left font-extrabold text-black">KETERANGAN</th>
                </tr>
              </thead>
              <tbody>
                {suratJalan.items.map((item) => (
                  <tr key={item.id}>
                    <td className="border border-black px-3 py-2 text-center">
                      {item.quantity} {item.unit || ""}
                    </td>
                    <td className="border border-black px-3 py-2">{item.productName}</td>
                    <td className="border border-black px-3 py-2">{item.keterangan || ""}</td>
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
          <div className="flex gap-3 print:hidden surat-jalan-print-hide">
            <Button variant="secondary" size="lg" onClick={() => setOpen(false)} className="flex-1">
              Tutup
            </Button>
            <Button variant="accent" size="lg" onClick={() => window.print()} className="flex-1">
              Print
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

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
