"use client";

import React, { useState } from "react";
import { Settings, Store, MessageCircle } from "lucide-react";
import StoreInfoTab from "@/components/settings/StoreInfoTab";
import WhatsAppTab from "@/components/settings/WhatsAppTab";

type Tab = "store" | "whatsapp";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "store", label: "Store Info", icon: <Store className="w-4 h-4" /> },
  { id: "whatsapp", label: "WhatsApp", icon: <MessageCircle className="w-4 h-4" /> },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("store");

  return (
    <div className="flex-1 overflow-y-auto w-full bg-surface-50 min-h-screen">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold text-surface-900 tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shadow-sm">
              <Settings className="w-5 h-5 text-white" />
            </div>
            Settings
          </h1>
          <p className="text-sm text-surface-500 mt-1">Manage your store profile and integrations.</p>
        </div>

        {/* Layout: sidebar tabs + content */}
        <div className="flex flex-col sm:flex-row gap-6">

          {/* Tab Pills */}
          <nav className="flex sm:flex-col gap-1 sm:w-48 shrink-0">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-semibold transition-all duration-150 cursor-pointer w-full text-left
                  ${activeTab === tab.id
                    ? "bg-white shadow border border-surface-200 text-brand-600"
                    : "text-surface-600 hover:bg-white/60 hover:text-surface-900"
                  }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Content Panel */}
          <div className="flex-1 bg-white border border-surface-100 rounded-2xl shadow-sm p-6">
            {activeTab === "store" && <StoreInfoTab />}
            {activeTab === "whatsapp" && <WhatsAppTab />}
          </div>
        </div>

      </div>
    </div>
  );
}
