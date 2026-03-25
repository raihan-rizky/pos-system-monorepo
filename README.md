# 🖨️ POS System — Toko Percetakan & ATK

Sistem Point of Sale (POS) untuk toko percetakan dan alat tulis kantor. Dibangun dengan arsitektur monorepo, scalable dari 4 user hingga multi-cabang.

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Monorepo** | Turborepo + pnpm |
| **Frontend** | Next.js 15 + React 19 |
| **Styling** | Tailwind CSS |
| **Database** | PostgreSQL (Supabase) |
| **ORM** | Prisma |
| **State** | React Query (TanStack) |
| **Realtime** | Supabase Realtime |

## 📁 Struktur Proyek

```
pos-system-monorepo/
├── apps/
│   ├── web/          # POS Kasir + Dashboard (port 3000)
│   └── admin/        # Admin Panel [coming soon] (port 3001)
├── packages/
│   ├── ui/           # Shared UI components
│   ├── db/           # Prisma schema + client
│   └── config/       # Shared ESLint, Tailwind, TSConfig
└── scripts/          # Setup & deploy scripts
```

## 🚀 Quick Start

### Prerequisites

- Node.js v18+
- pnpm v9+
- Supabase account

### Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Setup environment variables
# Copy .env.example to .env in:
#   - packages/db/.env
#   - apps/web/.env.local
# Fill in your Supabase database password

# 3. Generate Prisma client
pnpm db:generate

# 4. Push schema to database
pnpm db:push

# 5. (Optional) Seed data
pnpm db:seed

# 6. Start development
pnpm dev
```

### Environment Variables

Get your database password from **Supabase Dashboard → Settings → Database → Connection String**.

| Variable | Where | Description |
|----------|-------|-------------|
| `DATABASE_URL` | `packages/db/.env` | Pooled connection string (port 6543) |
| `DIRECT_URL` | `packages/db/.env` | Direct connection string (port 5432) |
| `NEXT_PUBLIC_SUPABASE_URL` | `apps/web/.env.local` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `apps/web/.env.local` | Supabase anon/public key |

## 📋 Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development |
| `pnpm build` | Build all apps |
| `pnpm lint` | Lint all packages |
| `pnpm db:push` | Push Prisma schema to DB |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:seed` | Seed database with sample data |

## 🗃️ Database Schema

- **User** — Owner, Manager, Cashier, Admin (with PIN login)
- **Store** — Multi-branch support
- **Category** — Alat Tulis, Kertas, Tinta, Jasa Cetak, dll.
- **Product** — SKU, barcode, unit (pcs/rim/lembar/gsm/roll/box/etc.)
- **Transaction** — Invoice, payment methods (Cash/QRIS/Debit/Transfer)
- **TransactionItem** — Line items with price snapshot
- **InventoryLog** — Stock in/out/adjustment tracking

## 📱 Features

### POS Kasir (`/pos`)
- 🔍 Search produk by name, SKU, barcode
- 🏷️ Filter by kategori dengan horizontal scroll
- 🛒 Cart dengan quantity control & responsive Floating Action Button (FAB)
- 💳 Pembayaran (Tunai, QRIS, Debit, Transfer)
- 🧾 Auto invoice number
- 📦 Auto stock deduction
- 📱 **Responsive UI** (Desktop Sidebar & Mobile Bottom Navigation)

### Dashboard (`/dashboard`)
- 💰 Revenue hari ini & bulan ini
- 🏆 Produk terlaris
- ⚠️ Alert stok rendah
- 📋 Riwayat transaksi

## 📄 License

Private — Internal use only.
