"use client";

import React, { useState } from "react";
import { HelpCircle, ShieldCheck, ShoppingCart, Truck, Package, Users, Warehouse } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<Role>(currentRole);

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
        </div>

        {/* Content Layout */}
        <div className="flex flex-col sm:flex-row gap-6">
          {isSuperUser && (
            <nav className="flex sm:flex-col gap-1 sm:w-48 shrink-0 overflow-x-auto">
              {ALL_ROLES.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 px-6 sm:px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-all duration-150 cursor-pointer w-full text-left whitespace-nowrap
                    ${activeTab === tab.id
                      ? "bg-white shadow border border-surface-200 text-brand-600"
                      : "text-surface-600 hover:bg-white/60 hover:text-surface-900"
                    }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          )}

          <div className="flex-1">
            <HelpContent targetRole={isSuperUser ? activeTab : currentRole} />
          </div>
        </div>

      </div>
    </div>
  );
}
