import React, { Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";
import { DeferredAssistantWidget } from "@/features/ai-assistant/components/DeferredAssistantWidget";
import MainLoading from "./loading";
import { NotificationCenter } from "@/features/notifications/components/NotificationCenter";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-surface-50">
      <Sidebar />
      <div className="relative flex flex-1 flex-col overflow-x-auto overflow-y-hidden pb-16 md:pb-0 min-w-0">
        <div
          className="app-page-loop pointer-events-none absolute right-5 top-5 z-0 h-8 w-8 opacity-50 md:right-8 md:top-7"
          aria-hidden="true"
        >
          <span className="app-page-loop-dot app-page-loop-dot-primary" />
          <span className="app-page-loop-dot app-page-loop-dot-secondary" />
        </div>
        <Suspense fallback={<MainLoading />}>
          {children}
        </Suspense>
      </div>
      <NotificationCenter />
      <DeferredAssistantWidget />
    </div>
  );
}
