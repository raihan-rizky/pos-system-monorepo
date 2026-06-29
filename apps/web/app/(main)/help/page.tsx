"use client";

import React, { useState, useMemo } from "react";
import { HelpCircle, Search, ShieldCheck, ShoppingCart, Truck, Users, Warehouse, X, Bot } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useRole } from "@/components/providers/RoleProvider";
import HelpContent from "@/features/help-documentation/components/HelpContent";
import type { Role } from "@/features/rbac/helpers/rbac-core";

const ALL_ROLES: { id: Role; label: string; icon: React.ReactNode }[] = [
  { id: "OWNER", label: "Owner", icon: <ShieldCheck className="w-4 h-4" /> },
  { id: "ADMIN", label: "Admin", icon: <Users className="w-4 h-4" /> },
  { id: "CASHIER", label: "Kasir", icon: <ShoppingCart className="w-4 h-4" /> },
  { id: "SALES", label: "Sales", icon: <Truck className="w-4 h-4" /> },
  { id: "INVENTORY", label: "Gudang / Inventory", icon: <Warehouse className="w-4 h-4" /> },
];

export default function HelpPage() {
  const { role } = useRole();
  const currentRole = role || "OWNER";
  const isSuperUser = currentRole === "OWNER" || currentRole === "ADMIN";
  const [activeTab, setActiveTab] = useState<Role | "AI_ASSISTANT">(currentRole);
  const [searchQuery, setSearchQuery] = useState("");

  const visibleTabs = useMemo(() => {
    const rolesMapped = ALL_ROLES.map((r) => ({
      id: r.id as Role | "AI_ASSISTANT",
      label: r.label,
      icon: r.icon,
    }));
    const aiTab = { id: "AI_ASSISTANT" as const, label: "AI Assistant", icon: <Bot className="w-4 h-4" /> };
    if (isSuperUser) {
      return [...rolesMapped, aiTab];
    }
    const currentTab = rolesMapped.find((tab) => tab.id === currentRole);
    return currentTab ? [currentTab, aiTab] : [aiTab];
  }, [currentRole, isSuperUser]);

  return (
    <div className="flex-1 overflow-y-auto w-full bg-surface-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-surface-900 tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-sm">
              <HelpCircle className="w-5 h-5 text-white" />
            </div>
            Dokumentasi Bantuan
          </h1>
          <p className="text-sm text-surface-500 mt-1">
            Panduan lengkap penggunaan fitur sesuai dengan peran (role) Anda.
          </p>

          {/* Search Bar */}
          <div className="relative mt-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-surface-400" />
              <input
                type="text"
                placeholder="Cari panduan, fitur, atau kata kunci..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-12 py-3 rounded-xl border border-surface-200 bg-white text-surface-900 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Content Layout */}
        <div className="flex flex-col gap-6">
          <nav className="flex flex-row flex-nowrap sm:flex-wrap gap-2.5 overflow-x-auto pb-1 [-ms-overflow-style:'none'] [scrollbar-width:'none'] [&::-webkit-scrollbar]:hidden">
            {visibleTabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center justify-center gap-2 px-5 py-2 min-h-[40px] rounded-full text-sm font-semibold cursor-pointer whitespace-nowrap transition-colors duration-200
                    ${isActive
                      ? "text-white"
                      : "bg-white border border-surface-200 text-surface-600 hover:bg-surface-50 hover:text-surface-900 shadow-sm"
                    }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="activeHelpTab"
                      className="absolute inset-0 bg-brand-600 rounded-full border border-brand-700 shadow-md z-0"
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-2">
                    {tab.icon}
                    <span>{tab.label}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="w-full overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              >
                <HelpContent targetRole={activeTab} searchQuery={searchQuery} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  );
}
