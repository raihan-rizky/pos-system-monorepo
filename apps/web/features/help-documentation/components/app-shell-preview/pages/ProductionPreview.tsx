import React from "react";
import {
  Activity,
  AlertTriangle,
  Clock,
  Kanban,
  MessageCircle,
  PackageCheck,
  RefreshCw,
  Search,
} from "lucide-react";

import { GuideTarget, cx } from "../GuideTarget";
import { PreviewMetric, PreviewModal, PreviewPageRoot } from "../PreviewPrimitives";
import type { PreviewContext } from "../types";

const columns = ["Antrean", "Sedang Diproses", "Siap Pickup", "Selesai"];

export function ProductionPreview(ctx: PreviewContext) {
  const confirm = ctx.state === "production-whatsapp-confirm";

  return (
    <PreviewPageRoot ctx={ctx} className="bg-surface-50">
      <GuideTarget
        ctx={ctx}
        target="production-primary"
        className="min-h-[980px] px-8 pb-16 pt-5"
      >
        <div className="flex items-end justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-extrabold">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-white">
                <Kanban className="h-5 w-5" />
              </span>
              Papan Produksi
            </h1>
            <p className="mt-1 text-sm text-surface-500">
              Pantau job order dari struk sampai diserahkan.
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs font-bold">
            <RefreshCw className="h-4 w-4" />Muat ulang
          </span>
        </div>

        <div className="mt-5 flex w-fit gap-2 rounded-xl border bg-white p-1">
          <span className="inline-flex items-center gap-2 rounded-lg bg-brand-50 px-4 py-2 text-sm font-bold text-brand-700">
            <Kanban className="h-4 w-4" />Papan
          </span>
          <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-bold text-surface-500">
            <Activity className="h-4 w-4" />Aktivitas Produksi
          </span>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-4">
          <PreviewMetric label="Job Aktif" value="18" tone="blue" icon={Kanban} />
          <PreviewMetric label="Sedang Diproses" value="7" tone="violet" icon={Clock} />
          <PreviewMetric label="Siap" value="5" tone="emerald" icon={PackageCheck} />
          <PreviewMetric label="Terlambat" value="2" tone="red" icon={AlertTriangle} />
        </div>

        <div className="mt-5 flex gap-3 rounded-2xl border bg-white p-4">
          <div className="flex flex-1 items-center gap-3 rounded-xl border bg-surface-50 px-4 py-3 text-sm text-surface-500">
            <Search className="h-4 w-4" />Cari invoice, pelanggan, atau produk...
          </div>
          {["Semua", "Sedang Diproses", "Siap", "Terlambat"].map((item, index) => (
            <span
              key={item}
              className={cx(
                "rounded-xl px-4 py-3 text-xs font-bold",
                index === 0 ? "bg-slate-900 text-white" : "bg-surface-100 text-surface-600",
              )}
            >
              {item}
            </span>
          ))}
        </div>

        <GuideTarget ctx={ctx} target="production-kanban" className="mt-5 grid grid-cols-4 gap-4">
          <GuideTarget ctx={ctx} target="production-status-column" className="contents">
            {columns.map((column, index) => (
              <section
                key={column}
                className="min-h-[470px] rounded-2xl border border-surface-200 bg-surface-100/60 p-3"
              >
                <div className="flex justify-between px-1">
                  <h2 className="text-sm font-black">{column}</h2>
                  <span className="rounded-full bg-white px-2 text-xs font-bold">{4 - index}</span>
                </div>
                {index < 3 ? (
                  index === 0 ? (
                    <GuideTarget
                      ctx={ctx}
                      target="production-card"
                      className="mt-3 rounded-xl border border-white bg-white p-4 shadow-sm"
                    >
                      <OrderCard index={index} />
                    </GuideTarget>
                  ) : (
                    <article className="mt-3 rounded-xl border border-white bg-white p-4 shadow-sm">
                      <OrderCard index={index} />
                      {index === 2 ? (
                        confirm ? (
                          <span className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">
                            <MessageCircle className="h-4 w-4" />Kirim WhatsApp
                          </span>
                        ) : (
                          <GuideTarget
                            ctx={ctx}
                            target="production-whatsapp"
                            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
                          >
                            <MessageCircle className="h-4 w-4" />Kirim WhatsApp
                          </GuideTarget>
                        )
                      ) : null}
                    </article>
                  )
                ) : null}
              </section>
            ))}
          </GuideTarget>
        </GuideTarget>
      </GuideTarget>

      {confirm ? (
        <PreviewModal ctx={ctx} target="production-whatsapp" title="Konfirmasi WhatsApp Pickup">
          <p className="text-sm">
            Kirim notifikasi bahwa pesanan INV-20260710-006 sudah siap diambil?
          </p>
          <div className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
            Halo Toko Maju, pesanan Anda sudah siap pickup.
          </div>
        </PreviewModal>
      ) : null}
    </PreviewPageRoot>
  );
}

function OrderCard({ index }: { index: number }) {
  return (
    <>
      <p className="text-xs font-bold text-brand-700">INV-20260710-00{index + 4}</p>
      <h3 className="mt-2 text-sm font-black">Toko Maju</h3>
      <p className="mt-1 text-xs text-surface-500">Spanduk 3×1 m · 2 item</p>
      <p className="mt-3 text-xs font-bold text-amber-700">Estimasi 15:00</p>
    </>
  );
}

