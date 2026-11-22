import HistoryClientPage from "./HistoryClientPage";
import Link from "next/link";
import { ReceiptHistoryClient } from "@/features/transaction-history/components/ReceiptHistoryClient";
import { parseReceiptHistoryParams } from "@/features/transaction-history/helpers/receipt-history";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const context = parseReceiptHistoryParams(params);
  if (context.status === "valid") return <ReceiptHistoryClient context={context} />;
  if (context.status === "invalid") return <main className="p-6"><p role="alert">Filter penerimaan tidak valid.</p><Link className="mt-4 inline-block text-blue-700 underline" href="/history">Kembali ke Riwayat</Link></main>;
  return <HistoryClientPage initialSearch={typeof params.search === "string" ? params.search : ""} />;
}
