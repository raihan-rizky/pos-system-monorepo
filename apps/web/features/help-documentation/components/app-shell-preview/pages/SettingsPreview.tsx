import React from "react";
import { Bell, MessageCircle, RefreshCw, Save, Settings, ShieldCheck, Store } from "lucide-react";

import { GuideTarget, cx } from "../GuideTarget";
import {
  PreviewButton,
  PreviewField,
  PreviewHeader,
  PreviewPageRoot,
} from "../PreviewPrimitives";
import type { PreviewContext } from "../types";
import { DEFAULT_PRICE_ROUNDING_SETTINGS, roundSellingPrice } from "@/features/product-price-rounding/rounding";

const tabs = [
  ["store", "Info Toko", Store, "settings-info-store"],
  ["whatsapp", "WhatsApp", MessageCircle, "settings-whatsapp-tab"],
  ["rbac", "RBAC", ShieldCheck, "settings-rbac-tab"],
  ["notifications", "Notifikasi", Bell, null],
  ["offline", "Offline Sync", RefreshCw, null],
] as const;

export function SettingsPreview(ctx: PreviewContext) {
  const activeTab = ctx.state === "settings-price-rounding" ? "price-rounding" : ctx.state === "settings-whatsapp" ? "whatsapp" : ctx.state === "settings-rbac" ? "rbac" : "store";

  return (
    <PreviewPageRoot ctx={ctx} className="bg-surface-50">
      <div className="px-8 pb-20 pt-6">
        <PreviewHeader
          title="Pengaturan"
          subtitle="Kelola profil toko dan integrasi yang dipakai."
          icon={Settings}
        />

        <div className="mt-8 flex gap-6">
          <GuideTarget ctx={ctx} target="settings-sidebar" className="flex w-48 shrink-0 flex-col gap-1">
            {tabs.map(([id, label, Icon, target]) => {
              const tab = (
                <div className={cx(
                  "flex min-h-11 items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-semibold",
                  activeTab === id ? "border border-surface-200 bg-white text-brand-600 shadow" : "text-surface-600",
                )}>
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{label}</span>
                </div>
              );
              return target ? (
                <GuideTarget key={id} ctx={ctx} target={target}>{tab}</GuideTarget>
              ) : <div key={id}>{tab}</div>;
            })}
            <GuideTarget ctx={ctx} target="settings-rounding-tab">
              <div className={cx("flex min-h-11 items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-semibold", activeTab === "price-rounding" ? "border border-surface-200 bg-white text-brand-600 shadow" : "text-surface-600")}>
                <Settings className="h-4 w-4" aria-hidden="true" />
                <span>Pembulatan Harga</span>
              </div>
            </GuideTarget>
          </GuideTarget>

          <GuideTarget ctx={ctx} target="settings-primary" className="min-h-[560px] flex-1 rounded-2xl border border-surface-100 bg-white p-6 shadow-sm">
            {activeTab === "store" ? <StorePanel ctx={ctx} /> : null}
            {activeTab === "whatsapp" ? <WhatsAppPanel /> : null}
            {activeTab === "rbac" ? <RbacPanel ctx={ctx} /> : null}
            {activeTab === "price-rounding" ? <PriceRoundingPanel ctx={ctx} /> : null}
          </GuideTarget>
        </div>
      </div>
    </PreviewPageRoot>
  );
}

function PriceRoundingPanel({ ctx }: { ctx: PreviewContext }) {
  const settings = DEFAULT_PRICE_ROUNDING_SETTINGS;
  const money = (price: number) => `Rp${price.toLocaleString("id-ID")}`;
  return (
    <section data-help-step-state="settings-price-rounding-active" aria-label="Ilustrasi pengaturan pembulatan harga" className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-surface-900">Pembulatan Harga</h2>
        <p className="mt-1 text-sm text-surface-500">Ilustrasi pengaturan awal untuk hasil akhir harga jual produk.</p>
      </div>
      <GuideTarget ctx={ctx} target="settings-rounding-rule" className="space-y-4 rounded-xl p-3">
        <label className="flex items-center gap-3 text-sm font-semibold text-surface-900">
          <input type="checkbox" role="switch" checked={settings.enabled} aria-checked={settings.enabled} disabled className="h-5 w-5 accent-brand-600" />
          Aktifkan pembulatan harga jual
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <PreviewField label="Kelipatan (Rp)" value={String(settings.increment)} />
          <PreviewField label="Ambang naik (Rp)" value={String(settings.threshold)} />
        </div>
        <p className="text-sm text-surface-500">Sisa harga di bawah ambang turun; mulai ambang naik ke kelipatan berikutnya.</p>
        <h3 className="text-sm font-bold text-surface-900">Pratinjau langsung</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {[4049, 4050].map((price) => {
            const result = roundSellingPrice(price, settings);
            return (
              <div key={price} className="rounded-xl border border-surface-200 bg-surface-50 p-3 text-sm">
                <p className="font-semibold text-brand-700">{result.direction === "UP" ? "Dibulatkan ke atas" : "Dibulatkan ke bawah"}</p>
                <dl className="mt-2 space-y-1 text-surface-700">
                  <div className="flex justify-between gap-2"><dt>Harga asal</dt><dd>{money(result.originalPrice)}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Harga final</dt><dd className="font-bold">{money(result.roundedPrice)}</dd></div>
                  <div className="flex justify-between gap-2"><dt>Selisih</dt><dd>{result.difference > 0 ? "+" : "−"}{money(Math.abs(result.difference))}</dd></div>
                </dl>
              </div>
            );
          })}
        </div>
      </GuideTarget>
      <PreviewButton ctx={ctx} target="settings-rounding-save" tone="brand" icon={Save}>Simpan pengaturan</PreviewButton>
    </section>
  );
}

function StorePanel({ ctx }: { ctx: PreviewContext }) {
  return (
    <div>
      <div className="border-b border-surface-100 pb-4">
        <h2 className="text-lg font-bold text-surface-900">Informasi Toko</h2>
        <p className="mt-1 text-xs text-surface-500">Informasi ini dipakai pada struk dan laporan.</p>
      </div>
      <div className="mt-5 grid max-w-3xl gap-4 sm:grid-cols-2">
        <PreviewField label="Nama Toko" value="Toko Teladan" />
        <PreviewField label="Nomor Telepon" value="0812 3456 7890" />
        <div className="sm:col-span-2"><PreviewField label="Alamat" value="Jl. Contoh No. 12, Jakarta" /></div>
      </div>
      <div className="mt-5 flex justify-end">
        <PreviewButton ctx={ctx} target="settings-save" tone="brand" icon={Save}>Simpan Perubahan</PreviewButton>
      </div>
    </div>
  );
}

function WhatsAppPanel() {
  return (
    <div>
      <h2 className="text-lg font-bold text-surface-900">Integrasi WhatsApp</h2>
      <p className="mt-1 text-sm text-surface-500">Hubungkan akun WhatsApp untuk mengaktifkan notifikasi otomatis.</p>
      <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Status Session</p>
        <p className="mt-2 text-lg font-black text-emerald-900">Terhubung</p>
        <p className="mt-1 text-sm text-emerald-700">Pengguna WhatsApp · +62 812-3456-7890</p>
      </div>
    </div>
  );
}

function RbacPanel({ ctx }: { ctx: PreviewContext }) {
  return (
    <div data-help-step-state="settings-rbac-active" className="space-y-4">
      <div className="flex items-start justify-between border-b border-surface-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-surface-900">Permission RBAC</h2>
          <p className="text-xs text-surface-500">Akses Owner selalu penuh dan tidak bisa diedit.</p>
        </div>
        <PreviewButton ctx={ctx} target="settings-save" tone="brand" icon={Save}>Review & Simpan</PreviewButton>
      </div>

      <GuideTarget ctx={ctx} target="settings-rbac-summary" className="grid grid-cols-4 gap-3">
        {["Admin", "Kasir", "Sales", "Inventaris"].map((role, index) => (
          <article key={role} className={cx("rounded-xl border p-4", index === 3 ? "border-brand-200 bg-brand-50" : "border-surface-100 bg-white")}>
            <p className="text-sm font-bold">{role}</p>
            <p className="mt-2 text-xs text-surface-500">{6 + index * 2} halaman · {10 + index * 3} aksi</p>
          </article>
        ))}
      </GuideTarget>

      <GuideTarget ctx={ctx} target="settings-rbac-matrix" className="overflow-hidden rounded-xl border border-surface-200">
        <div className="bg-surface-50 px-4 py-3 text-sm font-bold">Matrix Modul</div>
        <div className="grid grid-cols-4 border-t border-surface-100 px-4 py-3 text-xs font-bold text-surface-500"><span>Modul</span><span>Admin</span><span>Kasir</span><span>Inventaris</span></div>
        {["Riwayat", "Kasir POS", "Inventaris"].map((name) => (
          <div key={name} className="grid grid-cols-4 border-t border-surface-100 px-4 py-3 text-xs"><strong>{name}</strong><span>Kelola</span><span>Lihat</span><span>Update stok</span></div>
        ))}
      </GuideTarget>

      <div className="rounded-xl border border-surface-200 p-4">
        <p className="mb-3 text-sm font-bold">Izin Aksi Modul Inventaris</p>
        <GuideTarget ctx={ctx} target="settings-permission-checkbox" className="flex items-center gap-3 text-sm">
          <span className="flex h-5 w-5 items-center justify-center rounded border border-brand-500 bg-brand-500 text-white">✓</span>
          Penerimaan Barang (create)
        </GuideTarget>
      </div>

      <GuideTarget ctx={ctx} target="settings-review-save" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Review perubahan</strong><p className="mt-1">Kasir: izin Hapus Transaksi dinonaktifkan.</p>
      </GuideTarget>
    </div>
  );
}

