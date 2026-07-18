"use client";

import React from "react";
import { Bot, ChevronLeft, LogOut } from "lucide-react";

import {
  APP_SHELL_NAV_GROUPS,
  APP_SHELL_NAV_ITEMS,
} from "@/components/app-shell/app-shell-navigation";
import type { PreviewPage } from "./types";
import { cx } from "./GuideTarget";
import { PreviewMagnifier } from "./PreviewMagnifier";

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

function DesktopNavigation({ activeNav }: { activeNav: string | null }) {
  return (
    <aside
      data-help-preview-sidebar="true"
      data-help-preview-sidebar-mode="collapsed"
      data-help-preview-sidebar-width="76"
      data-help-shell-mode="desktop"
      className="hidden h-full w-[76px] shrink-0 flex-col items-center overflow-hidden border-r border-surface-800 bg-surface-900 px-3 py-4 text-white md:flex"
    >
      <img src="/images/icon.png" alt="Logo" className="mb-4 h-9 w-9 shrink-0 object-contain drop-shadow-md" />
      <nav className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-y-auto" aria-label="Navigasi preview desktop">
        {APP_SHELL_NAV_GROUPS.map((group, groupIndex) => (
          <React.Fragment key={group.id}>
            {groupIndex > 0 ? <span className="my-1 h-px w-8 shrink-0 bg-surface-800" aria-hidden="true" /> : null}
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = activeNav === item.id;
              return (
                <span
                  key={item.id}
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
              );
            })}
          </React.Fragment>
        ))}
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
function MobileNavigation({ activeNav }: { activeNav: string | null }) {
  return (
    <nav
      data-help-shell-mode="mobile"
      data-help-preview-mobile-navigation="true"
      className="absolute inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t border-surface-800 bg-surface-950/95 px-1 text-white backdrop-blur-md md:hidden"
      aria-label="Navigasi preview mobile"
    >
      {APP_SHELL_NAV_GROUPS.map((group) => {
        const Icon = group.icon;
        const active = group.items.some((item) => item.id === activeNav);
        return (
          <span
            key={group.id}
            className={cx(
              "flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl text-[8px] font-semibold uppercase tracking-wide",
              active ? "text-brand-300" : "text-surface-400",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span className="max-w-14 truncate">{group.label}</span>
          </span>
        );
      })}
    </nav>
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
  const activeNav = activeNavId ?? ACTIVE_NAV[page];

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const frame = window.requestAnimationFrame(() => {
      const candidates = Array.from(
        viewport.querySelectorAll<HTMLElement>(`[data-help-target="${activeTarget}"]`),
      ).filter((target) => {
        const style = window.getComputedStyle(target);
        const rect = target.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      });
      if (candidates.length !== 1) return;

      candidates[0].scrollIntoView({
        block: "center",
        inline: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeTarget]);

  return (
    <div
      data-help-responsive-source="device-viewport"
      data-help-preview-navigation-contract="production"
      className="relative flex h-full min-h-0 w-full overflow-hidden bg-surface-50"
    >
      <DesktopNavigation activeNav={activeNav} />
      <main
        ref={viewportRef}
        data-help-page-scroll="both"
        data-help-auto-scroll-target={activeTarget}
        className="relative min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain bg-surface-50 pb-16 md:pb-0"
      >
        {children}
        {page !== "assistant" ? (
          <span
            data-help-preview-assistant-button="true"
            className="absolute bottom-20 right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-2xl md:bottom-5 md:right-5 md:h-14 md:w-14"
          >
            <Bot className="h-6 w-6 md:h-7 md:w-7" aria-hidden="true" />
          </span>
        ) : null}
      </main>
      <MobileNavigation activeNav={activeNav} />
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
      data-help-preview-nav-count={APP_SHELL_NAV_ITEMS.length}
      className="max-w-full overflow-hidden rounded-xl border border-surface-200 bg-surface-950 shadow-sm transition-all duration-500 ease-out"
    >
      <div className="flex items-center justify-between border-b border-surface-800 px-3 py-2 text-white">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-surface-400">Preview responsif</p>
          <p className="text-xs font-bold">AppShell sesuai perangkat Anda</p>
        </div>
        <div className="flex gap-1.5" aria-hidden="true">
          <span className="h-2 w-2 rounded-full bg-red-300" />
          <span className="h-2 w-2 rounded-full bg-yellow-300" />
          <span className="h-2 w-2 rounded-full bg-green-300" />
        </div>
      </div>
      <div className="relative mx-auto h-[min(68vh,768px)] min-h-[420px] w-full max-w-full overflow-hidden sm:min-h-[520px]">
        <PreviewMagnifier enabled={magnifierEnabled}>
          <Canvas page={page} activeNavId={activeNavId} activeTarget={activeTarget}>
            {children}
          </Canvas>
        </PreviewMagnifier>
      </div>
    </div>
  );
}
