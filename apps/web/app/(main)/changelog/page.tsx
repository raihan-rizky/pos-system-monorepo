import type { Metadata } from "next";
import { ChangelogPage } from "@/features/changelog/components/ChangelogPage";

export const metadata: Metadata = { title: "Catatan Perubahan | Toko Teladan" };

export default function Page() {
  return <ChangelogPage />;
}
