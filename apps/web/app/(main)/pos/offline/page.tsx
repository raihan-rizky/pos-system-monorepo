import Link from "next/link";
import OfflineSyncTab from "@/components/settings/OfflineSyncTab";

export default function PosOfflinePage() {
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <Link href="/pos" className="inline-flex min-h-10 items-center text-sm font-semibold text-brand-700">
        Kembali ke POS
      </Link>
      <OfflineSyncTab ownOnly />
    </main>
  );
}
