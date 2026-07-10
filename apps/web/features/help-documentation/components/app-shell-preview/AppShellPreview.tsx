"use client";

import React from "react";
import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Calculator,
  ChevronLeft,
  CircleDollarSign,
  Grid2X2,
  HelpCircle,
  LogOut,
  MessageCircle,
  Package,
  PanelsTopLeft,
  Settings,
  Tags,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { PreviewPage } from "./types";
import { cx } from "./GuideTarget";
import { PreviewMagnifier } from "./PreviewMagnifier";

const NAV_ITEMS: Array<{ id: string; label: string; icon: LucideIcon; separator?: boolean }> = [
  { id: "dashboard", label: "Dashboard", icon: Grid2X2 },
  { id: "pos", label: "Kasir", icon: Calculator },
  { id: "history", label: "Riwayat", icon: WalletCards },
  { id: "products", label: "Produk", icon: Package, separator: true },
  { id: "suppliers", label: "Supplier", icon: Truck },
  { id: "production", label: "Produksi", icon: PanelsTopLeft },
  { id: "inventory", label: "Inventaris", icon: Package, separator: true },
  { id: "finance", label: "Keuangan", icon: CircleDollarSign, separator: true },
  { id: "financial-report", label: "Laporan Keuangan", icon: BarChart3 },
  { id: "customers", label: "Pelanggan", icon: Users, separator: true },
  { id: "salespersons", label: "Sales", icon: Tags },
  { id: "wa", label: "WA Chat", icon: MessageCircle, separator: true },
  { id: "shift", label: "Shift Kasir", icon: BriefcaseBusiness },
  { id: "settings", label: "Pengaturan", icon: Settings },
  { id: "help", label: "Bantuan", icon: HelpCircle },
];

const ACTIVE_NAV: Record<PreviewPage, string | null> = {
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
  assistant: null,
};

function CollapsedSidebar({
  page,
  activeNavId,
}: {
  page: PreviewPage;
  activeNavId?: string;
}) {
  const activeNav = activeNavId ?? ACTIVE_NAV[page];

  return (
    <aside
      data-help-preview-sidebar="true"
      data-help-preview-sidebar-mode="collapsed"
      data-help-preview-sidebar-width="76"
      className="flex h-[768px] w-[76px] shrink-0 flex-col items-center overflow-hidden border-r border-surface-800 bg-surface-900 px-3 py-4 text-white"
    >
      <img
        src="/images/icon.png"
        alt="Logo"
        className="mb-4 h-9 w-9 shrink-0 object-contain drop-shadow-md"
      />
      <nav className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto" aria-label="Navigasi preview">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <React.Fragment key={item.id}>
              {item.separator ? <span className="my-1 h-px w-8 shrink-0 bg-surface-800" aria-hidden="true" /> : null}
              <span
                title={item.label}
                aria-label={item.label}
                data-help-preview-nav-active={active ? item.id : undefined}
                className={cx(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  active ? "bg-brand-600 text-white shadow-glow" : "text-surface-400",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
            </React.Fragment>
          );
        })}
      </nav>
      <div className="mt-2 flex flex-col gap-1 border-t border-surface-800 pt-2 text-surface-400">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl" title="Tampilkan Label">
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-800" title="Keluar">
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </aside>
  );
}

function Canvas({
  page,
  activeNavId,
  activeTarget,
  children,
}: {
  page: PreviewPage;
  activeNavId?: string;
  activeTarget: string;
  children: React.ReactNode;
}) {
  const viewportRef = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const frame = window.requestAnimationFrame(() => {
      const target = viewport.querySelector<HTMLElement>(
        `[data-help-target="${activeTarget}"]`,
      );
      if (!target) return;

      const viewportRect = viewport.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const scaleX = viewportRect.width > 0 ? viewport.clientWidth / viewportRect.width : 1;
      const scaleY = viewportRect.height > 0 ? viewport.clientHeight / viewportRect.height : 1;
      const targetCenterX = viewport.scrollLeft
        + (targetRect.left - viewportRect.left + targetRect.width / 2) * scaleX;
      const targetCenterY = viewport.scrollTop
        + (targetRect.top - viewportRect.top + targetRect.height / 2) * scaleY;
      const left = Math.max(
        0,
        Math.min(viewport.scrollWidth - viewport.clientWidth, targetCenterX - viewport.clientWidth / 2),
      );
      const top = Math.max(
        0,
        Math.min(viewport.scrollHeight - viewport.clientHeight, targetCenterY - viewport.clientHeight / 2),
      );
      const reduceMotion = typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      viewport.scrollTo({ left, top, behavior: reduceMotion ? "auto" : "smooth" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeTarget]);

  return (
    <div
      className="relative aspect-[1366/768] h-full w-full max-w-full overflow-hidden bg-surface-900"
      style={{ contain: "layout paint", containerType: "inline-size" }}
    >
      <div
        data-help-preview-canvas="1366x768"
        className="absolute left-0 top-0 flex h-[768px] w-[1366px] origin-top-left bg-surface-50 transition-transform duration-500 ease-out will-change-transform"
        style={{ width: 1366, height: 768, transform: "scale(calc(100cqw / 1366))" }}
      >
        <CollapsedSidebar page={page} activeNavId={activeNavId} />
        <main
          ref={viewportRef}
          data-help-preview-viewport-size="1290x768"
          data-help-page-scroll="both"
          data-help-auto-scroll-target={activeTarget}
          className="relative h-[768px] w-[1290px] min-h-0 min-w-0 flex-none overflow-auto overscroll-contain bg-surface-50"
        >
          {children}
          {page !== "assistant" ? (
            <span
              data-help-preview-assistant-button="true"
              className="absolute bottom-5 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-2xl"
            >
              <Bot className="h-7 w-7" aria-hidden="true" />
            </span>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export function AppShellPreview({
  page,
  activeNavId,
  activeTarget,
  magnifierEnabled,
  children,
}: {
  page: PreviewPage;
  activeNavId?: string;
  activeTarget: string;
  magnifierEnabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-help-animation="page-preview"
      data-help-appshell-overflow-guard="true"
      className="max-w-full overflow-hidden rounded-xl border border-surface-200 bg-surface-950 shadow-sm transition-all duration-500 ease-out"
    >
      <div className="flex items-center justify-between border-b border-surface-800 px-3 py-2 text-white">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-surface-400">Desktop preview</p>
          <p className="text-xs font-bold">1366 x 768 AppShell</p>
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-red-300" />
          <span className="h-2 w-2 rounded-full bg-yellow-300" />
          <span className="h-2 w-2 rounded-full bg-green-300" />
        </div>
      </div>
      <div className="relative aspect-[1366/768] w-full max-w-full max-h-[58vh] mx-auto overflow-hidden">
        <PreviewMagnifier enabled={magnifierEnabled}>
          <Canvas page={page} activeNavId={activeNavId} activeTarget={activeTarget}>
            {children}
          </Canvas>
        </PreviewMagnifier>
      </div>
    </div>
  );
}
