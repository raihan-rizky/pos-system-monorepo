"use client";

import Link from "next/link";
import { useRole } from "@/components/providers/RoleProvider";

export function MemberPricingGuidance() {
  const { role } = useRole();

  return (
    <aside className="space-y-1 rounded-xl border border-surface-200 bg-surface-50 px-3 py-2.5 text-xs text-surface-600 sm:col-span-2">
      <p>Harga Agen dan Dinas mengikuti harga jual sampai Anda mengisi harga manual.</p>
      {role === "OWNER" ? (
        <p>
          Untuk diskon atau tambahan otomatis, gunakan Harga Khusus.{" "}
          <Link href="/products?tab=special-prices" className="inline-flex min-h-11 items-center font-semibold text-brand-700 underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
            Atur diskon / tambahan
          </Link>
        </p>
      ) : (
        <p>Minta Owner mengatur diskon atau tambahan otomatis di Produk → Harga Khusus.</p>
      )}
    </aside>
  );
}
