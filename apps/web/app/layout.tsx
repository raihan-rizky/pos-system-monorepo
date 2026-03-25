import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "POS System - Toko Percetakan & ATK",
  description:
    "Sistem Point of Sale untuk toko percetakan dan alat tulis kantor. Kelola penjualan, stok, dan laporan dengan mudah.",
  keywords: ["POS", "point of sale", "percetakan", "ATK", "kasir"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
