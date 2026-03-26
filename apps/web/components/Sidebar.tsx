"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  {
    href: "/pos",
    label: "Kasir",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8" />
        <path d="M12 17v4" />
        <path d="M7 8h2" /><path d="M15 8h2" />
        <path d="M7 12h2" /><path d="M15 12h2" />
        <path d="M11 8h2" /><path d="M11 12h2" />
      </svg>
    ),
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    href: "/history",
    label: "History",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 8v4l3 3" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
  {
    href: "/shift",
    label: "Shift Kasir",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
  },
  {
    href: "/wa",
    label: "WA Chat",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed bottom-0 left-0 w-full h-16 md:top-0 md:h-screen md:w-[72px] bg-surface-900 flex flex-row md:flex-col items-center justify-around md:justify-start md:py-4 z-[100]">
      {/* Logo - Hidden on mobile */}
      <div className="hidden md:flex w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-accent-500 items-center justify-center mb-4 shadow-glow">
        <span className="text-white font-extrabold text-lg">P</span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-row md:flex-col gap-1 items-center justify-around md:justify-start w-full md:w-auto px-2 md:px-0">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                relative flex flex-col md:flex-col items-center justify-center
                w-12 h-12 rounded-xl
                transition-all duration-200 group
                ${isActive
                  ? "bg-brand-600 text-white md:shadow-glow"
                  : "text-surface-400 hover:text-white md:hover:bg-surface-800"
                }
              `}
            >
              {item.icon}
              {/* Tooltip on desktop */}
              <span className={`
                hidden md:block absolute left-full ml-3 px-2.5 py-1 rounded-lg text-xs font-medium
                opacity-50 pointer-events-none group-hover:opacity-100
                transition-opacity duration-200 shadow-lg
              `}>
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom - user (Hidden on mobile) */}
      <div className="hidden md:flex mt-auto">
        <div className="w-10 h-10 rounded-full bg-surface-700 flex items-center justify-center text-surface-300 text-sm font-semibold">
          K1
        </div>
      </div>
    </aside>
  );
}
