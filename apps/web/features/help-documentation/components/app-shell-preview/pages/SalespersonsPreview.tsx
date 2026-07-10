import React from "react";
import {
  Activity,
  CheckCircle2,
  Plus,
  Search,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";

import { GuideTarget } from "../GuideTarget";
import {
  PreviewField,
  PreviewMetric,
  PreviewModal,
  PreviewPageRoot,
} from "../PreviewPrimitives";
import type { PreviewContext } from "../types";

export function SalespersonsPreview(ctx: PreviewContext) {
  const addOpen = ctx.state === "salespersons-add-modal";
  const detailOpen = ctx.state === "salespersons-detail-open";

  return (
    <PreviewPageRoot ctx={ctx} className="bg-surface-50/40">
      <GuideTarget
        ctx={ctx}
        target="salespersons-primary"
        className="min-h-[960px] px-8 pb-16 pt-7"
      >
        <div className="flex items-end justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
              <Sparkles className="h-4 w-4" />Manajemen sales
            </p>
            <h1 className="mt-3 text-3xl font-extrabold">Tim Sales</h1>
            <p className="mt-2 text-sm text-surface-500">
              Kelola anggota sales yang muncul saat checkout dan pantau kontribusi transaksi mereka.
            </p>
          </div>
          {addOpen ? (
            <span className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white">
              <Plus className="h-4 w-4" />Tambah Sales
            </span>
          ) : (
            <GuideTarget
              ctx={ctx}
              target="salespersons-add"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-bold text-white"
            >
              <Plus className="h-4 w-4" />Tambah Sales
            </GuideTarget>
          )}
        </div>

        <GuideTarget ctx={ctx} target="salespersons-summary" className="mt-6 grid grid-cols-4 gap-3">
          <PreviewMetric label="Total Sales" value="12" icon={Users} tone="blue" />
          <PreviewMetric label="Aktif" value="10" icon={CheckCircle2} tone="emerald" />
          <PreviewMetric label="Transaksi" value="284" icon={Activity} tone="amber" />
          <PreviewMetric label="Top Performer" value="Rina" icon={UserRound} tone="violet" />
        </GuideTarget>

        <div className="mt-5 flex items-center justify-between rounded-xl border bg-white p-3 shadow-sm">
          <div className="flex w-2/3 items-center gap-3 rounded-lg border bg-surface-50 px-4 py-3 text-sm text-surface-500">
            <Search className="h-4 w-4" />Cari nama sales...
          </div>
          <div className="flex rounded-lg bg-surface-100 p-1 text-xs font-bold">
            <span className="rounded-md bg-white px-4 py-2 shadow">Semua</span>
            <span className="px-4 py-2">Aktif</span>
            <span className="px-4 py-2">Nonaktif</span>
          </div>
        </div>

        <GuideTarget
          ctx={ctx}
          target="salespersons-list"
          className="mt-5 overflow-hidden rounded-xl border bg-white shadow-sm"
        >
          <div className="grid grid-cols-[1.3fr_0.8fr_1fr_160px] bg-surface-50 px-5 py-4 text-xs font-bold">
            <span>Sales</span><span>Status</span><span>Kontribusi Transaksi</span><span>Aksi</span>
          </div>
          {[
            ["Rina", "Aktif", "96 transaksi"],
            ["Anton", "Nonaktif", "54 transaksi"],
            ["Maya", "Aktif", "48 transaksi"],
          ].map((row, index) => (
            <div
              key={row[0]}
              className="grid grid-cols-[1.3fr_0.8fr_1fr_160px] items-center border-t px-5 py-4 text-sm"
            >
              <strong>{row[0]}</strong>
              {index === 0 ? (
                <GuideTarget
                  ctx={ctx}
                  target="salespersons-toggle"
                  className="w-fit rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700"
                >
                  {row[1]}
                </GuideTarget>
              ) : <span>{row[1]}</span>}
              <span>{row[2]}</span>
              {index === 0 ? (
                detailOpen ? (
                  <span className="font-bold text-brand-700">Detail Sales</span>
                ) : (
                  <GuideTarget ctx={ctx} target="salespersons-detail" className="font-bold text-brand-700">
                    Detail Sales
                  </GuideTarget>
                )
              ) : <span>Ubah</span>}
            </div>
          ))}
        </GuideTarget>

        {detailOpen ? (
          <GuideTarget
            ctx={ctx}
            target="salespersons-detail"
            className="mt-4 rounded-xl border border-brand-100 bg-brand-50/50 p-5"
          >
            <h2 className="text-lg font-black">Detail Sales · Rina</h2>
            <p className="mt-1 text-sm text-surface-500">
              Transaksi pelanggan yang ditangani oleh sales ini.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                "INV-20260710-002 · Rp1.250.000",
                "INV-20260709-018 · Rp840.000",
                "INV-20260709-011 · Rp420.000",
              ].map((row) => <p key={row} className="rounded-xl bg-white p-3 text-xs font-bold">{row}</p>)}
            </div>
          </GuideTarget>
        ) : null}
      </GuideTarget>

      {addOpen ? (
        <PreviewModal ctx={ctx} target="salespersons-add" title="Tambah Sales">
          <div className="space-y-4">
            <PreviewField label="Nama Lengkap" value="Rina Putri" />
            <PreviewField label="Status" value="Aktif" />
          </div>
        </PreviewModal>
      ) : null}
    </PreviewPageRoot>
  );
}

