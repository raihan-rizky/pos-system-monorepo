import React, { Suspense } from "react";
import { Sidebar } from "@/components/Sidebar";
import { DeferredAssistantWidget } from "@/features/ai-assistant/components/DeferredAssistantWidget";
import MainLoading from "./loading";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-surface-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-x-auto overflow-y-hidden pb-16 md:pb-0 min-w-0">
        <Suspense fallback={<MainLoading />}>
          {children}
        </Suspense>
      </div>
      <DeferredAssistantWidget />
    </div>
  );
}
