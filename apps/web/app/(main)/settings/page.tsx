"use client";

import React, { useState } from "react";
import { Bell, RefreshCw, Settings, Store, MessageCircle, ShieldCheck } from "lucide-react";
import StoreInfoTab from "@/components/settings/StoreInfoTab";
import WhatsAppTab from "@/components/settings/WhatsAppTab";
import OfflineSyncTab from "@/components/settings/OfflineSyncTab";
import NotificationsTab from "@/components/settings/NotificationsTab";
import RbacTab from "@/components/settings/RbacTab";
import { useRole } from "@/components/providers/RoleProvider";

type Tab = "store" | "whatsapp" | "rbac" | "notifications" | "offline";

const TABS: { id: Tab; label: string; icon: React.ReactNode; ownerOnly?: boolean }[] = [
  { id: "store", label: "Info Toko", icon: <Store className="w-4 h-4" /> },
  { id: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="w-4 h-4" /> },
  { id: "rbac", label: "RBAC", icon: <ShieldCheck className="w-4 h-4" />, ownerOnly: true },
  { id: "notifications", label: "Notifikasi", icon: <Bell className="w-4 h-4" /> },
  { id: "offline", label: "Offline Sync", icon: <RefreshCw className="w-4 h-4" /> },
];

export default function SettingsPage() {
  const { role } = useRole();
  const [activeTab, setActiveTab] = useState<Tab>("store");
  const visibleTabs = TABS.filter((tab) => !tab.ownerOnly || role === "OWNER");

  return (
    <div className="flex-1 overflow-y-auto w-full bg-surface-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-surface-900 tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-sm">
              <Settings className="w-5 h-5 text-white" />
            </div>
            Pengaturan
          </h1>
          <p className="text-sm text-surface-500 mt-1">Kelola profil toko dan integrasi yang dipakai.</p>
        </div>

        {/* Layout: sidebar tabs + content */}
        <div className="flex flex-col sm:flex-row gap-6">

          {/* Tab Pills */}
          <nav className="flex sm:flex-col gap-1 sm:w-48 shrink-0 overflow-x-scroll">
            {visibleTabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-6 sm:px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-all duration-150 cursor-pointer w-full text-left
                  ${activeTab === tab.id
                    ? "bg-white shadow border border-surface-200 text-brand-600"
                    : "text-surface-600 hover:bg-white/60 hover:text-surface-900"
                  }`}
              >
                {tab.icon}
                <h1 className="sm:block hidden">{tab.label}</h1>
              </button>
            ))}
          </nav>

          {/* Content Panel */}
          <div className="flex-1 bg-white border border-surface-100 rounded-2xl shadow-sm p-6">
            {activeTab === "store" && <StoreInfoTab />}
            {activeTab === "whatsapp" && <WhatsAppTab />}
            {activeTab === "rbac" && role === "OWNER" && <RbacTab />}
            {activeTab === "notifications" && <NotificationsTab />}
            {activeTab === "offline" && <OfflineSyncTab />}
          </div>
        </div>

      </div>
    </div>
  );
}
