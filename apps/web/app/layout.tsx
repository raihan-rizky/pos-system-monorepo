import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { cookies } from "next/headers";
import type { Role } from "@/lib/rbac/permissions";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import { buildDefaultRolePermissions } from "@/features/rbac/helpers/rbac-core";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "POS System - Toko Percetakan & ATK",
  description:
    "Sistem Point of Sale untuk toko percetakan dan alat tulis kantor. Kelola penjualan, stok, dan laporan dengan mudah.",
  keywords: ["POS", "point of sale", "percetakan", "ATK", "kasir"],
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: "/images/favicon.png", type: "image/png" }],
    apple: "/images/favicon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "POS ATK",
  },
};

export const viewport: Viewport = {
  themeColor: "#0c98e9",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const role = (cookieStore.get("x-pos-role")?.value as Role) || null;
  const userId = cookieStore.get("x-pos-user-id")?.value || null;
  // Decode URI component since it might have spaces
  const rawUserName = cookieStore.get("x-pos-user-name")?.value;
  const userName = rawUserName ? decodeURIComponent(rawUserName) : null;
  const permissions =
    process.env.E2E_AUTH_BYPASS === "1"
      ? buildDefaultRolePermissions()
      : await getGlobalRolePermissions().catch((error) => {
          console.error("[RootLayout] Failed to load RBAC settings", error);
          return buildDefaultRolePermissions();
        });

  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head />
      <body className="antialiased">
        <Providers role={role} userId={userId} userName={userName} permissions={permissions}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
