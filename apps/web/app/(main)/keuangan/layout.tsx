import React from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/rbac/guard";
import { canAccessPage } from "@/lib/rbac/permissions";
import { KeuanganTopBar } from "@/features/keuangan/components/KeuanganTopBar";

export default async function KeuanganLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user || !canAccessPage(user.role as never, "/keuangan")) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <KeuanganTopBar />
      <main className="flex-1 overflow-y-auto bg-surface-50">{children}</main>
    </div>
  );
}
