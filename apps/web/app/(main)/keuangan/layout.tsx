import React from "react";
import { KeuanganTopBar } from "@/features/keuangan/components/KeuanganTopBar";

export default function KeuanganLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <KeuanganTopBar />
      <main className="flex-1 overflow-y-auto bg-surface-50">{children}</main>
    </div>
  );
}
