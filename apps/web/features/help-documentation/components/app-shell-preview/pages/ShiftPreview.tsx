import React from "react";
import { Clock, Edit2, Receipt, TrendingUp, Wallet } from "lucide-react";

import { GuideTarget } from "../GuideTarget";
import {
  PreviewField,
  PreviewMetric,
  PreviewModal,
  PreviewPageRoot,
} from "../PreviewPrimitives";
import type { PreviewContext } from "../types";

export function ShiftPreview(ctx: PreviewContext) {
  const openModal = ctx.state === "shift-open-modal";
  const closeModal = ctx.state === "shift-close-modal";
  const editModal = ctx.state === "shift-edit-modal";
  const activeShift = !openModal;

  return (
    <PreviewPageRoot ctx={ctx} className="bg-surface-50/40">
      <GuideTarget ctx={ctx} target="shift-primary" className="min-h-[980px]">
        <header className="border-b border-surface-100 bg-white/90 px-8 py-5">
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-extrabold">Riwayat Shift Kasir</h1>
              <p className="mt-1 text-sm text-surface-500">
                Daftar rekapan sesi kasir dan selisih kas laci uang
              </p>
            </div>
            {activeShift ? (
              <span className="rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700">
                ● Shift Aktif
              </span>
            ) : null}
          </div>
        </header>

        <div className="space-y-5 px-8 py-6">
          {activeShift ? (
            <GuideTarget
              ctx={ctx}
              target="shift-close"
              className="rounded-2xl border border-brand-100 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="font-black">Shift Aktif</h2>
                  <p className="text-sm text-surface-500">Kasir: Dewi · Dibuka 08:00</p>
                </div>
                <span className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700">
                  TUTUP SHIFT
                </span>
              </div>
              <div className="mt-4 grid grid-cols-4 gap-3">
                <PreviewMetric label="Modal Laci" value="Rp500.000" icon={Wallet} tone="blue" />
                <PreviewMetric label="Transaksi Cash" value="Rp2.740.000" icon={Receipt} />
                <PreviewMetric label="Estimasi Laci" value="Rp3.240.000" icon={TrendingUp} tone="emerald" />
                <PreviewMetric label="Durasi" value="6j 24m" icon={Clock} tone="amber" />
              </div>
            </GuideTarget>
          ) : (
            <GuideTarget
              ctx={ctx}
              target="shift-open"
              className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/40 p-7 text-center"
            >
              <Wallet className="mx-auto h-9 w-9 text-brand-600" />
              <h2 className="mt-3 text-lg font-black">Belum ada shift aktif</h2>
              <p className="mt-1 text-sm text-surface-500">
                Mulai shift untuk mencatat modal dan transaksi kas.
              </p>
              <span className="mt-4 inline-block rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white">
                Mulai Shift
              </span>
            </GuideTarget>
          )}

          <div className="grid grid-cols-4 gap-3">
            <PreviewMetric label="Total Penjualan" value="Rp18,4 jt" tone="emerald" />
            <PreviewMetric label="Cash" value="Rp8,2 jt" tone="blue" />
            <PreviewMetric label="Non-cash" value="Rp10,2 jt" tone="violet" />
            <PreviewMetric label="Selisih" value="Rp0" tone="amber" />
          </div>

          <GuideTarget
            ctx={ctx}
            target="shift-history"
            className="overflow-hidden rounded-2xl border border-surface-200 bg-white shadow-sm"
          >
            <div className="flex items-center gap-2 border-b p-4">
              <Receipt className="h-4 w-4" />
              <div>
                <h2 className="text-sm font-black">Riwayat Shift</h2>
                <p className="text-xs text-surface-500">24 shift tercatat</p>
              </div>
            </div>
            <div className="grid min-w-[1400px] grid-cols-[180px_180px_160px_200px_160px_150px_150px_170px_110px_100px] bg-surface-50 px-5 py-3 text-xs font-bold">
              {[
                "Waktu Mulai",
                "Waktu Selesai",
                "Modal Laci",
                "Ekspetasi Tutup Laci",
                "Tutup Laci",
                "Selisih",
                "Kasir",
                "Catatan",
                "Status",
                "Aksi",
              ].map((label) => <span key={label}>{label}</span>)}
            </div>
            {["Dewi", "Rizal", "Nadia"].map((name, index) => (
              <div
                key={name}
                className="grid min-w-[1400px] grid-cols-[180px_180px_160px_200px_160px_150px_150px_170px_110px_100px] border-t px-5 py-4 text-xs"
              >
                <span>10 Jul · 08:00</span>
                <span>10 Jul · 16:0{index}</span>
                <span>Rp500.000</span>
                <span>Rp3.240.000</span>
                <span>Rp3.240.000</span>
                <span>Rp0</span>
                <strong>{name}</strong>
                <span>Shift pagi</span>
                <span className="text-emerald-700">Ditutup</span>
                {index === 0 ? (
                  editModal ? (
                    <span className="text-brand-700"><Edit2 className="h-4 w-4" /></span>
                  ) : (
                    <GuideTarget ctx={ctx} target="shift-edit" className="text-brand-700">
                      <Edit2 className="h-4 w-4" />
                    </GuideTarget>
                  )
                ) : <span>—</span>}
              </div>
            ))}
          </GuideTarget>
        </div>
      </GuideTarget>

      {openModal ? (
        <PreviewModal ctx={ctx} target="shift-opening-cash" title="Mulai Shift">
          <PreviewField label="Modal Laci" value="Rp500.000" />
        </PreviewModal>
      ) : null}
      {closeModal ? (
        <PreviewModal ctx={ctx} target="shift-closing-cash" title="Tutup Shift">
          <div className="space-y-4">
            <PreviewField label="Uang Tutup Laci" value="Rp3.240.000" />
            <PreviewField label="Estimasi Sistem" value="Rp3.240.000" />
            <PreviewField label="Catatan" value="Shift normal" />
          </div>
        </PreviewModal>
      ) : null}
      {editModal ? (
        <PreviewModal ctx={ctx} target="shift-edit" title="Ubah Shift">
          <div className="grid grid-cols-2 gap-4">
            <PreviewField label="Kasir" value="Dewi" />
            <PreviewField label="Modal Laci" value="Rp500.000" />
            <PreviewField label="Tutup Laci" value="Rp3.240.000" />
            <PreviewField label="Catatan" value="Shift pagi" />
          </div>
        </PreviewModal>
      ) : null}
    </PreviewPageRoot>
  );
}

