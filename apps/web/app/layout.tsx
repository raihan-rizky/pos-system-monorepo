import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { cookies } from "next/headers";
import type { Role } from "@/lib/rbac/permissions";
import { getGlobalRolePermissions } from "@/features/rbac/helpers/rbac-server";
import { buildDefaultRolePermissions, buildDeniedRolePermissions } from "@/features/rbac/helpers/rbac-core";
import { buildAuthorizationFingerprint } from "@/features/rbac/helpers/authorization-fingerprint";

import { getLogger } from "@/lib/logger";

const log = getLogger("layout:root");
const inter = localFont({
  src: [{ path: "../public/fonts/InterVariable.woff2", weight: "300 800", style: "normal" }],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = localFont({
  src: [{ path: "../public/fonts/JetBrainsMono[wght].ttf", weight: "400 600", style: "normal" }],
  display: "swap",
  variable: "--font-mono",
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
  const storeId = cookieStore.get("x-pos-store-id")?.value || null;
  // Decode URI component since it might have spaces
  const rawUserName = cookieStore.get("x-pos-user-name")?.value;
  const userName = rawUserName ? decodeURIComponent(rawUserName) : null;
  let permissionsVerified = true;
  const permissions =
    process.env.NODE_ENV !== "production" && process.env.E2E_AUTH_BYPASS === "1"
      ? buildDefaultRolePermissions()
      : await getGlobalRolePermissions().catch((error) => {
          log.error("[RootLayout] Failed to load RBAC settings", error);
          permissionsVerified = false;
          return buildDeniedRolePermissions();
        });
  const authorizationFingerprint = buildAuthorizationFingerprint(role, permissions);

  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <head />
      <body className="antialiased" suppressHydrationWarning>
        <Providers
          role={role}
          userId={userId}
          userName={userName}
          storeId={storeId}
          authorizationFingerprint={authorizationFingerprint}
          permissions={permissions}
          permissionsVerified={permissionsVerified}
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
