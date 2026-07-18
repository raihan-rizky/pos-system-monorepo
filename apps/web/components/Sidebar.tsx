"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/components/providers/RoleProvider";

import { usePendingTransactionCount, useUnpaidDebtTransactionCount } from "@/hooks/useTransactions";
import { useInventorySummary } from "@/features/inventory-management/hooks/useInventorySummary";
import { clearClientAuthState } from "@/lib/auth/pos-session";
import { APP_SHELL_NAV_GROUPS } from "@/components/app-shell/app-shell-navigation";
import {
  ChevronLeft,
  LogOut,
  type LucideIcon,
} from "lucide-react";

const sidebarIconClass = "h-5 w-5";
const navGroups = APP_SHELL_NAV_GROUPS;

/* ─────────────────────────────────────────────
   Reusable nav item link
   ───────────────────────────────────────────── */
function NavItem({
  href,
  label,
  icon: Icon,
  isActive,
  isCollapsed,
  onNavigate,
  badge,
  badgeVariant = "amber",
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  isCollapsed: boolean;
  onNavigate?: () => void;
  badge?: number;
  badgeVariant?: "amber" | "blue" | "red";
}) {
  const router = useRouter();
  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    onNavigate?.();
    if (typeof window !== "undefined" && !navigator.onLine) {
      event.preventDefault();
      window.location.assign(href);
    }
  };

  return (
    <Link
      href={href}
      prefetch
      onMouseEnter={() => router.prefetch(href)}
      onClick={handleClick}
      title={isCollapsed ? label : undefined}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      className={`
        relative flex items-center shrink-0 cursor-pointer
        transition-all duration-200 group/nav
        ${isCollapsed
          ? "justify-center w-12 h-12 rounded-xl"
          : "justify-start w-full px-3.5 py-3 rounded-xl gap-3"
        }
        ${isActive
          ? "bg-brand-600 text-white shadow-glow"
          : "text-surface-400 hover:text-white hover:bg-surface-800"
        }
      `}
    >
      <div className="shrink-0 flex items-center justify-center">
        <Icon className={sidebarIconClass} aria-hidden="true" />
      </div>
      {!isCollapsed && (
        <span className="text-sm font-semibold transition-all duration-200 whitespace-nowrap overflow-hidden text-ellipsis">
          {label}
        </span>
      )}
      {badge !== undefined && badge > 0 && (
        !isCollapsed ? (
          <span
            aria-label={
              label === "Riwayat"
                ? `${badge} transaksi pending`
                : label === "Pelanggan"
                  ? `${badge} transaksi piutang belum lunas`
                  : `${badge} permintaan menunggu persetujuan`
            }
            className={`ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-white text-[10px] font-black ${
              badgeVariant === "blue"
                ? "bg-blue-500"
                : badgeVariant === "red"
                  ? "bg-red-500"
                  : "bg-amber-500"
            }`}
          >
            {badge}
          </span>
        ) : (
          <span
            aria-label={
              label === "Riwayat"
                ? `${badge} transaksi pending`
                : label === "Pelanggan"
                  ? `${badge} transaksi piutang belum lunas`
                  : `${badge} permintaan menunggu persetujuan`
            }
            className={`absolute top-1 right-1 w-2 h-2 rounded-full ring-2 ring-surface-900 ${
              badgeVariant === "blue"
                ? "bg-blue-500"
                : badgeVariant === "red"
                  ? "bg-red-500"
                  : "bg-amber-500"
            }`}
          />
        )
      )}
      {/* Desktop tooltip */}
      {isCollapsed && (
        <span
          className="
            hidden md:block absolute left-full ml-3 px-2.5 py-1 rounded-lg text-xs font-medium
            bg-surface-800 text-white whitespace-nowrap z-50
            opacity-0 pointer-events-none group-hover/nav:opacity-100
            transition-opacity duration-200 shadow-lg
          "
        >
          {label}
        </span>
      )}
    </Link>
  );
}

/* ─────────────────────────────────────────────
   Main Sidebar
   ───────────────────────────────────────────── */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { canAccess, role } = useRole();
  const isOwner = role === "OWNER";
  const roleLabel = role
    ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
    : "User";

  const { data: inventorySummary } = useInventorySummary({
    enabled: canAccess("/inventory"),
  });
  const urgentInventoryCount = inventorySummary?.urgentCount ?? 0;
  const { data: pendingTransactionCount = 0 } = usePendingTransactionCount({
    enabled: canAccess("/history"),
  });
  const { data: unpaidDebtCount = 0 } = useUnpaidDebtTransactionCount({
    enabled: canAccess("/customers"),
  });
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(true);

  // Sync state with localstorage safely to avoid SSR hydration issues
  useEffect(() => {
    const stored = localStorage.getItem("sidebar_collapsed");
    if (stored !== null) {
      setIsCollapsed(stored === "true");
    }
  }, []);

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_collapsed", String(next));
      return next;
    });
  };

  const toggle = (id: string) =>
    setOpenGroup((prev) => (prev === id ? null : id));

  const closeAll = () => setOpenGroup(null);

  const filteredNavGroups = navGroups
    .map((group) => {
      return {
        ...group,
        items: group.items.filter((item) => canAccess(item.href)),
      };
    })
    .filter((group) => group.items.length > 0);

  const activeGroupObj = filteredNavGroups.find((g) => g.id === openGroup);

  return (
    <>
      {/* Mobile backdrop overlay (dark blur when a group sheet is open) */}
      <div
        className={`
          fixed inset-0 z-[149] bg-black/65 backdrop-blur-xs transition-opacity duration-300 md:hidden
          ${openGroup ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}
        `}
        onClick={closeAll}
        aria-hidden="true"
      />

      {/* ── DESKTOP SIDEBAR ── */}
      <aside className={`
  hidden md:flex flex-col bg-surface-900 border-r overflow-y-auto border-surface-800 
  py-5 px-3 shrink-0 h-full transition-all duration-300 ease-in-out z-50
  ${isCollapsed ? "w-[76px] items-center" : "w-[240px] items-stretch"}
`}>
        {/* Logo area */}
        <div
          className={`flex items-center mb-6 shrink-0 transition-all duration-200
            ${isCollapsed ? "justify-center w-10 h-10" : "px-2.5 gap-3 w-full"}
          `}
        >
          <img
            src="/images/icon.png"
            alt="Logo"
            className="w-8 h-8 object-contain drop-shadow-md shrink-0"
          />
          {!isCollapsed && (
            <div className="flex flex-col leading-none overflow-hidden">
              <span className="text-sm font-extrabold tracking-wider text-white">
                Toko Teladan
              </span>
              <span className="text-[10px] text-surface-400 font-semibold mt-0.5 whitespace-nowrap">
                Smart Cashier
              </span>
              <span className="text-[11px] text-brand-300 font-bold mt-2 whitespace-nowrap">
                Welcome {roleLabel}!
              </span>
            </div>
          )}
        </div>

        {/* Flat grouped navigation list */}
        <nav
          className="flex flex-col gap-4 items-center w-full"
          aria-label="Main navigation"
        >
          {filteredNavGroups.map((group, gi) => (
            <React.Fragment key={group.id}>
              <div className="flex flex-col gap-1.5 items-center w-full">
                {!isCollapsed ? (
                  <div className="w-full px-2.5 pt-2 pb-1 text-[10px] font-bold text-surface-500 uppercase tracking-widest text-left select-none">
                    {group.label}
                  </div>
                ) : gi > 0 ? (
                  <div className="w-8 h-px bg-surface-800 my-1 rounded-full" />
                ) : null}

                {group.items.map((item) => (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    isActive={pathname === item.href}
                    isCollapsed={isCollapsed}
                    badge={
                      item.href === "/inventory"
                        ? urgentInventoryCount
                        : item.href === "/history"
                          ? pendingTransactionCount
                          : item.href === "/customers"
                            ? unpaidDebtCount
                            : undefined
                    }
                    badgeVariant={
                      item.href === "/history"
                        ? "blue"
                        : item.href === "/customers"
                          ? "red"
                          : "amber"
                    }
                  />
                ))}
              </div>
            </React.Fragment>
          ))}
        </nav>

        {/* Collapsing arrow trigger */}
        <div className="mt-auto w-full pt-4 border-t border-surface-850 flex flex-col gap-3">
          <button
            type="button"
            onClick={toggleSidebar}
            className={`
              w-full flex items-center transition-all duration-200 text-surface-400 hover:text-white hover:bg-surface-800 rounded-xl py-3 cursor-pointer
              ${isCollapsed ? "justify-center px-0 h-10" : "px-3.5 gap-3"}
            `}
            title={isCollapsed ? "Tampilkan Label" : "Sembunyikan Label"}
          >
            <div
              className={`transition-transform duration-300 ${isCollapsed ? "" : "rotate-180"}`}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </div>
            {!isCollapsed && (
              <span className="text-sm font-semibold">Sembunyikan</span>
            )}
          </button>

          {/* Desktop logout */}
          <button
            type="button"
            id="sidebar-logout"
            title="Keluar"
            aria-label="Keluar"
            onClick={async () => {
              const supabase = createClient();
              await supabase.auth.signOut();
              await fetch("/api/auth/clear-session", { method: "POST" }).catch(() => undefined);
              clearClientAuthState();
              router.push("/login");
              router.refresh();
            }}
            className={`
              flex items-center transition-all duration-200 text-surface-400 hover:text-red-400 hover:bg-red-950/20 rounded-xl py-3 cursor-pointer
              ${isCollapsed ? "justify-center w-10 h-10 bg-surface-800" : "px-3.5 gap-3 w-full"}
            `}
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
            {!isCollapsed && (
              <span className="text-sm font-semibold">Keluar</span>
            )}
          </button>
        </div>
      </aside>

      {/* ── MOBILE BAR ── */}
      <nav
        className="flex md:hidden fixed bottom-0 left-0 w-full h-16 bg-surface-950/95 backdrop-blur-md border-t border-surface-850 items-center justify-around px-2 z-[100]"
        aria-label="Mobile navigation"
      >
        {filteredNavGroups.map((group) => {
          const hasActive = group.items.some((i) => pathname === i.href);
          const isOpen = openGroup === group.id;
          return (
            <button
              key={group.id}
              onClick={() => toggle(group.id)}
              className={`
                flex flex-col items-center justify-center gap-1 w-16 h-14 rounded-xl relative cursor-pointer transition-all duration-200
                ${hasActive && !isOpen
                  ? "text-brand-400 font-semibold"
                  : isOpen
                    ? "text-white bg-surface-800/80 scale-95"
                    : "text-surface-400 hover:text-white"
                }
              `}
            >
              {hasActive && !isOpen && (
                <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-brand-400 z-10" />
              )}
              <div className="shrink-0">
                <group.icon className={sidebarIconClass} aria-hidden="true" />
              </div>
              <span className="text-[9px] uppercase tracking-wider font-semibold leading-none">
                {group.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── MOBILE BOTTOM SHEET DRAWER ── */}
      <div
        className={`
          fixed bottom-0 left-0 w-full bg-surface-900 border-t border-surface-800 rounded-t-[2rem] z-[150] shadow-2xl transition-all duration-300 ease-out flex flex-col md:hidden
          ${openGroup ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"}
        `}
        style={{ maxHeight: "80vh" }}
      >
        {/* Grabber Handle */}
        <div
          className="w-12 h-1.5 bg-surface-700 hover:bg-surface-650 rounded-full mx-auto my-3 cursor-pointer shrink-0"
          onClick={closeAll}
        />

        {/* Active Group Header */}
        {activeGroupObj && (
          <div className="px-6 py-2 shrink-0 border-b border-surface-800 pb-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-brand-300 mb-2">
              Welcome {roleLabel}!
            </p>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span className="text-brand-400 shrink-0">
                <activeGroupObj.icon className={sidebarIconClass} aria-hidden="true" />
              </span>
              {activeGroupObj.label}
            </h3>
            <p className="text-[11px] text-surface-400 mt-1 select-none">
              {activeGroupObj.description}
            </p>
          </div>
        )}

        {/* Active Group Content (Grid List) */}
        <div className="overflow-y-auto p-5 shrink-0 max-h-[50vh]">
          <div className="grid grid-cols-2 gap-3">
            {activeGroupObj?.items.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeAll}
                  className={`
                    flex flex-col items-center justify-center gap-3 p-4
                    border rounded-2xl cursor-pointer transition-all duration-200 active:scale-95
                    ${isActive
                      ? "bg-brand-600/10 border-brand-500 text-brand-400 font-bold"
                      : "bg-surface-800 border-surface-700/60 text-surface-300 hover:text-white"
                    }
                  `}
                >
                  <div
                    className={`p-3 rounded-xl transition-colors ${isActive ? "bg-brand-600 text-white" : "bg-surface-700 text-surface-300"}`}
                  >
                    <item.icon className={sidebarIconClass} aria-hidden="true" />
                  </div>
                  <span className="text-xs font-bold leading-none">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Mobile Logout Button (Visible only inside Lainnya/utils group) */}
        {openGroup === "utils" && (
          <div className="px-5 pb-8 pt-2 shrink-0 border-t border-surface-850">
            <button
              type="button"
              onClick={async () => {
                closeAll();
                const supabase = createClient();
                await supabase.auth.signOut();
                await fetch("/api/auth/clear-session", { method: "POST" }).catch(() => undefined);
                clearClientAuthState();
                router.push("/login");
                router.refresh();
              }}
              className="w-full flex items-center justify-center gap-2 py-3.5 bg-red-950/20 hover:bg-red-900/30 active:bg-red-900/50 border border-red-900/40 text-red-400 text-sm font-bold rounded-2xl transition-all cursor-pointer"
            >
              <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
              Keluar Akun
            </button>
          </div>
        )}
      </div>
    </>
  );
}
