"use client";

import React from "react";
import {
  BarChart3,
  Bell,
  Bot,
  BriefcaseBusiness,
  Calculator,
  CalendarDays,
  Check,
  ChevronLeft,
  CircleDollarSign,
  Grid2X2,
  HelpCircle,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Package,
  PanelsTopLeft,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Store,
  Tags,
  Truck,
  User,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  HELP_VISUAL_PAGE_CONFIG,
  getHelpVisualTargetLabel,
  isKnownHelpVisualTarget as isKnownTarget,
  type HelpStepVisual,
  type HelpVisualPageConfig,
} from "./help-visual-registry";

type VisualGuideMockupProps = {
  visual: HelpStepVisual;
  stepNumber: number;
  stepTitle: string;
};

type VisualTemplateContext = {
  page: HelpStepVisual["page"];
  config: HelpVisualPageConfig;
  activeTarget: string;
  stepNumber: number;
};

type GuideTargetProps = {
  ctx: VisualTemplateContext;
  target: string;
  className?: string;
  children: React.ReactNode;
};

type PageShellProps = {
  ctx: VisualTemplateContext;
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const iconClassName = "h-4 w-4";

const PREVIEW_NAV_GROUPS: Array<{
  title: string;
  items: Array<{
    id: string;
    label: string;
    icon: LucideIcon;
    badge?: string;
  }>;
}> = [
  {
    title: "Operasi",
    items: [
      { id: "dashboard", label: "Dashboard", icon: Grid2X2 },
      { id: "pos", label: "Kasir", icon: Calculator },
      { id: "history", label: "Riwayat", icon: WalletCards, badge: "3" },
    ],
  },
  {
    title: "Katalog",
    items: [
      { id: "products", label: "Produk", icon: Package },
      { id: "suppliers", label: "Supplier", icon: Truck },
      { id: "production", label: "Produksi", icon: PanelsTopLeft },
    ],
  },
  {
    title: "Manajemen Inventaris",
    items: [{ id: "inventory", label: "Inventaris", icon: Package }],
  },
  {
    title: "Keuangan",
    items: [
      { id: "finance", label: "Keuangan", icon: CircleDollarSign },
      { id: "financial-report", label: "Laporan Keuangan", icon: BarChart3 },
    ],
  },
  {
    title: "Pelanggan",
    items: [
      { id: "customers", label: "Pelanggan", icon: Users, badge: "2" },
      { id: "salespersons", label: "Sales", icon: Tags },
    ],
  },
  {
    title: "Lainnya",
    items: [
      { id: "wa", label: "WA Chat", icon: MessageCircle },
      { id: "shift", label: "Shift Kasir", icon: BriefcaseBusiness },
      { id: "settings", label: "Pengaturan", icon: Settings },
      { id: "help", label: "Bantuan", icon: HelpCircle },
    ],
  },
];

const PAGE_NAV_ID: Record<HelpStepVisual["page"], string> = {
  settings: "settings",
  history: "history",
  pos: "pos",
  products: "products",
  inventory: "inventory",
  suppliers: "suppliers",
  customers: "customers",
  finance: "finance",
  shift: "shift",
  production: "production",
  salespersons: "salespersons",
  assistant: "assistant",
};

const PAGE_HEADER_ICON: Record<HelpStepVisual["page"], LucideIcon> = {
  settings: Settings,
  history: WalletCards,
  pos: ShoppingCart,
  products: Package,
  inventory: Package,
  suppliers: Truck,
  customers: Users,
  finance: CircleDollarSign,
  shift: BriefcaseBusiness,
  production: PanelsTopLeft,
  salespersons: Tags,
  assistant: Bot,
};

export function isKnownHelpVisualTarget(visual: Pick<HelpStepVisual, "page" | "target">) {
  return isKnownTarget(visual);
}

function GuideTarget({ ctx, target, className, children }: GuideTargetProps) {
  const active = ctx.activeTarget === target;
  const activeLabel = active ? getHelpVisualTargetLabel({ page: ctx.page, target }) : "";

  return (
    <div
      data-help-target={target}
      data-help-target-active={active ? "true" : undefined}
      data-help-animation={active ? "active-target" : undefined}
      data-help-glow={active ? "step-target" : undefined}
      data-help-glow-animation={active ? "pulse" : undefined}
      className={cx(
        "relative transition-all duration-300 ease-out",
        className,
        active && "z-10 ring-2 ring-brand-500 ring-offset-2 ring-offset-white shadow-glow help-step-glow-animated",
      )}
    >
      {active ? (
        <div
          data-help-overlay-target={target}
          data-help-overlay-animation="target-callout"
          data-help-overlay-glow="step-callout"
          data-help-overlay-glow-animation="pulse"
          className="pointer-events-none absolute -right-2 -top-3 z-30 flex items-center gap-1.5 transition-all duration-300 ease-out motion-safe:animate-pulse"
        >
          <span
            data-help-callout-number={ctx.stepNumber}
            data-help-callout-glow="step-number"
            data-help-callout-glow-animation="pulse"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white shadow-glow help-step-callout-glow-animated transition-all duration-300 ease-out"
          >
            {ctx.stepNumber}
          </span>
          <span className="h-px w-6 bg-brand-600" aria-hidden="true" />
          <span className="whitespace-nowrap rounded-full bg-brand-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-glow help-step-callout-glow-animated transition-all duration-300 ease-out">
            {activeLabel}
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}

function PageShell({ ctx, title, subtitle, children }: PageShellProps) {
  const HeaderIcon = PAGE_HEADER_ICON[ctx.page];

  return (
    <div
      data-help-actual-page={ctx.page}
      data-help-page-viewport="clipped"
      className="flex h-full min-w-0 flex-col overflow-hidden bg-surface-50"
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight text-surface-900">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-sm">
                <HeaderIcon className="h-5 w-5" aria-hidden="true" />
              </span>
              {title}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-surface-500">{subtitle}</p>
          </div>
          <span className="rounded-full border border-surface-200 bg-white px-3 py-1.5 text-xs font-semibold text-surface-500 shadow-sm">
            Read-only
          </span>
        </div>

        {children}
      </div>
    </div>
  );
}

function GuidePreviewSidebar({ activeNavId }: { activeNavId: string }) {
  return (
    <aside
      data-help-preview-sidebar="true"
      className="flex h-full w-[260px] shrink-0 flex-col bg-surface-900 border-r border-surface-800 py-5 px-3 text-white"
    >
      <div className="mb-6 flex items-center gap-3 px-2.5 shrink-0">
        <img
          src="/images/icon.png"
          alt="Logo"
          className="w-8 h-8 object-contain drop-shadow-md shrink-0"
        />
        <div className="flex flex-col leading-none overflow-hidden">
          <span className="text-sm font-extrabold tracking-wider text-white">
            Toko Teladan
          </span>
          <span className="text-[10px] text-surface-400 font-semibold mt-0.5 whitespace-nowrap">
            Smart Cashier
          </span>
          <span className="text-[11px] text-brand-300 font-bold mt-2 whitespace-nowrap">
            Welcome Owner!
          </span>
        </div>
      </div>

      <nav className="min-h-0 flex-1 space-y-4 overflow-hidden">
        {PREVIEW_NAV_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-wide text-surface-500">{group.title}</p>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = item.id === activeNavId;

                return (
                  <div
                    key={item.id}
                    data-help-preview-nav-active={active ? item.id : undefined}
                    className={cx(
                      "flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold transition-colors",
                      active ? "bg-brand-600 text-white shadow-glow" : "text-surface-400",
                    )}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.badge ? (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-white">
                        {item.badge}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto pt-4 border-t border-surface-850 flex flex-col gap-3">
        <div className="flex items-center gap-3 px-3.5 py-3 text-surface-400">
          <ChevronLeft className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span className="text-sm font-semibold">Sembunyikan</span>
        </div>
        <div className="flex items-center gap-3 px-3.5 py-3 text-surface-400">
          <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          <span className="text-sm font-semibold">Keluar</span>
        </div>
      </div>
    </aside>
  );
}

function GuidePreviewAssistantButton({ active }: { active: boolean }) {
  return (
    <div
      data-help-preview-assistant-button="true"
      data-help-preview-nav-active={active ? "assistant" : undefined}
      className={cx(
        "absolute bottom-5 right-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-2xl",
        active && "ring-4 ring-brand-200",
      )}
    >
      <Bot className="h-7 w-7" aria-hidden="true" />
    </div>
  );
}

function GuideAppShellPreview({
  page,
  children,
}: {
  page: HelpStepVisual["page"];
  children: React.ReactNode;
}) {
  const activeNavId = PAGE_NAV_ID[page];

  return (
    <div
      data-help-animation="page-preview"
      data-help-appshell-overflow-guard="true"
      className="max-w-full overflow-hidden rounded-xl border border-surface-200 bg-surface-950 shadow-sm transition-all duration-500 ease-out"
    >
      <div className="flex items-center justify-between border-b border-surface-800 px-3 py-2 text-white">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-surface-400">Desktop preview</p>
          <p className="text-xs font-bold">1366 x 768 app shell</p>
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-red-300" />
          <span className="h-2 w-2 rounded-full bg-yellow-300" />
          <span className="h-2 w-2 rounded-full bg-green-300" />
        </div>
      </div>
      <div
        className="relative aspect-[1366/768] w-full max-w-full overflow-hidden bg-surface-900"
        style={{ contain: "layout paint", containerType: "inline-size" }}
      >
        <div
          data-help-preview-canvas="1366x768"
          className="absolute left-0 top-0 flex h-[768px] w-[1366px] origin-top-left bg-surface-50 transition-transform duration-500 ease-out will-change-transform"
          style={{
            width: 1366,
            height: 768,
            transform: "scale(calc(100cqw / 1366))",
          }}
        >
          <GuidePreviewSidebar activeNavId={activeNavId} />
          <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden pb-0">
            {children}
            <GuidePreviewAssistantButton active={page === "assistant"} />
          </main>
        </div>
      </div>
    </div>
  );
}

function TargetButton({
  ctx,
  target,
  children,
  className,
}: {
  ctx: VisualTemplateContext;
  target: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <GuideTarget
      ctx={ctx}
      target={target}
      className={cx(
        "flex items-center justify-center rounded-md border border-surface-200 bg-white px-3 py-2 text-[11px] font-bold text-surface-700",
        className,
      )}
    >
      {children}
    </GuideTarget>
  );
}

function TargetTab({
  ctx,
  target,
  children,
  selected = false,
}: {
  ctx: VisualTemplateContext;
  target: string;
  children: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <GuideTarget
      ctx={ctx}
      target={target}
      className={cx(
        "rounded-md px-3 py-2 text-center text-[11px] font-bold",
        selected ? "bg-brand-600 text-white" : "border border-surface-200 bg-white text-surface-600",
      )}
    >
      {children}
    </GuideTarget>
  );
}

function TargetCard({
  ctx,
  target,
  title,
  value,
  tone = "default",
}: {
  ctx: VisualTemplateContext;
  target: string;
  title: string;
  value: string;
  tone?: "default" | "brand" | "success" | "warning";
}) {
  const toneClass = {
    default: "border-surface-200 bg-white text-surface-700",
    brand: "border-brand-100 bg-brand-50 text-brand-900",
    success: "border-emerald-100 bg-emerald-50 text-emerald-900",
    warning: "border-amber-100 bg-amber-50 text-amber-900",
  }[tone];

  return (
    <GuideTarget ctx={ctx} target={target} className={cx("rounded-md border p-3", toneClass)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{title}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </GuideTarget>
  );
}

function isOneOf(value: string, options: string[]) {
  return options.includes(value);
}

function SettingsTemplate(ctx: VisualTemplateContext) {
  const rbacActive = isOneOf(ctx.activeTarget, [
    "settings-rbac-tab",
    "settings-rbac-summary",
    "settings-rbac-matrix",
    "settings-permission-checkbox",
    "settings-review-save",
    "settings-save",
  ]);

  return (
    <div
      data-help-actual-page="settings"
      data-help-page-viewport="clipped"
      className="flex h-full min-w-0 flex-col overflow-hidden bg-surface-50"
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="max-w-[1600px] px-4 md:px-8 pt-6 pb-20">
          <div className="mb-8">
            <h1 className="text-2xl font-extrabold text-surface-900 tracking-tight flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-sm">
                <Settings className="w-5 h-5 text-white" aria-hidden="true" />
              </div>
              Pengaturan
            </h1>
            <p className="text-sm text-surface-500 mt-1">Kelola profil toko dan integrasi yang dipakai.</p>
          </div>

      <div className="flex flex-col sm:flex-row gap-6">
        {/* Left Tab Pills Sidebar */}
        <GuideTarget
          ctx={ctx}
          target="settings-sidebar"
          className="flex sm:flex-col gap-1 sm:w-48 shrink-0 overflow-x-auto"
        >
          {[
            { id: "store", label: "Info Toko", icon: Store },
            { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
            { id: "rbac", label: "RBAC", icon: ShieldCheck },
            { id: "notifications", label: "Notifikasi", icon: Bell },
            { id: "offline", label: "Offline Sync", icon: RefreshCw },
          ].map((tab) => {
            const Icon = tab.icon;
            const isSelected = tab.id === "rbac";
            
            // We want to map target highlights to the corresponding tab elements!
            // settings-info-store should highlight the Info Toko tab.
            // settings-rbac-tab should highlight the RBAC tab.
            // settings-whatsapp-tab should highlight the WhatsApp tab.
            let targetKey: string | undefined = undefined;
            if (tab.id === "store") targetKey = "settings-info-store";
            if (tab.id === "rbac") targetKey = "settings-rbac-tab";
            if (tab.id === "whatsapp") targetKey = "settings-whatsapp-tab";

            const itemContent = (
              <div
                className={cx(
                  "flex items-center gap-2.5 px-6 sm:px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-all duration-150 cursor-pointer w-full text-left",
                  isSelected
                    ? "bg-white shadow border border-surface-200 text-brand-600"
                    : "text-surface-600 hover:bg-white/60 hover:text-surface-900"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <h1 className="sm:block hidden">{tab.label}</h1>
              </div>
            );

            if (targetKey) {
              return (
                <GuideTarget key={tab.id} ctx={ctx} target={targetKey} className="w-full">
                  {itemContent}
                </GuideTarget>
              );
            }

            return <div key={tab.id} className="w-full">{itemContent}</div>;
          })}
        </GuideTarget>

        {/* Right Content Panel */}
        <GuideTarget
          ctx={ctx}
          target="settings-primary"
          className="flex-1 bg-white border border-surface-100 rounded-2xl shadow-sm p-6 space-y-4"
        >
          <div data-help-step-state={rbacActive ? "settings-rbac-active" : undefined} />
          
          {/* Header of RbacTab */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between border-b border-surface-100 pb-3">
            <div>
              <h4 className="text-sm font-bold text-surface-900">Permission RBAC</h4>
              <p className="text-[10px] text-surface-500 mt-0.5">
                Akses Owner selalu penuh dan tidak bisa diedit.
              </p>
            </div>
            <TargetButton ctx={ctx} target="settings-save" className="bg-brand-600 text-white !py-1 px-3 text-[10px]">
              Review & Simpan
            </TargetButton>
          </div>

          {/* Ringkasan Role Cards */}
          <GuideTarget
            ctx={ctx}
            target="settings-rbac-summary"
            className="grid gap-2.5 grid-cols-2 xl:grid-cols-4"
          >
            {[
              { role: "Admin", pages: 12, actions: 24, warning: false },
              { role: "Kasir", pages: 6, actions: 10, warning: false },
              { role: "Sales", pages: 4, actions: 8, warning: false },
              { role: "Inventaris", pages: 8, actions: 15, warning: true },
            ].map((item) => (
              <div
                key={item.role}
                className={cx(
                  "relative rounded-xl border p-3 text-left transition-all",
                  item.role === "Inventaris"
                    ? "border-brand-200 bg-brand-50"
                    : "border-surface-100 bg-white"
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold text-surface-900">{item.role}</span>
                  <span className={cx("h-1.5 w-1.5 rounded-full", item.warning ? "bg-amber-500" : "bg-emerald-500")} />
                </div>
                <div className="mt-2 space-y-1 text-[9px] text-surface-500">
                  <p>{item.pages} Halaman</p>
                  <p>{item.actions} Aksi</p>
                </div>
              </div>
            ))}
          </GuideTarget>

          {/* Collapsible Matrix Modul Panel */}
          <GuideTarget
            ctx={ctx}
            target="settings-rbac-matrix"
            className="rounded-xl border border-surface-100 bg-white overflow-hidden shadow-xs"
          >
            <div className="flex items-center justify-between px-4 py-2.5 bg-surface-50 border-b border-surface-100">
              <span className="text-xs font-bold text-surface-900">Matrix Modul</span>
              <span className="text-[9px] rounded-full bg-surface-100 px-2 py-0.5 font-bold text-surface-600">
                3 Modul
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-surface-100 text-[10px]">
                <thead>
                  <tr className="bg-surface-50/50">
                    <th className="px-3 py-2 text-left font-bold text-surface-500">Modul</th>
                    <th className="px-3 py-2 text-left font-bold text-surface-500">Admin</th>
                    <th className="px-3 py-2 text-left font-bold text-surface-500">Kasir</th>
                    <th className="px-3 py-2 text-left font-bold text-surface-500">Gudang</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {[
                    ["Riwayat", "view, approve", "view", "-"],
                    ["Kasir POS", "full", "checkout", "-"],
                    ["Inventaris", "full", "-", "update stok"],
                  ].map(([module, admin, cashier, warehouse]) => (
                    <tr key={module} className="hover:bg-surface-50/50">
                      <td className="px-3 py-2 font-semibold text-surface-900">{module}</td>
                      <td className="px-3 py-2 text-surface-600">{admin}</td>
                      <td className="px-3 py-2 text-surface-600">{cashier}</td>
                      <td className="px-3 py-2 text-surface-600">{warehouse}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GuideTarget>

          {/* Module Permission Editor Preview */}
          <div className="rounded-xl border border-surface-100 bg-white p-3.5 space-y-3">
            <div className="flex items-center gap-1.5 border-b border-surface-100 pb-2">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span className="text-xs font-bold text-surface-900">Inventaris</span>
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[8px] font-bold text-amber-700">
                Sensitif
              </span>
            </div>
            
            <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
              {/* Selector List */}
              <div className="space-y-1 border-r border-surface-100 pr-3">
                {["Dashboard", "Kasir POS", "Inventaris", "Keuangan"].map((mod) => (
                  <div
                    key={mod}
                    className={cx(
                      "rounded-lg px-2 py-1 text-[10px] font-semibold",
                      mod === "Inventaris" ? "bg-brand-50 text-brand-700 font-bold" : "text-surface-600"
                    )}
                  >
                    {mod}
                  </div>
                ))}
              </div>

              {/* Permission Checkboxes */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-surface-500">Izin Aksi Modul</p>
                {[
                  ["Ubah Stok", "update", true],
                  ["Penerimaan Barang", "create", false],
                  ["Hapus Barang Rusak", "delete", false],
                ].map(([label, action, active]) => (
                  <GuideTarget
                    key={label as string}
                    ctx={ctx}
                    target={label === "Penerimaan Barang" ? "settings-permission-checkbox" : "dummy-checkbox"}
                    className="flex items-center gap-2 text-[10px] text-surface-700"
                  >
                    <span className={cx("h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0", active ? "border-brand-500 bg-brand-500 text-white" : "border-surface-300 bg-white")} />
                    <span>{label} ({action})</span>
                  </GuideTarget>
                ))}
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <GuideTarget ctx={ctx} target="settings-review-save" className="rounded-xl border border-amber-100 bg-amber-50 p-3 text-[10px] text-amber-900 leading-normal">
              <p className="font-bold flex items-center gap-1.5">
                <span>Review perubahan</span>
              </p>
              <p className="mt-1">Kasir: Izin Hapus Transaksi dinonaktifkan.</p>
            </GuideTarget>
            <div className="flex items-end">
              <TargetButton ctx={ctx} target="settings-save" className="bg-brand-600 text-white w-full h-[40px] text-xs">
                Review & Simpan
              </TargetButton>
            </div>
          </div>
        </GuideTarget>
      </div>
        </div>
      </div>
    </div>
  );
}

function HistoryTemplate(ctx: VisualTemplateContext) {
  const showActionMenu = isOneOf(ctx.activeTarget, [
    "history-action-menu",
    "history-print-button",
    "history-surat-jalan-action",
    "history-invoice-date-action",
    "history-upload-proof",
    "history-debt-payment",
  ]);

  return (
    <div
      data-help-actual-page="history"
      data-help-page-viewport="clipped"
      className="flex h-full min-w-0 flex-col overflow-hidden bg-surface-50"
    >
      <GuideTarget ctx={ctx} target="history-primary" className="flex-1 flex flex-col overflow-hidden relative">
        <div className="relative transition-all duration-300 ease-out max-h-[500px] opacity-100">
          <header className="relative px-4 md:px-8 pt-4 pb-0 bg-white border-b border-surface-100">
            <div className="pb-4 md:pb-6">
              <h1 className="text-xl md:text-2xl font-extrabold text-surface-900">Riwayat Transaksi</h1>
              <p className="text-sm text-surface-500 mt-1">
                Daftar seluruh transaksi dan invoice toko
              </p>
            </div>
          </header>

          <GuideTarget
            ctx={ctx}
            target="history-filter"
            className="md:block px-4 md:px-8 py-4 bg-white border-b border-surface-100 space-y-3"
          >
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-400" aria-hidden="true" />
                <div className="w-full rounded-xl border border-surface-200 bg-surface-50 py-2.5 pl-10 pr-4 text-sm text-surface-500">
                  Cari invoice, pelanggan, nama produk, atau sales...
                </div>
              </div>
              <div className="min-w-[180px] rounded-xl border border-surface-200 bg-surface-50 px-4 py-2.5 text-sm text-surface-600">
                Semua Kategori
              </div>
              <div className="min-w-[160px] rounded-xl border border-surface-200 bg-surface-50 px-4 py-2.5 text-sm text-surface-600">
                Semua Status
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-surface-500">
                  <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                  Filter cepat
                </span>
                <div className="inline-flex rounded-xl border border-surface-200 bg-surface-50 p-1">
                  <span className="min-h-8 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm">
                    Harian
                  </span>
                  <span className="min-h-8 rounded-lg px-3 py-1.5 text-xs font-bold text-surface-600">Mingguan</span>
                  <span className="min-h-8 rounded-lg px-3 py-1.5 text-xs font-bold text-surface-600">Bulanan</span>
                </div>
              </div>
              <span className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-600">Dari 2026-07-09</span>
              <span className="rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm text-surface-600">Sampai 2026-07-09</span>
              <span className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                <span className="h-4 w-4 rounded border border-emerald-300 bg-white" aria-hidden="true" />
                <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                Surat Jalan saja
              </span>
            </div>
          </GuideTarget>

        </div>
        <div className="flex-1 overflow-y-auto px-4 md:px-8 relative">
          <GuideTarget ctx={ctx} target="history-table" className="bg-white rounded-2xl border border-surface-200 overflow-hidden shadow-sm">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-surface-50 border-b border-surface-200">
                    <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">Tanggal</th>
                    <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">No. Invoice</th>
                    <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">Pelanggan</th>
                    <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">Sales</th>
                    <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">Item</th>
                    <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">Total</th>
                    <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">Pembayaran</th>
                    <th className="py-4 px-4 font-semibold text-sm text-surface-600 whitespace-nowrap">Status</th>
                    <th className="py-4 px-4 font-semibold text-sm text-surface-600 text-right whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {[
                    ["09 Jul 2026", "INV-20260709-0012", "Toko Maju", "Dina", "4 item", "Rp1.250.000", "Transfer", "Pending"],
                    ["09 Jul 2026", "INV-20260709-0011", "Bu Sari", "Rafi", "2 item", "Rp320.000", "Tunai", "Lunas"],
                    ["09 Jul 2026", "DRAFT-20260709-0004", "Walk-in", "-", "1 item", "Rp88.000", "Draft", "Draft"],
                  ].map(([date, invoice, customer, sales, itemCount, total, payment, status], index) => (
                    <tr key={invoice} className="hover:bg-surface-50/60 transition-colors">
                      <td className="py-3 px-4 text-sm text-surface-600 whitespace-nowrap">{date}</td>
                      <td className="py-3 px-4 text-sm font-bold text-surface-900 whitespace-nowrap">{invoice}</td>
                      <td className="py-3 px-4 text-sm text-surface-700 whitespace-nowrap">{customer}</td>
                      <td className="py-3 px-4 text-sm text-surface-600 whitespace-nowrap">{sales}</td>
                      <td className="py-3 px-4 text-sm text-surface-600 whitespace-nowrap">{itemCount}</td>
                      <td className="py-3 px-4 text-sm font-bold text-surface-900 whitespace-nowrap">{total}</td>
                      <td className="py-3 px-4 text-sm text-surface-600 whitespace-nowrap">{payment}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={cx("rounded-full px-2.5 py-1 text-xs font-bold", status === "Pending" ? "bg-amber-50 text-amber-700" : status === "Draft" ? "bg-surface-100 text-surface-600" : "bg-emerald-50 text-emerald-700")}>
                          {status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        {index === 0 ? (
                          <div className="relative inline-flex">
                            <GuideTarget ctx={ctx} target="history-action-menu" className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-surface-500 hover:bg-surface-100">
                              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                            </GuideTarget>
                            {showActionMenu ? (
                              <div
                                data-help-step-state="history-action-menu-open"
                                className="absolute right-0 top-9 z-20 w-48 overflow-hidden rounded-xl border border-surface-200 bg-white text-left text-xs font-semibold text-surface-700 shadow-xl"
                              >
                                <p className="border-b border-surface-100 bg-surface-50 px-3 py-2 font-bold text-surface-900">Menu Aksi Transaksi</p>
                                <p className="px-3 py-2">Cetak Invoice</p>
                                <p className="px-3 py-2">Cetak Surat Jalan</p>
                                <p className="px-3 py-2 text-brand-700">Ubah Tanggal Invoice</p>
                                <p className="px-3 py-2">Upload Bukti</p>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <MoreHorizontal className="ml-auto h-4 w-4 text-surface-400" aria-hidden="true" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GuideTarget>
        </div>

        <GuideTarget ctx={ctx} target="history-detail-panel" className="space-y-3 rounded-md border border-surface-200 bg-white p-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-surface-500">Panel Detail</p>
            <p className="text-sm font-bold text-surface-900">INV-20260709-0012</p>
            <p className="text-[11px] text-surface-500">Tempo pembayaran: 14 Juli 2026</p>
          </div>
          <GuideTarget ctx={ctx} target="history-approval-actions" className="grid grid-cols-2 gap-2">
            <div className="rounded-md bg-emerald-600 px-3 py-2 text-center text-[11px] font-bold text-white">Setujui</div>
            <div className="rounded-md bg-red-50 px-3 py-2 text-center text-[11px] font-bold text-red-700">Tolak</div>
          </GuideTarget>
          <div className="grid gap-2">
            <TargetButton ctx={ctx} target="history-print-button">Cetak Invoice</TargetButton>
            <TargetButton ctx={ctx} target="history-surat-jalan-action">Cetak Surat Jalan</TargetButton>
            <TargetButton ctx={ctx} target="history-invoice-date-action">Ubah Tanggal Invoice</TargetButton>
            <TargetButton ctx={ctx} target="history-upload-proof">Upload Bukti Pembayaran</TargetButton>
            <TargetButton ctx={ctx} target="history-debt-payment">Bayar Cicilan</TargetButton>
          </div>
        </GuideTarget>
      </GuideTarget>
    </div>
  );
}

function PosTemplate(ctx: VisualTemplateContext) {
  const paymentModalActive = isOneOf(ctx.activeTarget, [
    "pos-payment-modal",
    "pos-payment-method",
    "pos-invoice-date",
    "pos-print",
  ]);

  return (
    <div
      data-help-actual-page="pos"
      data-help-page-viewport="clipped"
      className="flex h-full min-w-0 flex-col overflow-hidden bg-surface-50"
    >
      <GuideTarget ctx={ctx} target="pos-primary" className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <header className="flex items-center gap-2 md:gap-4 px-3 md:px-6 py-3 md:py-4 bg-white border-b border-surface-100">
            <div className="flex rounded-xl border border-surface-200 bg-surface-50 p-1">
              <span className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-brand-700 shadow-sm">Produk</span>
              <span className="rounded-lg px-3 py-2 text-sm font-semibold text-surface-600">Layanan</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="relative rounded-xl border border-surface-200 bg-surface-50 py-2.5 pl-10 pr-4 text-sm text-surface-500">
                <Search className="absolute left-3 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-surface-400" aria-hidden="true" />
                <span>Cari produk, SKU, atau barcode...</span>
              </div>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <div className="hidden lg:block text-right">
                <p className="text-xs text-surface-400">Kamis, 09 Juli 2026</p>
              </div>
              <span className="hidden lg:flex relative items-center justify-center p-2 rounded-xl bg-brand-50 text-brand-700">
                <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </header>

          <div className="px-3 md:px-6 py-2 md:py-3 bg-white border-b border-surface-100 flex items-center gap-2 flex-nowrap">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap flex-shrink-0 bg-emerald-600 text-white shadow-sm">
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              Stok tersedia
            </span>
            <span aria-hidden="true" className="h-5 w-px bg-surface-200 mx-1 flex-shrink-0" />
            <span className="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0 bg-brand-600 text-white shadow-sm">
              Semua
            </span>
            <span className="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0 bg-surface-100 text-surface-600">
              Minuman (12)
            </span>
            <span className="px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex-shrink-0 bg-surface-100 text-surface-600">
              Makanan (8)
            </span>
          </div>

          <GuideTarget ctx={ctx} target="pos-products" className="flex-1 overflow-y-auto overflow-x-hidden px-3 md:px-6 py-3 md:py-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              {["Kopi Susu", "Roti Cokelat", "Air Mineral", "Paket Hemat", "Teh Lemon", "Brownies", "Croissant", "Cokelat"].map((product, index) => (
                <div key={product} className="rounded-2xl border border-surface-200 bg-white p-2 shadow-sm">
                  <div className={cx("mb-2 h-12 rounded-xl", index % 2 === 0 ? "bg-brand-100" : "bg-amber-100")} />
                  <p className="text-[11px] font-bold text-surface-800">{product}</p>
                  <p className="text-[10px] text-surface-500">Rp{(index + 1) * 12000}</p>
                </div>
              ))}
            </div>
          </GuideTarget>
          <TargetButton ctx={ctx} target="pos-expense-button" className="mx-3 mb-3 justify-start bg-amber-50 text-amber-800 md:mx-6">
            Catat Pengeluaran Shift
          </TargetButton>
        </div>

        <div className="hidden lg:block w-[340px] flex-shrink-0">
          <GuideTarget ctx={ctx} target="pos-cart" className="flex h-full flex-col border-l border-surface-200 bg-white">
            <div className="flex items-center justify-between border-b border-surface-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-brand-600" aria-hidden="true" />
                <p className="font-bold text-surface-900">Keranjang Belanja</p>
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700">3</span>
              </div>
              <span className="text-xs font-medium text-danger-500">Hapus Semua</span>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-2">
              {[
                ["Kopi Susu", "2", "Rp48.000"],
                ["Roti Cokelat", "1", "Rp18.000"],
                ["Air Mineral", "2", "Rp16.000"],
              ].map(([item, qty, total]) => (
                <div key={item} className="flex items-start gap-3 rounded-xl bg-surface-50 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-surface-900">{item}</p>
                    <p className="mt-0.5 text-xs text-surface-400">Rp{qty === "2" ? "24.000" : "18.000"} /pcs</p>
                    <p className="mt-1 text-sm font-bold text-brand-600">{total}</p>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-surface-900">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-600">-</span>
                    <span className="w-8 text-center">{qty}</span>
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-surface-200 bg-white text-surface-600">+</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-3 border-t border-surface-100 px-4 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-surface-500">Subtotal</span>
                <span className="text-lg font-extrabold text-surface-900">Rp82.000</span>
              </div>
              <TargetButton ctx={ctx} target="pos-pay-button" className="w-full bg-brand-600 text-white">
                Bayar
              </TargetButton>
            </div>
          </GuideTarget>
        </div>

        <GuideTarget
          ctx={ctx}
          target="pos-payment-modal"
          className={cx(
            "absolute left-1/2 top-1/2 z-20 w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-brand-100 bg-white p-5 shadow-2xl",
            !paymentModalActive && "pointer-events-none opacity-0",
          )}
        >
          <div data-help-step-state={paymentModalActive ? "pos-payment-modal-open" : undefined} />
          <p className="mb-3 text-sm font-bold text-brand-950">Modal Pembayaran</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <GuideTarget ctx={ctx} target="pos-payment-method" className="rounded-xl border border-surface-200 bg-surface-50 p-3 text-sm font-semibold text-surface-700">
              Metode Bayar: Tunai
            </GuideTarget>
            <GuideTarget ctx={ctx} target="pos-invoice-date" className="rounded-xl border border-surface-200 bg-surface-50 p-3 text-sm font-semibold text-surface-700">
              Tanggal Invoice: 09/07/2026 14:30
            </GuideTarget>
          </div>
          <TargetButton ctx={ctx} target="pos-print" className="mt-3 bg-surface-900 text-white">
            Cetak Struk
          </TargetButton>
        </GuideTarget>
      </GuideTarget>
    </div>
  );
}

function ProductsTemplate(ctx: VisualTemplateContext) {
  return (
    <PageShell
      ctx={ctx}
      title="Produk"
      subtitle="Kelola katalog, stok individual, harga jual, harga khusus, dan aktivitas grup stok."
    >
      <GuideTarget ctx={ctx} target="products-primary" className="space-y-3 rounded-md border border-surface-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-bold text-surface-900">Katalog Produk</p>
            <p className="text-[11px] text-surface-500">Cari dan rawat data produk toko.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <TargetButton ctx={ctx} target="products-import">Import Excel</TargetButton>
            <TargetButton ctx={ctx} target="products-add-button" className="bg-brand-600 text-white">
              Tambah Produk
            </TargetButton>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <TargetTab ctx={ctx} target="products-special-price-tab">Harga Khusus</TargetTab>
          <TargetTab ctx={ctx} target="products-stock-group-tab">Aktivitas Grup</TargetTab>
          <TargetTab ctx={ctx} target="products-price-history-tab">Riwayat Harga</TargetTab>
        </div>
        <GuideTarget ctx={ctx} target="products-table" className="rounded-md border border-surface-200">
          <div className="grid grid-cols-[1fr_0.8fr_0.7fr_0.8fr_0.7fr] border-b border-surface-200 bg-surface-100 px-3 py-2 text-[10px] font-bold text-surface-600">
            <span>Produk</span>
            <span>Kategori</span>
            <span>Stok</span>
            <span>Harga</span>
            <span>Aksi</span>
          </div>
          {[
            ["Kopi Susu 250ml", "Minuman", "42", "Rp24.000"],
            ["Roti Cokelat", "Makanan", "18", "Rp18.000"],
            ["Sirup Vanilla", "Bahan", "7", "Rp65.000"],
          ].map(([name, category, stock, price], index) => (
            <div key={name} className="grid grid-cols-[1fr_0.8fr_0.7fr_0.8fr_0.7fr] items-center border-b border-surface-100 px-3 py-2 text-[11px] text-surface-700 last:border-b-0">
              <span className="font-semibold">{name}</span>
              <span>{category}</span>
              <GuideTarget ctx={ctx} target="products-stock-field" className="w-fit rounded-md bg-surface-50 px-2 py-1 font-bold">
                {stock}
              </GuideTarget>
              <span>{price}</span>
              <div className="flex gap-1">
                {index === 0 ? (
                  <>
                    <GuideTarget ctx={ctx} target="products-edit-action" className="rounded-md border border-surface-200 px-2 py-1 text-[10px] font-bold">
                      Ubah
                    </GuideTarget>
                    <GuideTarget ctx={ctx} target="products-price-action" className="rounded-md border border-brand-200 px-2 py-1 text-[10px] font-bold text-brand-700">
                      Harga
                    </GuideTarget>
                  </>
                ) : (
                  <span className="text-surface-400">Ubah</span>
                )}
              </div>
            </div>
          ))}
        </GuideTarget>
      </GuideTarget>
    </PageShell>
  );
}

function InventoryTemplate(ctx: VisualTemplateContext) {
  return (
    <PageShell
      ctx={ctx}
      title="Inventaris"
      subtitle="Pantau stok, mutasi gudang, penerimaan barang, matching harian, dan surat jalan."
    >
      <GuideTarget ctx={ctx} target="inventory-primary" className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <TargetTab ctx={ctx} target="inventory-tabs" selected>
            Ringkasan
          </TargetTab>
          <TargetTab ctx={ctx} target="inventory-stock-log-tab">Log Stok</TargetTab>
          <TargetTab ctx={ctx} target="inventory-out-log">OUT Pending</TargetTab>
          <TargetTab ctx={ctx} target="inventory-surat-jalan">Surat Jalan</TargetTab>
        </div>

        <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-3">
            <GuideTarget ctx={ctx} target="inventory-input-menu" className="rounded-md border border-surface-200 bg-white p-3">
              <p className="mb-2 text-[11px] font-bold text-surface-800">Input / Transaksi</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <TargetButton ctx={ctx} target="inventory-update-stock">Update Stok</TargetButton>
                <TargetButton ctx={ctx} target="inventory-inbound">Penerimaan Barang</TargetButton>
                <TargetButton ctx={ctx} target="inventory-damaged">Barang Rusak</TargetButton>
                <TargetButton ctx={ctx} target="inventory-weekly-proof">Proof Kebersihan</TargetButton>
              </div>
            </GuideTarget>
            <GuideTarget ctx={ctx} target="inventory-day-session" className="rounded-md border border-emerald-100 bg-emerald-50 p-3 text-emerald-900">
              <p className="text-[11px] font-bold">Sesi Gudang Hari Ini</p>
              <p className="mt-1 text-[11px]">Check in 08:02, check out belum dilakukan.</p>
            </GuideTarget>
            <GuideTarget ctx={ctx} target="inventory-tasks" className="rounded-md border border-surface-200 bg-white p-3">
              <p className="mb-2 text-[11px] font-bold text-surface-800">Tugas Harian</p>
              {["Cek stok display", "Foto rak mingguan", "Verifikasi OUT"].map((task) => (
                <div key={task} className="mb-1 rounded-md bg-surface-50 px-2 py-1.5 text-[11px] text-surface-700">{task}</div>
              ))}
            </GuideTarget>
          </div>

          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-3">
              <TargetCard ctx={ctx} target="inventory-approval-actions" title="Approval" value="4 log" tone="warning" />
              <TargetCard ctx={ctx} target="inventory-correction" title="Koreksi" value="2 item" />
              <TargetCard ctx={ctx} target="inventory-matching" title="Matching" value="96%" tone="success" />
            </div>
            <div className="rounded-md border border-surface-200 bg-white">
              <div className="grid grid-cols-[1fr_0.7fr_0.7fr_0.8fr] border-b border-surface-200 bg-surface-100 px-3 py-2 text-[10px] font-bold text-surface-600">
                <span>Produk</span>
                <span>Awal</span>
                <span>Akhir</span>
                <span>Status</span>
              </div>
              {[
                ["Kopi Susu", "42", "39", "Cocok"],
                ["Roti Cokelat", "18", "17", "Cek ulang"],
                ["Cup 12oz", "240", "210", "Cocok"],
              ].map(([product, start, end, status]) => (
                <div key={product} className="grid grid-cols-[1fr_0.7fr_0.7fr_0.8fr] border-b border-surface-100 px-3 py-2 text-[11px] text-surface-700 last:border-b-0">
                  <span className="font-semibold">{product}</span>
                  <span>{start}</span>
                  <span>{end}</span>
                  <span>{status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </GuideTarget>
    </PageShell>
  );
}

function SuppliersTemplate(ctx: VisualTemplateContext) {
  return (
    <PageShell
      ctx={ctx}
      title="Supplier"
      subtitle="Kelola pemasok dan proses daftar belanja sebelum pembelian disetujui."
    >
      <GuideTarget ctx={ctx} target="suppliers-primary" className="grid gap-3 lg:grid-cols-[0.85fr_1.15fr]">
        <GuideTarget ctx={ctx} target="suppliers-list" className="rounded-md border border-surface-200 bg-white p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-surface-900">Daftar Supplier</p>
            <TargetButton ctx={ctx} target="suppliers-add" className="bg-brand-600 text-white">
              Tambah Supplier
            </TargetButton>
          </div>
          {["CV Sumber Rezeki", "Toko Bahan Prima", "Fresh Dairy"].map((supplier) => (
            <div key={supplier} className="mb-2 rounded-md border border-surface-100 bg-surface-50 px-3 py-2 text-[11px] font-semibold text-surface-700">
              {supplier}
            </div>
          ))}
        </GuideTarget>

        <GuideTarget ctx={ctx} target="suppliers-shopping-tab" className="space-y-3 rounded-md border border-surface-200 bg-white p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-surface-900">Tab Daftar Belanja</p>
              <p className="text-[11px] text-surface-500">Pengajuan belanja minggu ini.</p>
            </div>
            <TargetButton ctx={ctx} target="suppliers-create-request" className="bg-brand-600 text-white">
              Buat Daftar Belanja
            </TargetButton>
          </div>
          <GuideTarget ctx={ctx} target="suppliers-add-products" className="rounded-md border border-surface-200 bg-surface-50 p-3">
            <p className="mb-2 text-[11px] font-bold text-surface-800">Cari & Tambah Produk</p>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div className="rounded-md border border-surface-200 bg-white px-3 py-2 text-[11px] text-surface-500">Cari tepung, susu, atau kemasan</div>
              <TargetButton ctx={ctx} target="suppliers-request-quantity">Qty 12 dus</TargetButton>
            </div>
          </GuideTarget>
          <TargetButton ctx={ctx} target="suppliers-approve" className="bg-emerald-600 text-white">
            Setujui Belanja
          </TargetButton>
        </GuideTarget>
      </GuideTarget>
    </PageShell>
  );
}

function CustomersTemplate(ctx: VisualTemplateContext) {
  return (
    <PageShell
      ctx={ctx}
      title="Pelanggan"
      subtitle="Kelola CRM, riwayat transaksi, piutang, dan pembayaran pelanggan."
    >
      <GuideTarget ctx={ctx} target="customers-primary" className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-surface-200 bg-white p-3">
            <p className="text-sm font-bold text-surface-900">Daftar Pelanggan</p>
            <div className="flex gap-2">
              <TargetButton ctx={ctx} target="customers-filter-debt">Memiliki Piutang</TargetButton>
              <TargetButton ctx={ctx} target="customers-add" className="bg-brand-600 text-white">
                Pelanggan Baru
              </TargetButton>
            </div>
          </div>
          <GuideTarget ctx={ctx} target="customers-table" className="rounded-md border border-surface-200 bg-white">
            <div className="grid grid-cols-[1fr_0.8fr_0.7fr] border-b border-surface-200 bg-surface-100 px-3 py-2 text-[10px] font-bold text-surface-600">
              <span>Nama</span>
              <span>Sales</span>
              <span>Piutang</span>
            </div>
            {[
              ["Toko Maju", "Rina", "Rp1.250.000"],
              ["Bu Sari", "Anton", "-"],
              ["CV Harapan", "Rina", "Rp680.000"],
            ].map(([name, sales, debt]) => (
              <div key={name} className="grid grid-cols-[1fr_0.8fr_0.7fr] border-b border-surface-100 px-3 py-2 text-[11px] text-surface-700 last:border-b-0">
                <span className="font-semibold">{name}</span>
                <span>{sales}</span>
                <span>{debt}</span>
              </div>
            ))}
          </GuideTarget>
        </div>

        <GuideTarget ctx={ctx} target="customers-profile" className="space-y-3 rounded-md border border-surface-200 bg-white p-3">
          <p className="text-sm font-bold text-surface-900">Profil Toko Maju</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <TargetTab ctx={ctx} target="customers-history-tab">Riwayat Transaksi</TargetTab>
            <TargetTab ctx={ctx} target="customers-debt-tab" selected>
              Tab Piutang
            </TargetTab>
          </div>
          <div className="rounded-md bg-surface-50 p-3 text-[11px] text-surface-700">
            <p className="font-bold">Sisa piutang Rp1.250.000</p>
            <p>Jatuh tempo terdekat: 14 Juli 2026.</p>
          </div>
          <TargetButton ctx={ctx} target="customers-pay-debt" className="bg-brand-600 text-white">
            Bayar Piutang
          </TargetButton>
        </GuideTarget>
      </GuideTarget>
    </PageShell>
  );
}

function FinanceTemplate(ctx: VisualTemplateContext) {
  return (
    <PageShell
      ctx={ctx}
      title="Keuangan"
      subtitle="Pantau laporan penjualan, pengeluaran, rentang tanggal, dan ekspor data."
    >
      <GuideTarget ctx={ctx} target="finance-primary" className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <GuideTarget ctx={ctx} target="finance-date-filter" className="rounded-md border border-surface-200 bg-white px-3 py-2 text-[11px] font-semibold text-surface-600">
            01 Jul 2026 - 09 Jul 2026
          </GuideTarget>
          <TargetButton ctx={ctx} target="finance-export">Ekspor</TargetButton>
          <TargetButton ctx={ctx} target="finance-expense-create" className="bg-brand-600 text-white">
            Tambah Pengeluaran
          </TargetButton>
        </div>
        <GuideTarget ctx={ctx} target="finance-summary" className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-emerald-100 bg-emerald-50 p-3 text-emerald-900">
            <p className="text-[10px] font-semibold uppercase tracking-wide">Penjualan</p>
            <p className="text-sm font-bold">Rp18.420.000</p>
          </div>
          <div className="rounded-md border border-red-100 bg-red-50 p-3 text-red-900">
            <p className="text-[10px] font-semibold uppercase tracking-wide">Pengeluaran</p>
            <p className="text-sm font-bold">Rp3.180.000</p>
          </div>
          <div className="rounded-md border border-brand-100 bg-brand-50 p-3 text-brand-900">
            <p className="text-[10px] font-semibold uppercase tracking-wide">Laba Kotor</p>
            <p className="text-sm font-bold">Rp15.240.000</p>
          </div>
        </GuideTarget>
        <GuideTarget ctx={ctx} target="finance-expense-form" className="rounded-md border border-surface-200 bg-white p-3">
          <p className="mb-2 text-[11px] font-bold text-surface-800">Form Pengeluaran</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md bg-surface-50 px-3 py-2 text-[11px] text-surface-600">Kategori: Operasional</div>
            <div className="rounded-md bg-surface-50 px-3 py-2 text-[11px] text-surface-600">Nominal: Rp250.000</div>
            <GuideTarget ctx={ctx} target="finance-proof-url" className="rounded-md bg-surface-50 px-3 py-2 text-[11px] text-surface-600">
              URL Lampiran: prnt.sc/bukti
            </GuideTarget>
          </div>
          <TargetButton ctx={ctx} target="finance-save" className="mt-2 bg-brand-600 text-white">
            Simpan Pengeluaran
          </TargetButton>
        </GuideTarget>
      </GuideTarget>
    </PageShell>
  );
}

function ShiftTemplate(ctx: VisualTemplateContext) {
  return (
    <PageShell
      ctx={ctx}
      title="Shift Kasir"
      subtitle="Buka shift, catat modal laci, tutup shift, dan koreksi riwayat kasir."
    >
      <GuideTarget ctx={ctx} target="shift-primary" className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <GuideTarget ctx={ctx} target="shift-open" className="rounded-md border border-emerald-100 bg-emerald-50 p-3 text-emerald-900">
            <p className="text-sm font-bold">Mulai Shift</p>
            <GuideTarget ctx={ctx} target="shift-opening-cash" className="mt-2 rounded-md bg-white px-3 py-2 text-[11px] text-surface-700">
              Modal Laci: Rp500.000
            </GuideTarget>
          </GuideTarget>
          <GuideTarget ctx={ctx} target="shift-close" className="rounded-md border border-amber-100 bg-amber-50 p-3 text-amber-900">
            <p className="text-sm font-bold">Tutup Shift</p>
            <GuideTarget ctx={ctx} target="shift-closing-cash" className="mt-2 rounded-md bg-white px-3 py-2 text-[11px] text-surface-700">
              Uang Tutup Laci: Rp3.240.000
            </GuideTarget>
          </GuideTarget>
        </div>
        <GuideTarget ctx={ctx} target="shift-history" className="rounded-md border border-surface-200 bg-white">
          <div className="grid grid-cols-[1fr_0.7fr_0.7fr_0.5fr] border-b border-surface-200 bg-surface-100 px-3 py-2 text-[10px] font-bold text-surface-600">
            <span>Kasir</span>
            <span>Mulai</span>
            <span>Tutup</span>
            <span>Aksi</span>
          </div>
          {[
            ["Dewi", "08:00", "16:05"],
            ["Rizal", "16:10", "-"],
          ].map(([cashier, open, close], index) => (
            <div key={cashier} className="grid grid-cols-[1fr_0.7fr_0.7fr_0.5fr] items-center border-b border-surface-100 px-3 py-2 text-[11px] text-surface-700 last:border-b-0">
              <span className="font-semibold">{cashier}</span>
              <span>{open}</span>
              <span>{close}</span>
              {index === 0 ? (
                <GuideTarget ctx={ctx} target="shift-edit" className="w-fit rounded-md border border-surface-200 px-2 py-1 text-[10px] font-bold">
                  Edit
                </GuideTarget>
              ) : (
                <span className="text-surface-400">Aktif</span>
              )}
            </div>
          ))}
        </GuideTarget>
      </GuideTarget>
    </PageShell>
  );
}

function ProductionTemplate(ctx: VisualTemplateContext) {
  return (
    <PageShell
      ctx={ctx}
      title="Produksi"
      subtitle="Pantau pesanan produksi dalam papan kanban dan kirim update ke pelanggan."
    >
      <GuideTarget ctx={ctx} target="production-primary" className="space-y-3">
        <GuideTarget ctx={ctx} target="production-kanban" className="grid gap-3 lg:grid-cols-3">
          {["Baru", "Diproses", "Siap Pickup"].map((column, index) => (
            <GuideTarget
              key={column}
              ctx={ctx}
              target="production-status-column"
              className="min-h-44 rounded-md border border-surface-200 bg-white p-3"
            >
              <p className="mb-2 text-[11px] font-bold text-surface-800">{column}</p>
              <GuideTarget ctx={ctx} target="production-card" className="rounded-md border border-brand-100 bg-brand-50 p-3 text-brand-950">
                <p className="text-[11px] font-bold">JO-20260709-0{index + 1}</p>
                <p className="mt-1 text-[10px]">Pesanan kue ulang tahun, pickup 15:00.</p>
                {index === 1 ? (
                  <GuideTarget ctx={ctx} target="production-whatsapp" className="mt-2 rounded-md bg-emerald-600 px-2 py-1 text-center text-[10px] font-bold text-white">
                    Kirim WhatsApp
                  </GuideTarget>
                ) : null}
              </GuideTarget>
            </GuideTarget>
          ))}
        </GuideTarget>
      </GuideTarget>
    </PageShell>
  );
}

function SalespersonsTemplate(ctx: VisualTemplateContext) {
  return (
    <PageShell
      ctx={ctx}
      title="Tim Sales"
      subtitle="Kelola anggota sales, status aktif, performa, dan detail transaksi pelanggan."
    >
      <GuideTarget ctx={ctx} target="salespersons-primary" className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-surface-200 bg-white p-3">
            <p className="text-sm font-bold text-surface-900">Anggota Sales</p>
            <TargetButton ctx={ctx} target="salespersons-add" className="bg-brand-600 text-white">
              Tambah Sales
            </TargetButton>
          </div>
          <GuideTarget ctx={ctx} target="salespersons-list" className="rounded-md border border-surface-200 bg-white">
            {["Rina", "Anton", "Maya"].map((name, index) => (
              <div key={name} className="grid grid-cols-[1fr_auto_auto] items-center border-b border-surface-100 px-3 py-2 text-[11px] text-surface-700 last:border-b-0">
                <span className="font-semibold">{name}</span>
                <GuideTarget ctx={ctx} target="salespersons-toggle" className={cx("rounded-full px-2 py-1 text-[10px] font-bold", index === 1 ? "bg-surface-100 text-surface-500" : "bg-emerald-50 text-emerald-700")}>
                  {index === 1 ? "Nonaktif" : "Aktif"}
                </GuideTarget>
                {index === 0 ? (
                  <GuideTarget ctx={ctx} target="salespersons-detail" className="rounded-md border border-surface-200 px-2 py-1 text-[10px] font-bold">
                    Detail
                  </GuideTarget>
                ) : (
                  <span className="text-surface-400">Detail</span>
                )}
              </div>
            ))}
          </GuideTarget>
        </div>
        <GuideTarget ctx={ctx} target="salespersons-summary" className="grid gap-2 rounded-md border border-surface-200 bg-white p-3 sm:grid-cols-2">
          <div className="rounded-md bg-brand-50 p-3 text-brand-900">
            <p className="text-[10px] font-semibold uppercase tracking-wide">Omzet Rina</p>
            <p className="text-sm font-bold">Rp8.400.000</p>
          </div>
          <div className="rounded-md bg-emerald-50 p-3 text-emerald-900">
            <p className="text-[10px] font-semibold uppercase tracking-wide">Pelanggan Baru</p>
            <p className="text-sm font-bold">12 toko</p>
          </div>
          <div className="rounded-md bg-amber-50 p-3 text-amber-900 sm:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide">Catatan follow up</p>
            <p className="text-[11px]">3 pelanggan perlu dihubungi hari ini.</p>
          </div>
        </GuideTarget>
      </GuideTarget>
    </PageShell>
  );
}

function AssistantTemplate(ctx: VisualTemplateContext) {
  return (
    <PageShell
      ctx={ctx}
      title="AI Assistant"
      subtitle="Gunakan Pak Teladan untuk menemukan jawaban dan menjalankan workflow panduan."
    >
      <GuideTarget ctx={ctx} target="assistant-primary" className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="space-y-3 rounded-md border border-surface-200 bg-white p-3">
          <GuideTarget ctx={ctx} target="assistant-button" className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-lg font-bold text-white shadow">
            AI
          </GuideTarget>
          <GuideTarget ctx={ctx} target="assistant-input" className="rounded-md border border-surface-200 bg-surface-50 px-3 py-2 text-[11px] text-surface-500">
            Tulis pertanyaan untuk Pak Teladan...
          </GuideTarget>
          <GuideTarget ctx={ctx} target="assistant-status" className="rounded-md bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
            Status proses: menyiapkan langkah
          </GuideTarget>
        </div>
        <div className="space-y-3">
          <GuideTarget ctx={ctx} target="assistant-answer" className="rounded-md border border-surface-200 bg-white p-3">
            <p className="text-sm font-bold text-surface-900">Jawaban Pak Teladan</p>
            <p className="mt-1 text-[11px] leading-relaxed text-surface-600">
              Untuk mengubah tanggal invoice, buka Riwayat, pilih menu titik tiga, lalu gunakan aksi Ubah Tanggal Invoice.
            </p>
          </GuideTarget>
          <GuideTarget ctx={ctx} target="assistant-workflow-stepper" className="rounded-md border border-brand-100 bg-brand-50 p-3">
            <p className="mb-2 text-[11px] font-bold text-brand-950">Diagram Langkah</p>
            {["Buka Riwayat", "Pilih transaksi", "Ubah tanggal", "Simpan"].map((step, index) => (
              <div key={step} className="mb-2 flex items-center gap-2 text-[11px] text-brand-900 last:mb-0">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[10px] font-bold text-white">{index + 1}</span>
                <span className="font-semibold">{step}</span>
              </div>
            ))}
          </GuideTarget>
        </div>
      </GuideTarget>
    </PageShell>
  );
}

const PAGE_RENDERERS: Record<HelpStepVisual["page"], (ctx: VisualTemplateContext) => React.ReactNode> = {
  settings: SettingsTemplate,
  history: HistoryTemplate,
  pos: PosTemplate,
  products: ProductsTemplate,
  inventory: InventoryTemplate,
  suppliers: SuppliersTemplate,
  customers: CustomersTemplate,
  finance: FinanceTemplate,
  shift: ShiftTemplate,
  production: ProductionTemplate,
  salespersons: SalespersonsTemplate,
  assistant: AssistantTemplate,
};

const VisualGuideMockupComponent: React.FC<VisualGuideMockupProps> = ({ visual, stepNumber, stepTitle }) => {
  const config = HELP_VISUAL_PAGE_CONFIG[visual.page];
  const activeTarget = isKnownTarget(visual) ? visual.target : config.primaryTarget;
  const activeLabel = getHelpVisualTargetLabel({ page: visual.page, target: activeTarget });
  const ctx = { page: visual.page, config, activeTarget, stepNumber };
  const renderPage = PAGE_RENDERERS[visual.page];

  return (
    <section
      data-help-visual-mock={visual.page}
      aria-label={`Mock halaman ${config.label}`}
      className="space-y-3"
    >
      <GuideAppShellPreview page={visual.page}>
        {renderPage(ctx)}
      </GuideAppShellPreview>

      <div
        data-help-animation="step-callout"
        className="rounded-lg border border-brand-100 bg-brand-50 p-3 text-brand-900 transition-all duration-300 ease-out"
      >
        <div className="mb-1 flex items-center gap-2">
          <span
            data-help-callout-number={stepNumber}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white transition-all duration-300 ease-out"
          >
            {stepNumber}
          </span>
          <p className="text-sm font-bold">{stepTitle}</p>
        </div>
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">{activeLabel}</span>
          <span aria-hidden="true"> {"->"} </span>
          {visual.callout}
        </p>
      </div>
    </section>
  );
};

export const VisualGuideMockup = React.memo(VisualGuideMockupComponent);
