"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/components/providers/RoleProvider";
import { usePendingInventoryLogCount } from "@/hooks/useInventoryLogs";
import { clearClientAuthState } from "@/lib/auth/pos-session";

/* ─────────────────────────────────────────────
   SVG icon helpers (kept inline to avoid deps)
   ───────────────────────────────────────────── */
const icons = {
  dashboard: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  pos: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 8h2" />
      <path d="M15 8h2" />
      <path d="M7 12h2" />
      <path d="M15 12h2" />
      <path d="M11 8h2" />
      <path d="M11 12h2" />
    </svg>
  ),
  history: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 8v4l3 3" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  ),
  financial: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3v18h18" />
      <path d="M7 15l4-4 3 3 5-7" />
      <path d="M15 7h4v4" />
    </svg>
  ),
  product: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="16.5" y1="9.4" x2="7.5" y2="4.21" />
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  ),
  production: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
      <path d="M15 3v18" />
    </svg>
  ),
  customers: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  salespersons: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  ),
  wa: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  ),
  shift: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  // Group icons
  operations: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </svg>
  ),
  catalog: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  crm: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  finance: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h10" />
      <path d="M7 12h4" />
      <path d="M15 12h2" />
      <path d="M15 16h2" />
      <path d="M7 16h4" />
    </svg>
  ),
  pemasukan: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 19V5" />
      <polyline points="6 11 12 5 18 11" />
    </svg>
  ),
  pengeluaran: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14" />
      <polyline points="6 13 12 19 18 13" />
    </svg>
  ),
  settings: (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14" />
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  ),
};

/* ─────────────────────────────────────────────
   Nav structure
   ───────────────────────────────────────────── */
const navGroups = [
  {
    id: "operations",
    label: "Operasi",
    icon: icons.operations,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: icons.dashboard },
      { href: "/pos", label: "Kasir", icon: icons.pos },
      { href: "/history", label: "Riwayat", icon: icons.history },
    ],
  },
  {
    id: "catalog",
    label: "Katalog",
    icon: icons.catalog,
    items: [
      { href: "/products", label: "Produk", icon: icons.product },
      { href: "/production", label: "Produksi", icon: icons.production },
    ],
  },
  {
    id: "finance",
    label: "Keuangan",
    icon: icons.finance,
    items: [
      {
        href: "/keuangan",
        label: "Keuangan",
        icon: icons.finance,
      },
      {
        href: "/financial-report",
        label: "Laporan Keuangan",
        icon: icons.financial,
      },
    ],
  },
  {
    id: "crm",
    label: "Pelanggan",
    icon: icons.crm,
    items: [
      { href: "/customers", label: "Pelanggan", icon: icons.customers },
      {
        href: "/salespersons",
        label: "Sales",
        icon: icons.salespersons,
      },
    ],
  },
  {
    id: "utils",
    label: "Lainnya",
    icon: icons.settings,
    items: [
      { href: "/wa", label: "WA Chat", icon: icons.wa },
      { href: "/shift", label: "Shift Kasir", icon: icons.shift },
      { href: "/settings", label: "Pengaturan", icon: icons.settings },
    ],
  },
];

type NavEntry = (typeof navGroups)[number]["items"][number];

/* ─────────────────────────────────────────────
   Reusable nav item link
   ───────────────────────────────────────────── */
function NavItem({
  href,
  label,
  icon,
  isActive,
  isCollapsed,
  onNavigate,
  badge,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  isCollapsed: boolean;
  onNavigate?: () => void;
  badge?: number;
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
        ${
          isCollapsed
            ? "justify-center w-12 h-12 rounded-xl"
            : "justify-start w-full px-3.5 py-3 rounded-xl gap-3"
        }
        ${
          isActive
            ? "bg-brand-600 text-white shadow-glow"
            : "text-surface-400 hover:text-white hover:bg-surface-800"
        }
      `}
    >
      <div className="shrink-0 flex items-center justify-center">{icon}</div>
      {!isCollapsed && (
        <span className="text-sm font-semibold transition-all duration-200 whitespace-nowrap overflow-hidden text-ellipsis">
          {label}
        </span>
      )}
      {badge !== undefined && badge > 0 && (
        !isCollapsed ? (
          <span
            aria-label={`${badge} permintaan menunggu persetujuan`}
            className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-[10px] font-black"
          >
            {badge}
          </span>
        ) : (
          <span
            aria-label={`${badge} permintaan menunggu persetujuan`}
            className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-surface-900"
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
  const { data: pendingInventoryCount = 0 } = usePendingInventoryLogCount();
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
      <aside
        className={`
          hidden md:flex flex-col bg-surface-900 border-r border-surface-800 py-5 px-3 shrink-0 h-screen sticky top-0 transition-all duration-300 ease-in-out z-50
          ${isCollapsed ? "w-[76px] items-center" : "w-[240px] items-stretch"}
        `}
      >
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
                      isOwner && item.href === "/products"
                        ? pendingInventoryCount
                        : undefined
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
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
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
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
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
                ${
                  hasActive && !isOpen
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
              <div className="shrink-0">{group.icon}</div>
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
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span className="text-brand-400 shrink-0">
                {activeGroupObj.icon}
              </span>
              {activeGroupObj.label}
            </h3>
            <p className="text-[11px] text-surface-400 mt-1 select-none">
              {activeGroupObj.id === "operations" &&
                "Kelola operasional kasir, dashboard, dan riwayat harian."}
              {activeGroupObj.id === "catalog" &&
                "Kelola inventaris produk dan papan status antrean produksi."}
              {activeGroupObj.id === "finance" &&
                "Pantau revenue, profit, metode pembayaran, piutang, dan shift kas."}
              {activeGroupObj.id === "crm" &&
                "Data relasi pelanggan tetap dan pencatatan agen pemasaran."}
              {activeGroupObj.id === "utils" &&
                "Fitur live chat WhatsApp, status shift kasir, dan konfigurasi umum."}
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
                    ${
                      isActive
                        ? "bg-brand-600/10 border-brand-500 text-brand-400 font-bold"
                        : "bg-surface-800 border-surface-700/60 text-surface-300 hover:text-white"
                    }
                  `}
                >
                  <div
                    className={`p-3 rounded-xl transition-colors ${isActive ? "bg-brand-600 text-white" : "bg-surface-700 text-surface-300"}`}
                  >
                    {item.icon}
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
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Keluar Akun
            </button>
          </div>
        )}
      </div>
    </>
  );
}
