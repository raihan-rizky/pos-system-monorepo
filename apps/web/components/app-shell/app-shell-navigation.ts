import {
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  Calculator,
  CircleDollarSign,
  Grid2X2,
  HelpCircle,
  MessageCircle,
  Package,
  PanelsTopLeft,
  Settings,
  Tags,
  Truck,
  User,
  Users,
  WalletCards,
  type LucideIcon,
} from "lucide-react";

export type AppShellNavItem = {
  href: string;
  id: string;
  label: string;
  icon: LucideIcon;
};

export type AppShellNavGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  description: string;
  items: AppShellNavItem[];
};

export const APP_SHELL_NAV_GROUPS: AppShellNavGroup[] = [
  {
    id: "operations",
    label: "Operasi",
    icon: Settings,
    description: "Kelola operasional kasir, dashboard, dan riwayat harian.",
    items: [
      { href: "/dashboard", id: "dashboard", label: "Dashboard", icon: Grid2X2 },
      { href: "/pos", id: "pos", label: "Kasir", icon: Calculator },
      { href: "/history", id: "history", label: "Riwayat", icon: WalletCards },
    ],
  },
  {
    id: "catalog",
    label: "Katalog",
    icon: BookOpen,
    description: "Kelola inventaris produk dan papan status antrean produksi.",
    items: [
      { href: "/products", id: "products", label: "Produk", icon: Package },
      { href: "/suppliers", id: "suppliers", label: "Supplier", icon: Truck },
      { href: "/production", id: "production", label: "Produksi", icon: PanelsTopLeft },
    ],
  },
  {
    id: "inventory",
    label: "Manajemen Inventaris",
    icon: Package,
    description: "Kelola stok masuk, tugas harian, mingguan, pemakaian internal, dan rekap stok.",
    items: [
      { href: "/inventory", id: "inventory", label: "Inventaris", icon: Package },
    ],
  },
  {
    id: "finance",
    label: "Keuangan",
    icon: CircleDollarSign,
    description: "Pantau revenue, profit, metode pembayaran, piutang, dan shift kas.",
    items: [
      { href: "/keuangan", id: "finance", label: "Keuangan", icon: CircleDollarSign },
      { href: "/financial-report", id: "financial-report", label: "Laporan Keuangan", icon: BarChart3 },
    ],
  },
  {
    id: "crm",
    label: "Pelanggan",
    icon: User,
    description: "Data relasi pelanggan tetap dan pencatatan agen pemasaran.",
    items: [
      { href: "/customers", id: "customers", label: "Pelanggan", icon: Users },
      { href: "/salespersons", id: "salespersons", label: "Sales", icon: Tags },
    ],
  },
  {
    id: "utils",
    label: "Lainnya",
    icon: Settings,
    description: "Fitur live chat WhatsApp, status shift kasir, dan konfigurasi umum.",
    items: [
      { href: "/wa", id: "wa", label: "WA Chat", icon: MessageCircle },
      { href: "/shift", id: "shift", label: "Shift Kasir", icon: BriefcaseBusiness },
      { href: "/settings", id: "settings", label: "Pengaturan", icon: Settings },
      { href: "/help", id: "help", label: "Bantuan", icon: HelpCircle },
    ],
  },
];

export const APP_SHELL_NAV_ITEMS = APP_SHELL_NAV_GROUPS.flatMap((group) => group.items);
