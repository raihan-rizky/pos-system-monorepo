"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useRole } from "@/components/providers/RoleProvider";

const supabase = createClient();

/* ─────────────────────────────────────────────
   SVG icon helpers (kept inline to avoid deps)
───────────────────────────────────────────── */
const icons = {
  dashboard: (
    <svg
      width="22"
      height="22"
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
      width="22"
      height="22"
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
      width="22"
      height="22"
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
  product: (
    <svg
      width="22"
      height="22"
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
      width="22"
      height="22"
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
      width="22"
      height="22"
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
      width="22"
      height="22"
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
      width="22"
      height="22"
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
      width="22"
      height="22"
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
      width="22"
      height="22"
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
      width="22"
      height="22"
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
      width="22"
      height="22"
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
  settings: (
    <svg
      width="22"
      height="22"
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
      { href: "/history", label: "History", icon: icons.history },
    ],
  },
  {
    id: "catalog",
    label: "Katalog",
    icon: icons.catalog,
    items: [
      { href: "/products", label: "Products", icon: icons.product },
      { href: "/production", label: "Production", icon: icons.production },
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
        label: "Salespersons",
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
      { href: "/settings", label: "Settings", icon: icons.settings },
    ],
  },
];

/* ─────────────────────────────────────────────
   Reusable nav item link
───────────────────────────────────────────── */
function NavItem({
  href,
  label,
  icon,
  isActive,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  return (
    <Link
      href={href}
      prefetch
      onMouseEnter={() => router.prefetch(href)}
      onClick={onNavigate}
      title={label}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
      className={`
        relative flex items-center justify-center
        w-12 h-12 rounded-xl shrink-0 cursor-pointer
        transition-all duration-200 group/nav
        ${
          isActive
            ? "bg-brand-600 text-white shadow-glow"
            : "text-surface-400 hover:text-white hover:bg-surface-800"
        }
      `}
    >
      {icon}
      {/* Desktop tooltip */}
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
    </Link>
  );
}

/* ─────────────────────────────────────────────
   Mobile group button + radial fan-out children
───────────────────────────────────────────── */
function MobileMenuItem({ item, isActive, onClick }: { item: any, isActive: boolean, onClick: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={`
        flex items-center gap-3 px-4 py-3 rounded-xl transition-colors
        ${isActive ? "bg-brand-600 text-white shadow-glow" : "text-surface-300 hover:text-white hover:bg-surface-800"}
      `}
    >
      <div className="shrink-0">{item.icon}</div>
      <span className="text-sm font-semibold whitespace-nowrap">{item.label}</span>
    </Link>
  );
}

function MobileGroup({
  group,
  pathname,
  isOpen,
  onToggle,
  alignment,
}: {
  group: (typeof navGroups)[number];
  pathname: string;
  isOpen: boolean;
  onToggle: () => void;
  alignment: "left" | "center" | "right";
}) {
  const hasActive = group.items.some((i) => pathname === i.href);

  // Determine popup alignment styles
  const alignmentStyles = 
    alignment === "left" ? { left: "-10px" } :
    alignment === "right" ? { right: "-10px" } :
    { left: "50%", transform: "translateX(-50%)" };

  return (
    <div className="relative flex flex-col items-center">
      {/* Child items — slide upward above the group button */}
      <div
        className={`
          absolute bottom-full mb-3 flex flex-col items-stretch gap-1.5
          transition-all duration-200 ease-out bg-surface-900 rounded-2xl p-2 shadow-2xl border border-surface-800
          ${
            isOpen
              ? "opacity-100 translate-y-0 pointer-events-auto"
              : "opacity-0 translate-y-3 pointer-events-none"
          }
        `}
        style={{ 
          transitionProperty: "opacity, transform",
          minWidth: "160px",
          ...alignmentStyles
        }}
      >
        {group.items.map((item, idx) => {
          const isActive = pathname === item.href;
          return (
            <div
              key={item.href}
              className="transition-all duration-200"
              style={{
                transitionDelay: isOpen
                  ? `${idx * 40}ms`
                  : `${(group.items.length - 1 - idx) * 30}ms`,
                transitionProperty: "opacity, transform",
                opacity: isOpen ? 1 : 0,
                transform: isOpen
                  ? "translateY(0)"
                  : `translateY(${(group.items.length - idx) * 8}px)`,
              }}
            >
              <MobileMenuItem item={item} isActive={isActive} onClick={onToggle} />
            </div>
          );
        })}
      </div>

      {/* Group trigger button */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={group.label}
        aria-expanded={isOpen}
        className={`
          relative flex flex-col items-center justify-center gap-1
          w-16 h-14 rounded-xl shrink-0 cursor-pointer
          transition-all duration-200
          ${
            hasActive && !isOpen
              ? "text-brand-400"
              : isOpen
                ? "text-white"
                : "text-surface-400 hover:text-white"
          }
        `}
      >
        {/* Backgrounds */}
        {isOpen && (
          <div className="absolute inset-0 bg-surface-700 rounded-xl" />
        )}
        {hasActive && !isOpen && (
          <div className="absolute inset-0 bg-brand-600/20 ring-1 ring-brand-500/40 rounded-xl" />
        )}

        <div
          className={`relative z-10 transition-transform duration-200 ${isOpen ? "rotate-45 scale-90 mb-1" : "rotate-0"}`}
        >
          {group.icon}
        </div>
        
        {!isOpen && (
          <span className="relative z-10 text-[10px] font-medium leading-none tracking-wide text-center">
            {group.label}
          </span>
        )}

        {/* Active dot */}
        {hasActive && !isOpen && (
          <span className="absolute top-1.5 right-2 w-1.5 h-1.5 rounded-full bg-brand-400 z-10" />
        )}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Sidebar
───────────────────────────────────────────── */
export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { canAccess, userName, role } = useRole();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  const toggle = (id: string) =>
    setOpenGroup((prev) => (prev === id ? null : id));

  // Close open group when tapping backdrop area
  const closeAll = () => setOpenGroup(null);

  const filteredNavGroups = navGroups.map(group => {
    return {
      ...group,
      items: group.items.filter(item => canAccess(item.href))
    };
  }).filter(group => group.items.length > 0);

  return (
    <>
      {/* Mobile backdrop (only when a group is open) */}
      {openGroup && (
        <div
          className="fixed inset-0 z-[98] bg-black/40 md:hidden"
          onClick={closeAll}
          aria-hidden="true"
        />
      )}

      <aside
        className="
        fixed bottom-0 left-0 w-full h-16
        md:top-0 md:h-screen md:w-[72px]
        bg-surface-900
        flex flex-row md:flex-col
        items-center
        justify-between md:justify-start
        md:py-4 px-3 md:px-0
        z-[100]
        border-t border-surface-800 md:border-t-0 md:border-r
      "
      >
        {/* Logo — desktop only */}
        <div className="hidden md:flex w-10 h-10 items-center justify-center mb-6 shrink-0">
          <img src="/images/icon.png" alt="Logo" className="w-full h-full object-contain drop-shadow-md" />
        </div>

        {/* ── DESKTOP: flat grouped list ── */}
        <nav
          className="hidden md:flex flex-col gap-4 items-center w-full"
          aria-label="Main navigation"
        >
          {filteredNavGroups.map((group, gi) => (
            <React.Fragment key={group.id}>
              <div className="flex flex-col gap-1.5 items-center">
                {group.items.map((item) => (
                  <NavItem
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    icon={item.icon}
                    isActive={pathname === item.href}
                  />
                ))}
              </div>
              {gi < filteredNavGroups.length - 1 && (
                <div className="w-8 h-px bg-surface-800 rounded-full" />
              )}
            </React.Fragment>
          ))}
        </nav>

        {/* ── MOBILE: group icon row ── */}
        <nav
          className="flex md:hidden flex-row gap-1 items-center w-full justify-between"
          aria-label="Main navigation"
        >
          {navGroups.map((group, index) => {
            const alignment = index === 0 ? "left" : index === navGroups.length - 1 ? "right" : "center";
            return (
              <MobileGroup
                key={group.id}
                group={group}
                pathname={pathname}
                isOpen={openGroup === group.id}
                onToggle={() => toggle(group.id)}
                alignment={alignment}
              />
            );
          })}
        </nav>

        {/* Bottom logout — desktop only */}
        <div className="hidden md:flex mt-auto">
          <button
            type="button"
            id="sidebar-logout"
            title="Keluar"
            aria-label="Keluar"
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
              router.refresh();
            }}
            className="w-10 h-10 rounded-full bg-surface-700 hover:bg-red-900/60 flex items-center
              justify-center text-surface-300 hover:text-red-400 text-sm font-semibold
              transition-colors cursor-pointer group/logout relative"
          >
            {/* Logout icon */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {/* Tooltip */}
            <span className="absolute left-full ml-3 px-2.5 py-1 rounded-lg text-xs font-medium
              bg-surface-800 text-white whitespace-nowrap z-50
              opacity-0 pointer-events-none group-hover/logout:opacity-100
              transition-opacity duration-200 shadow-lg">
              Keluar
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
