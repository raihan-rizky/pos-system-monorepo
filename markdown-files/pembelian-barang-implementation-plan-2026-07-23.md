# Pembelian Barang Supplier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menambahkan tab Pembelian Barang Supplier dengan pengajuan dari Daftar Belanja approved, review/approval per produk, update HPP opsional per produk, Pengeluaran otomatis saat final approval, rejection yang dapat diajukan ulang, dan tanpa mutasi stok.

**Architecture:** Gunakan bounded feature baru `goods-purchases` dengan model header/item terpisah, service untuk validasi domain, repository Prisma untuk transaksi atomik, route API tipis, serta React Query untuk cache client. Daftar Belanja tetap menjadi dokumen planning; Pembelian Barang menjadi transaksi aktual; Pengeluaran baru dibuat saat seluruh item Pembelian disetujui.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma/PostgreSQL, Zod 4, TanStack React Query 5, Vitest, `@pos/ui`.

## Global Constraints

- Seluruh create, edit, approve, remove, reject, dan finalisasi Pembelian Barang tidak boleh mengubah `Product.stock`, `ProductStockGroup.baseStock`, atau membuat `InventoryLog`.
- Daftar Belanja approved hanya menjadi sumber planning dan estimasi; approval Daftar Belanja tidak lagi membuat Pengeluaran.
- Harga dan total uang disimpan sebagai `Decimal(12, 2)` dan dihitung ulang server-side.
- User-visible copy memakai bahasa Indonesia yang ramah.
- Approval dan reject memakai permission terpisah; default hanya OWNER karena seluruh editable role bernilai `false`.
- HPP hanya berubah saat finalisasi Pembelian dan hanya untuk item dengan `updateMasterHpp = true`.
- Produk tambahan hanya boleh berupa varian satuan besar: `unitMultiplierToBase > 1` atau unit yang dinormalisasi ke dus, box, pak, pack, krat, karton, bal, atau sak.
- Pembelian harus menyisakan minimal satu item.
- Produk yang dihapus benar-benar dihapus tanpa audit trail.
- API wajib menolak user tanpa `storeId`; jangan memakai fallback tenant seperti `"store-main"`.
- Implementasi wajib TDD: test gagal, implementasi minimal, test lulus, lalu commit per task.
- Jangan menjalankan `pnpm build`, `pnpm dev`, atau menghentikan development server milik user.
- Jangan menambah dependency baru.
- Pertahankan perubahan user yang tidak terkait di `apps/web/app/providers.tsx`, `apps/web/lib/number-input-guard.ts`, dan `apps/web/lib/__tests__/number-input-guard.test.ts`.
- Dokumentasi feature disimpan di `markdown-files` dan Bantuan serta workflow AI Assistant wajib diperbarui.

---

## File Structure

### Database

- Modify `packages/db/prisma/schema.prisma`: enum, model, relations, dan relation Pengeluaran.
- Create `packages/db/prisma/migrations/20260723_add_goods_purchases/migration.sql`: DDL lengkap untuk Pembelian Barang.

### Feature domain and server

- Create `apps/web/features/suppliers/goods-purchases/types/goods-purchase.ts`: kontrak domain/client.
- Create `apps/web/features/suppliers/goods-purchases/helpers/goods-purchase-core.ts`: numbering, money calculation, HPP comparison, large-unit detection, dan pending counter.
- Create `apps/web/features/suppliers/goods-purchases/repositories/goods-purchases-repository.ts`: semua query Prisma dan transaction boundary.
- Create `apps/web/features/suppliers/goods-purchases/services/goods-purchases-service.ts`: validasi use case dan mapping domain error.
- Create `apps/web/features/suppliers/goods-purchases/index.ts`: public exports.

### API

- Create `apps/web/app/api/suppliers/goods-purchases/route.ts`: list dan create.
- Create `apps/web/app/api/suppliers/goods-purchases/eligible-shopping-requests/route.ts`: sumber dropdown wajib.
- Create `apps/web/app/api/suppliers/goods-purchases/large-unit-products/route.ts`: pilihan produk tambahan.
- Create `apps/web/app/api/suppliers/goods-purchases/[id]/route.ts`: detail.
- Create `apps/web/app/api/suppliers/goods-purchases/[id]/reject/route.ts`: reject seluruh Pembelian.
- Create `apps/web/app/api/suppliers/goods-purchases/[id]/items/route.ts`: tambah item.
- Create `apps/web/app/api/suppliers/goods-purchases/[id]/items/[itemId]/route.ts`: edit dan remove item.
- Create `apps/web/app/api/suppliers/goods-purchases/[id]/items/[itemId]/approval/route.ts`: approve item dan kemungkinan finalisasi.

### Client and UI

- Create `apps/web/features/suppliers/goods-purchases/api/goods-purchases-api.ts`: fetch client.
- Create `apps/web/features/suppliers/goods-purchases/hooks/useGoodsPurchases.ts`: query, mutations, cache sync.
- Create `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseList.tsx`: history, filters, actions.
- Create `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseCreateModal.tsx`: form pengajuan.
- Create `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseDetailModal.tsx`: read-only detail.
- Create `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseApprovalModal.tsx`: review per item dan tambah item.
- Create `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseItemEditor.tsx`: form add/edit yang reusable.
- Create `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseRejectModal.tsx`: alasan reject wajib.
- Create `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseApprovedDialog.tsx`: popup sukses finalisasi.
- Modify `apps/web/features/suppliers/components/SupplierPageShell.tsx`: tab, deep link, dan modal create.

### Cross-feature integration

- Modify `apps/web/features/suppliers/shopping-requests/repositories/shopping-requests-repository.ts`: hapus auto-expense lama.
- Modify `apps/web/features/suppliers/shopping-requests/hooks/useShoppingRequests.ts`: hapus invalidasi finance dari approval Daftar Belanja.
- Modify `apps/web/features/rbac/helpers/rbac-core.ts` dan `rbac-settings-ui.ts`: permission baru.
- Create `apps/web/features/keuangan/helpers/automatic-expense.ts`: deteksi sumber otomatis secara DRY.
- Modify expense API, UI Keuangan, journal/report helpers, dan tests: sumber `GOODS_PURCHASE`.
- Modify `apps/web/lib/push-events.ts` dan `NotificationCenter.tsx`: notifikasi Pembelian Barang.
- Modify `apps/web/features/help-documentation/components/HelpContent.tsx`, AI help markdown, dan `workflow-catalog.ts`.

---

### Task 1: Add the database schema and migration

**Files:**
- Create: `packages/db/prisma/migrations/20260723_add_goods_purchases/migration.sql`
- Modify: `packages/db/prisma/schema.prisma:12-89`
- Modify: `packages/db/prisma/schema.prisma:122-176`
- Modify: `packages/db/prisma/schema.prisma:382-401`
- Modify: `packages/db/prisma/schema.prisma:756-810`
- Modify: `packages/db/prisma/schema.prisma:1315-1344`
- Modify: `packages/db/prisma/schema.prisma:1654-1669`
- Create: `apps/web/features/suppliers/goods-purchases/helpers/__tests__/goods-purchase-migration.test.ts`

**Interfaces:**
- Produces Prisma models `GoodsPurchase`, `GoodsPurchaseItem`.
- Produces enums `GoodsPurchaseStatus`, `GoodsPurchaseItemReviewStatus`.
- Produces nullable unique `Expense.goodsPurchaseId`.
- Produces unique active claim `GoodsPurchase.activeShoppingRequestKey`.

- [ ] **Step 1: Write the failing schema/migration test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(
  join(process.cwd(), "../../packages/db/prisma/schema.prisma"),
  "utf8",
);
const migration = readFileSync(
  join(
    process.cwd(),
    "../../packages/db/prisma/migrations/20260723_add_goods_purchases/migration.sql",
  ),
  "utf8",
);

describe("goods purchase persistence", () => {
  it("defines header, item review lifecycle, and expense relation", () => {
    expect(schema).toContain("model GoodsPurchase {");
    expect(schema).toContain("model GoodsPurchaseItem {");
    expect(schema).toContain("enum GoodsPurchaseStatus");
    expect(schema).toContain("enum GoodsPurchaseItemReviewStatus");
    expect(schema).toContain("activeShoppingRequestKey String?");
    expect(schema).toContain("goodsPurchaseId String?");
    expect(schema).toContain("@@unique([goodsPurchaseId, productId])");
  });

  it("creates a database-enforced active request claim", () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "pos_goods_purchases_activeShoppingRequestKey_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "pos_goods_purchase_items_goodsPurchaseId_productId_key"',
    );
    expect(migration).toContain(
      'CREATE UNIQUE INDEX "pos_expenses_goodsPurchaseId_key"',
    );
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run from `apps/web`:

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/goods-purchases/helpers/__tests__/goods-purchase-migration.test.ts
```

Expected: FAIL because the migration and models do not exist.

- [ ] **Step 3: Add the Prisma models and relations**

Add these exact domain fields; keep all existing relations:

```prisma
model GoodsPurchase {
  id                       String              @id @default(cuid())
  storeId                  String
  number                   String              @unique
  sequence                 Int
  shoppingRequestId        String
  activeShoppingRequestKey String?             @unique
  supplierId               String?
  supplierNameSnapshot     String
  status                   GoodsPurchaseStatus @default(PENDING)
  totalAmount              Decimal             @db.Decimal(12, 2)
  createdById              String
  createdByName            String?
  approvedById             String?
  approvedByName           String?
  rejectedById             String?
  rejectedByName           String?
  rejectionReason          String?
  approvedAt               DateTime?
  rejectedAt               DateTime?
  createdAt                DateTime            @default(now())
  updatedAt                DateTime            @updatedAt
  store                    Store               @relation(fields: [storeId], references: [id])
  shoppingRequest          ShoppingRequest     @relation(fields: [shoppingRequestId], references: [id], onDelete: Restrict)
  supplier                 Supplier?           @relation(fields: [supplierId], references: [id], onDelete: SetNull)
  createdBy                User                @relation("goods_purchase_creator", fields: [createdById], references: [id])
  approvedBy               User?               @relation("goods_purchase_approver", fields: [approvedById], references: [id])
  rejectedBy               User?               @relation("goods_purchase_rejector", fields: [rejectedById], references: [id])
  items                    GoodsPurchaseItem[]
  expense                  Expense?

  @@index([storeId, status, createdAt])
  @@index([shoppingRequestId, createdAt])
  @@index([supplierId, createdAt])
  @@map("pos_goods_purchases")
}

model GoodsPurchaseItem {
  id                      String                        @id @default(cuid())
  goodsPurchaseId         String
  shoppingRequestItemId   String?
  productId               String
  productNameSnapshot     String
  skuSnapshot             String
  unitSnapshot            String?
  unitMultiplierSnapshot  Float
  quantity                Float
  masterCostPriceSnapshot Decimal?                      @db.Decimal(12, 2)
  latestUnitPrice         Decimal                       @db.Decimal(12, 2)
  lineTotal               Decimal                       @db.Decimal(12, 2)
  updateMasterHpp         Boolean                       @default(false)
  reviewStatus            GoodsPurchaseItemReviewStatus @default(PENDING)
  approvedById            String?
  approvedByName          String?
  approvedAt              DateTime?
  createdAt               DateTime                      @default(now())
  updatedAt               DateTime                      @updatedAt
  goodsPurchase           GoodsPurchase                 @relation(fields: [goodsPurchaseId], references: [id], onDelete: Cascade)
  shoppingRequestItem     ShoppingRequestItem?           @relation(fields: [shoppingRequestItemId], references: [id], onDelete: SetNull)
  product                 Product                       @relation(fields: [productId], references: [id], onDelete: Restrict)
  approvedBy              User?                         @relation("goods_purchase_item_approver", fields: [approvedById], references: [id])

  @@unique([goodsPurchaseId, productId])
  @@index([goodsPurchaseId, reviewStatus])
  @@index([productId])
  @@index([shoppingRequestItemId])
  @@map("pos_goods_purchase_items")
}

enum GoodsPurchaseStatus {
  PENDING
  APPROVED
  REJECTED
}

enum GoodsPurchaseItemReviewStatus {
  PENDING
  APPROVED
}
```

Add the corresponding arrays to `User`, `Store`, `Product`, `Supplier`, `ShoppingRequest`, and `ShoppingRequestItem`. Add this relation to `Expense`:

```prisma
goodsPurchaseId String?        @unique
goodsPurchase   GoodsPurchase? @relation(fields: [goodsPurchaseId], references: [id], onDelete: Restrict)
```

Use these exact reverse relations:

```prisma
// User
goodsPurchasesCreated      GoodsPurchase[]     @relation("goods_purchase_creator")
goodsPurchasesApproved     GoodsPurchase[]     @relation("goods_purchase_approver")
goodsPurchasesRejected     GoodsPurchase[]     @relation("goods_purchase_rejector")
goodsPurchaseItemsApproved GoodsPurchaseItem[] @relation("goods_purchase_item_approver")

// Store
goodsPurchases GoodsPurchase[]

// Product
goodsPurchaseItems GoodsPurchaseItem[]

// Supplier
goodsPurchases GoodsPurchase[]

// ShoppingRequest
goodsPurchases GoodsPurchase[]

// ShoppingRequestItem
goodsPurchaseItems GoodsPurchaseItem[]
```

- [ ] **Step 4: Create the SQL migration**

The migration must create both enums and tables, all foreign keys shown in the Prisma schema, the three unique indexes asserted by the test, the three header indexes, the three item indexes, and nullable `pos_expenses.goodsPurchaseId`. Use `ON DELETE RESTRICT` for product, shopping request, expense, and required user relations; use `SET NULL` for optional supplier/approver/rejector/shopping-request-item relations; use `CASCADE` only from header to its items.

- [ ] **Step 5: Generate Prisma client and verify GREEN**

Run from repository root:

```powershell
pnpm.cmd db:generate
```

Run from `apps/web`:

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/goods-purchases/helpers/__tests__/goods-purchase-migration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260723_add_goods_purchases apps/web/features/suppliers/goods-purchases/helpers/__tests__/goods-purchase-migration.test.ts
git commit -m "feat: add goods purchase persistence"
```

---

### Task 2: Add domain types and pure calculation rules

**Files:**
- Create: `apps/web/features/suppliers/goods-purchases/types/goods-purchase.ts`
- Create: `apps/web/features/suppliers/goods-purchases/helpers/goods-purchase-core.ts`
- Create: `apps/web/features/suppliers/goods-purchases/helpers/__tests__/goods-purchase-core.test.ts`
- Create: `apps/web/features/suppliers/goods-purchases/index.ts`

**Interfaces:**
- Produces `buildGoodsPurchaseNumber(date, sequence): string`.
- Produces `calculateGoodsPurchaseLineTotal(quantity, price): number`.
- Produces `calculateGoodsPurchaseTotal(items): number`.
- Produces `hasMasterHppDifference(masterHpp, latestPrice): boolean`.
- Produces `isLargePurchaseUnit(input): boolean`.
- Produces `countPendingGoodsPurchaseItems(items): number`.
- Produces all API input/output types used by Tasks 5-10.

- [ ] **Step 1: Write failing helper tests**

```ts
import { describe, expect, it } from "vitest";
import {
  buildGoodsPurchaseNumber,
  calculateGoodsPurchaseLineTotal,
  calculateGoodsPurchaseTotal,
  countPendingGoodsPurchaseItems,
  hasMasterHppDifference,
  isLargePurchaseUnit,
} from "../goods-purchase-core";

describe("goods purchase core", () => {
  it("formats PB monthly numbers", () => {
    expect(buildGoodsPurchaseNumber(new Date("2026-07-23T00:00:00Z"), 7))
      .toBe("PB-202607-007");
  });

  it("rounds line and header money to two decimals", () => {
    expect(calculateGoodsPurchaseLineTotal(2.5, 1000.555)).toBe(2501.39);
    expect(calculateGoodsPurchaseTotal([
      { quantity: 2.5, latestUnitPrice: 1000.555 },
      { quantity: 1, latestUnitPrice: 500 },
    ])).toBe(3001.39);
  });

  it("detects HPP differences including a missing HPP", () => {
    expect(hasMasterHppDifference(null, 0)).toBe(true);
    expect(hasMasterHppDifference(10_000, 10_000)).toBe(false);
    expect(hasMasterHppDifference(10_000, 10_001)).toBe(true);
  });

  it("accepts multiplier and normalized package units", () => {
    expect(isLargePurchaseUnit({ unit: "pcs", unitMultiplierToBase: 12 })).toBe(true);
    expect(isLargePurchaseUnit({ unit: "KARTON", unitMultiplierToBase: 1 })).toBe(true);
    expect(isLargePurchaseUnit({ unit: "lembar", unitMultiplierToBase: 1 })).toBe(false);
  });

  it("counts only items that still need action", () => {
    expect(countPendingGoodsPurchaseItems([
      { reviewStatus: "PENDING" },
      { reviewStatus: "APPROVED" },
    ])).toBe(1);
  });
});
```

- [ ] **Step 2: Run helper tests and verify RED**

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/goods-purchases/helpers/__tests__/goods-purchase-core.test.ts
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement the pure helpers**

```ts
const LARGE_PURCHASE_UNITS = new Set([
  "dus",
  "box",
  "pak",
  "pack",
  "krat",
  "karton",
  "bal",
  "sak",
]);

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function buildGoodsPurchaseNumber(date: Date, sequence: number): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `PB-${year}${month}-${String(sequence).padStart(3, "0")}`;
}

export function calculateGoodsPurchaseLineTotal(
  quantity: number,
  latestUnitPrice: number,
): number {
  return roundMoney(quantity * latestUnitPrice);
}

export function calculateGoodsPurchaseTotal(
  items: Array<{ quantity: number; latestUnitPrice: number }>,
): number {
  return roundMoney(
    items.reduce(
      (sum, item) =>
        sum + calculateGoodsPurchaseLineTotal(item.quantity, item.latestUnitPrice),
      0,
    ),
  );
}

export function hasMasterHppDifference(
  masterHpp: number | null,
  latestPrice: number,
): boolean {
  return masterHpp === null || roundMoney(masterHpp) !== roundMoney(latestPrice);
}

export function isLargePurchaseUnit(input: {
  unit: string | null;
  unitMultiplierToBase: number;
}): boolean {
  const normalizedUnit = input.unit?.trim().toLocaleLowerCase("id-ID") ?? "";
  return input.unitMultiplierToBase > 1 || LARGE_PURCHASE_UNITS.has(normalizedUnit);
}

export function countPendingGoodsPurchaseItems(
  items: Array<{ reviewStatus: "PENDING" | "APPROVED" }>,
): number {
  return items.filter((item) => item.reviewStatus === "PENDING").length;
}
```

- [ ] **Step 4: Define exact shared types**

The type module must export:

```ts
export type GoodsPurchaseStatus = "PENDING" | "APPROVED" | "REJECTED";
export type GoodsPurchaseItemReviewStatus = "PENDING" | "APPROVED";

export type GoodsPurchaseActor = {
  id: string;
  name: string | null;
  storeId: string;
};

export type GoodsPurchaseItemInput = {
  productId: string;
  quantity: number;
  latestUnitPrice: number;
  updateMasterHpp: boolean;
};

export type CreateGoodsPurchaseInput = {
  shoppingRequestId: string;
  items: Array<GoodsPurchaseItemInput & { shoppingRequestItemId: string }>;
};

export type EditGoodsPurchaseItemInput = GoodsPurchaseItemInput;
export type AddGoodsPurchaseItemInput = GoodsPurchaseItemInput;

export type GoodsPurchaseItemRecord = {
  id: string;
  shoppingRequestItemId: string | null;
  productId: string;
  productName: string;
  sku: string;
  unit: string | null;
  unitMultiplierToBase: number;
  quantity: number;
  masterCostPriceSnapshot: number | null;
  latestUnitPrice: number;
  lineTotal: number;
  updateMasterHpp: boolean;
  reviewStatus: GoodsPurchaseItemReviewStatus;
  approvedByName: string | null;
  approvedAt: string | null;
};

export type GoodsPurchaseListItem = {
  id: string;
  number: string;
  shoppingRequestId: string;
  shoppingRequestNumber: string;
  supplierName: string;
  status: GoodsPurchaseStatus;
  itemCount: number;
  pendingItemCount: number;
  totalAmount: number;
  createdByName: string | null;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
};

export type GoodsPurchaseDetail = GoodsPurchaseListItem & {
  supplierId: string | null;
  approvedByName: string | null;
  rejectedByName: string | null;
  rejectionReason: string | null;
  items: GoodsPurchaseItemRecord[];
};

export type GoodsPurchaseMutationResult = {
  data: GoodsPurchaseDetail;
  finalized: boolean;
};
```

Also export `EligibleShoppingRequest`, `EligibleShoppingRequestItem`, `LargeUnitProductOption`, list filter, pagination, and response types with the fields defined in the design spec.

Use these exact definitions:

```ts
export type EligibleShoppingRequestItem = {
  shoppingRequestItemId: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string | null;
  unitMultiplierToBase: number;
  approvedQty: number;
  currentCostPrice: number | null;
};

export type EligibleShoppingRequest = {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  approvedAt: string | null;
  items: EligibleShoppingRequestItem[];
};

export type LargeUnitProductOption = {
  id: string;
  name: string;
  sku: string;
  unit: string | null;
  unitMultiplierToBase: number;
  costPrice: number | null;
  stockGroupId: string | null;
  stockGroupName: string | null;
};

export type GoodsPurchaseListParams = {
  q?: string;
  status?: GoodsPurchaseStatus;
  page?: number;
  limit?: number;
};

export type GoodsPurchasePagination = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type GoodsPurchaseListResponse = {
  data: GoodsPurchaseListItem[];
  pagination: GoodsPurchasePagination;
};
```

- [ ] **Step 5: Run tests and verify GREEN**

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/goods-purchases/helpers/__tests__/goods-purchase-core.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/features/suppliers/goods-purchases
git commit -m "feat: add goods purchase domain rules"
```

---

### Task 3: Add Owner-default approve and reject permissions

**Files:**
- Modify: `apps/web/features/rbac/helpers/rbac-core.ts:56-75`
- Modify: `apps/web/features/rbac/helpers/rbac-core.ts:202-231`
- Modify: `apps/web/features/rbac/helpers/rbac-settings-ui.ts:127-141`
- Modify: `apps/web/features/rbac/helpers/__tests__/rbac-settings-ui.test.ts`

**Interfaces:**
- Produces resource `supplier.goods_purchase.approve` with action `update`.
- Produces resource `supplier.goods_purchase.reject` with action `update`.
- OWNER remains allowed through the existing OWNER bypass; ADMIN, CASHIER, SALES, and INVENTORY default to false but can be configured later.

- [ ] **Step 1: Add failing RBAC tests**

```ts
it("exposes Owner-default goods purchase decision permissions", async () => {
  const { RBAC_PERMISSION_MODULES } = await import("../rbac-settings-ui");
  const { canRolePerformAction } = await import("../rbac-core");
  const defaults = buildDefaultRolePermissions();
  const resources = [
    "supplier.goods_purchase.approve",
    "supplier.goods_purchase.reject",
  ] as const;
  const supplierModule = RBAC_PERMISSION_MODULES.find(
    (permissionModule) => permissionModule.id === "suppliers",
  );

  expect(supplierModule?.resourceTargets).toEqual(
    expect.arrayContaining([...resources]),
  );
  expect(
    resources.every((resource) =>
      EDITABLE_ROLES.every(
        (role) => defaults[role].resources[resource].update === false,
      ),
    ),
  ).toBe(true);
  expect(
    canRolePerformAction("OWNER", "supplier.goods_purchase.approve", "update"),
  ).toBe(true);
  expect(
    canRolePerformAction("OWNER", "supplier.goods_purchase.reject", "update"),
  ).toBe(true);
});
```

- [ ] **Step 2: Run RBAC test and verify RED**

```powershell
.\node_modules\.bin\vitest.cmd run features/rbac/helpers/__tests__/rbac-settings-ui.test.ts
```

Expected: FAIL because the resources are absent.

- [ ] **Step 3: Register both resources**

Add both strings to `RESOURCE_TARGETS`, add both to the Supplier RBAC module, and add this granular default:

```ts
"supplier.goods_purchase.approve": {
  read: [],
  create: [],
  update: [],
  delete: [],
},
"supplier.goods_purchase.reject": {
  read: [],
  create: [],
  update: [],
  delete: [],
},
```

Do not add them to `OWNER_LOCKED_RESOURCE_TARGETS`; other roles remain configurable.

- [ ] **Step 4: Run RBAC test and verify GREEN**

```powershell
.\node_modules\.bin\vitest.cmd run features/rbac/helpers/__tests__/rbac-settings-ui.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/features/rbac/helpers/rbac-core.ts apps/web/features/rbac/helpers/rbac-settings-ui.ts apps/web/features/rbac/helpers/__tests__/rbac-settings-ui.test.ts
git commit -m "feat: add goods purchase decision permissions"
```

---

### Task 4: Stop Daftar Belanja approval from creating expenses

**Files:**
- Modify: `apps/web/features/suppliers/shopping-requests/repositories/shopping-requests-repository.ts:546-716`
- Modify: `apps/web/features/suppliers/shopping-requests/repositories/__tests__/shopping-request-expense.test.ts`
- Modify: `apps/web/features/suppliers/shopping-requests/hooks/useShoppingRequests.ts:130-137`
- Modify: `apps/web/features/suppliers/shopping-requests/hooks/__tests__/shopping-request-finance-invalidation.test.ts`

**Interfaces:**
- Shopping Request approval still stores `costPriceSnapshot`, decisions, approver, and status.
- Shopping Request approval no longer calls `tx.expense.create`.
- Shopping Request approval no longer invalidates finance/report queries.

- [ ] **Step 1: Rewrite the repository expectation first**

Add a test that completes the last Shopping Request item and asserts:

```ts
expect(tx.expense.create).not.toHaveBeenCalled();
expect(tx.product.update).not.toHaveBeenCalled();
expect(tx.inventoryLog.create).not.toHaveBeenCalled();
expect(tx.shoppingRequest.update).toHaveBeenCalledWith(
  expect.objectContaining({
    data: expect.objectContaining({ status: "APPROVED" }),
  }),
);
```

Change existing tests that expect automatic expense creation so they expect no expense while keeping snapshot and approval assertions.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/shopping-requests/repositories/__tests__/shopping-request-expense.test.ts features/suppliers/shopping-requests/hooks/__tests__/shopping-request-finance-invalidation.test.ts
```

Expected: FAIL because approval still creates/invalidate expenses.

- [ ] **Step 3: Remove only the automatic expense block**

Delete the `expenseAmount`, `hasMissingCostSnapshot`, and `tx.expense.create` block from `approveShoppingRequestItems`. Keep the current-cost snapshot written to approved items and the final header update.

Change the approval invalidation helper to:

```ts
function invalidateShoppingRequestApprovalQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({
    queryKey: ["shopping-requests", "summary"],
    exact: true,
  });
  queryClient.invalidateQueries({ queryKey: ["dashboard"] });
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/shopping-requests/repositories/__tests__/shopping-request-expense.test.ts features/suppliers/shopping-requests/repositories/__tests__/shopping-request-item-approval.test.ts features/suppliers/shopping-requests/hooks/__tests__/shopping-request-finance-invalidation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/features/suppliers/shopping-requests/repositories apps/web/features/suppliers/shopping-requests/hooks
git commit -m "fix: defer purchase expense beyond shopping approval"
```

---

### Task 5: Build list, eligibility, detail, and create use cases

**Files:**
- Create: `apps/web/features/suppliers/goods-purchases/repositories/goods-purchases-repository.ts`
- Create: `apps/web/features/suppliers/goods-purchases/repositories/__tests__/goods-purchase-create.test.ts`
- Create: `apps/web/features/suppliers/goods-purchases/services/goods-purchases-service.ts`
- Create: `apps/web/features/suppliers/goods-purchases/services/__tests__/goods-purchases-service.test.ts`

**Interfaces:**
- Produces `listGoodsPurchasesPage(filters)`.
- Produces `getGoodsPurchaseOrThrow(id, storeId)`.
- Produces `listEligibleShoppingRequests(storeId, q?)`.
- Produces `listLargeUnitProducts(storeId, q?)`.
- Produces `createGoodsPurchase(input, actor, now?)`.
- Throws `GoodsPurchaseNotFoundError` and `GoodsPurchaseValidationError`.

- [ ] **Step 1: Write failing service tests**

Cover these exact cases:

```ts
it("rejects missing and duplicate create items", async () => {
  await expect(createGoodsPurchase({
    shoppingRequestId: "request-1",
    items: [],
  }, actor)).rejects.toThrow("Minimal satu produk wajib diisi");

  await expect(createGoodsPurchase({
    shoppingRequestId: "request-1",
    items: [
      itemInput({ productId: "product-1" }),
      itemInput({ productId: "product-1", shoppingRequestItemId: "item-2" }),
    ],
  }, actor)).rejects.toThrow("Produk yang sama tidak boleh dipilih dua kali");
});

it("rejects invalid quantity and price", async () => {
  await expect(createGoodsPurchase({
    shoppingRequestId: "request-1",
    items: [itemInput({ quantity: 0 })],
  }, actor)).rejects.toThrow("Jumlah produk harus lebih dari 0");
  await expect(createGoodsPurchase({
    shoppingRequestId: "request-1",
    items: [itemInput({ latestUnitPrice: -1 })],
  }, actor)).rejects.toThrow("Harga produk tidak boleh negatif");
});
```

Repository tests must assert eligibility filters include:

```ts
expect(db.shoppingRequest.findMany).toHaveBeenCalledWith(
  expect.objectContaining({
    where: expect.objectContaining({
      storeId: "store-1",
      status: "APPROVED",
      expense: null,
      goodsPurchases: {
        none: { activeShoppingRequestKey: { not: null } },
      },
      items: {
        some: {
          decisionStatus: "APPROVED",
          approvedQty: { gt: 0 },
        },
      },
    }),
  }),
);
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/goods-purchases/services/__tests__/goods-purchases-service.test.ts features/suppliers/goods-purchases/repositories/__tests__/goods-purchase-create.test.ts
```

Expected: FAIL because service and repository do not exist.

- [ ] **Step 3: Implement read models and mappers**

The repository must select only tenant-owned rows, convert Prisma Decimal/Date values, order history by `createdAt desc`, and compute:

```ts
const pendingItemCount = row.items.filter(
  (item) => item.reviewStatus === "PENDING",
).length;
```

Eligible rows must return only Shopping Request items with `decisionStatus = APPROVED` and `approvedQty > 0`, plus each Product's current `costPrice`, `unit`, `unitMultiplierToBase`, SKU, and active state. Exclude inactive supplier/product rows from the dropdown and revalidate them on create.

Large-unit products must query active products owned by the store, then filter with `isLargePurchaseUnit` before mapping to `LargeUnitProductOption`.

- [ ] **Step 4: Implement create as one transaction**

`createGoodsPurchase` must:

1. Validate input at service boundary.
2. Load the approved Shopping Request by `id + storeId`, including supplier, legacy expense, approved items, and active purchase claim.
3. Require the submitted `shoppingRequestItemId` set to exactly equal the approved-positive item set.
4. Load current Products by tenant and require them to match each Shopping Request item.
5. Calculate each line using `Prisma.Decimal` and `toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)`.
6. Count current-month purchases and generate `PB-YYYYMM-XXX`.
7. Create header with `activeShoppingRequestKey = shoppingRequestId`, supplier snapshot, actor snapshot, and `PENDING`.
8. Create all items with `reviewStatus = PENDING`, HPP snapshot, and current unit snapshots.
9. Return mapped detail.

Translate Prisma unique constraint `P2002` for the active key into:

```ts
throw new GoodsPurchaseValidationError(
  "Daftar Belanja ini sedang atau sudah memiliki Pembelian Barang aktif",
  true,
);
```

Define the service errors exactly:

```ts
export class GoodsPurchaseValidationError extends Error {
  constructor(
    message: string,
    public readonly isConflict = false,
  ) {
    super(message);
    this.name = "GoodsPurchaseValidationError";
  }
}

export class GoodsPurchaseNotFoundError extends Error {
  constructor() {
    super("Pembelian Barang tidak ditemukan");
    this.name = "GoodsPurchaseNotFoundError";
  }
}
```

- [ ] **Step 5: Run tests and verify GREEN**

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/goods-purchases/services/__tests__/goods-purchases-service.test.ts features/suppliers/goods-purchases/repositories/__tests__/goods-purchase-create.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/features/suppliers/goods-purchases/repositories apps/web/features/suppliers/goods-purchases/services
git commit -m "feat: add goods purchase creation service"
```

---

### Task 6: Implement per-item review, rejection, and atomic finalization

**Files:**
- Modify: `apps/web/features/suppliers/goods-purchases/repositories/goods-purchases-repository.ts`
- Modify: `apps/web/features/suppliers/goods-purchases/services/goods-purchases-service.ts`
- Create: `apps/web/features/suppliers/goods-purchases/repositories/__tests__/goods-purchase-review.test.ts`
- Modify: `apps/web/features/suppliers/goods-purchases/services/__tests__/goods-purchases-service.test.ts`

**Interfaces:**
- Produces `approveGoodsPurchaseItem(purchaseId, itemId, actor)`.
- Produces `editGoodsPurchaseItem(purchaseId, itemId, input, actor)`.
- Produces `removeGoodsPurchaseItem(purchaseId, itemId, actor)`.
- Produces `addGoodsPurchaseItem(purchaseId, input, actor)`.
- Produces `rejectGoodsPurchase(purchaseId, reason, actor)`.
- Every item mutation returns `GoodsPurchaseMutationResult`.

- [ ] **Step 1: Write failing transaction tests**

Cover:

```ts
it("keeps the header pending while another item needs action", async () => {
  const result = await approveGoodsPurchaseItem("purchase-1", "item-1", actor);
  expect(result.finalized).toBe(false);
  expect(tx.expense.create).not.toHaveBeenCalled();
  expect(tx.product.update).not.toHaveBeenCalled();
});

it("finalizes exactly once after the final item approval", async () => {
  const result = await approveGoodsPurchaseItem("purchase-1", "item-last", actor);
  expect(result.finalized).toBe(true);
  expect(tx.goodsPurchase.updateMany).toHaveBeenCalledWith({
    where: { id: "purchase-1", storeId: "store-1", status: "PENDING" },
    data: expect.objectContaining({ status: "APPROVED" }),
  });
  expect(tx.expense.create).toHaveBeenCalledTimes(1);
});

it("updates only selected HPP values and writes price logs", async () => {
  await approveGoodsPurchaseItem("purchase-1", "item-last", actor);
  expect(tx.product.update).toHaveBeenCalledWith({
    where: { id: "product-update" },
    data: { costPrice: expect.anything() },
  });
  expect(tx.productPriceLog.createMany).toHaveBeenCalledWith({
    data: expect.arrayContaining([
      expect.objectContaining({
        productId: "product-update",
        field: "COST_PRICE",
        source: "SYSTEM",
      }),
    ]),
  });
  expect(tx.product.update).not.toHaveBeenCalledWith(
    expect.objectContaining({ where: { id: "product-keep" } }),
  );
});

it("never writes stock or inventory logs", async () => {
  await approveGoodsPurchaseItem("purchase-1", "item-last", actor);
  expect(tx.product.updateMany).not.toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ stock: expect.anything() }),
    }),
  );
  expect(tx.inventoryLog.create).not.toHaveBeenCalled();
  expect(tx.productStockGroup.update).not.toHaveBeenCalled();
});
```

Also cover approved-item edit resets status, delete requires at least two items, delete can trigger finalization, large-unit-only add, duplicate add, mandatory reject reason, reject clears active key, and rejected purchase creates no expense/HPP update.

- [ ] **Step 2: Run tests and verify RED**

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/goods-purchases/repositories/__tests__/goods-purchase-review.test.ts features/suppliers/goods-purchases/services/__tests__/goods-purchases-service.test.ts
```

Expected: FAIL because review methods are absent.

- [ ] **Step 3: Implement item mutations**

Each method must start a Prisma transaction, conditionally require header `PENDING`, enforce `storeId`, and return a fresh detail.

Approved-item edit must write:

```ts
data: {
  productId: input.productId,
  productNameSnapshot: product.name,
  skuSnapshot: product.sku,
  unitSnapshot: product.unit,
  unitMultiplierSnapshot: product.unitMultiplierToBase,
  quantity: input.quantity,
  masterCostPriceSnapshot: product.costPrice,
  latestUnitPrice,
  lineTotal,
  updateMasterHpp:
    input.updateMasterHpp &&
    hasMasterHppDifference(
      product.costPrice === null ? null : Number(product.costPrice.toString()),
      input.latestUnitPrice,
    ),
  reviewStatus: "PENDING",
  approvedById: null,
  approvedByName: null,
  approvedAt: null,
},
```

Add must require `isLargePurchaseUnit(product)`, reject an existing `[goodsPurchaseId, productId]`, default review status to `PENDING`, and recalculate header total.

Remove must count items first and throw:

```ts
throw new GoodsPurchaseValidationError(
  "Minimal satu produk wajib tersisa dalam Pembelian Barang",
);
```

Reject must require a trimmed reason, use conditional `updateMany` on `PENDING`, set `activeShoppingRequestKey: null`, and preserve all remaining item rows.

- [ ] **Step 4: Implement `finalizeGoodsPurchaseIfReady`**

The private transaction helper must:

1. Load header/items by tenant.
2. Return `{ finalized: false }` when at least one item is `PENDING`.
3. Throw when no items remain.
4. Claim finalization with `goodsPurchase.updateMany({ where: { status: "PENDING" } })`.
5. Recalculate and persist `totalAmount`.
6. For selected HPP items, update `Product.costPrice` and use `buildProductPriceLogEntries` with `source: "SYSTEM"` and note `Pembelian Barang ${purchase.number}`.
7. Create exactly one Expense with both `shoppingRequestId` and `goodsPurchaseId`, category `SUPPLIES`, current approval time, supplier snapshot, description `Pembelian Barang ${number} - ${itemCount} produk`, and `amount = totalAmount`.
8. Set header `APPROVED`, approver snapshots, and `approvedAt`.

All steps must run in the same transaction so a failed HPP log or Expense rolls back the header.

The Product query used for HPP updates must select `price`, `costPrice`, `hargaAgen`, and `hargaDinas`; pass all four values as the `before` snapshot and only replace `costPrice` in the `after` snapshot so the shared log helper emits exactly one `COST_PRICE` entry.

- [ ] **Step 5: Run tests and verify GREEN**

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/goods-purchases/repositories/__tests__/goods-purchase-review.test.ts features/suppliers/goods-purchases/services/__tests__/goods-purchases-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/features/suppliers/goods-purchases/repositories apps/web/features/suppliers/goods-purchases/services
git commit -m "feat: add goods purchase item approval"
```

---

### Task 7: Expose authenticated API routes

**Files:**
- Create all API route files listed in File Structure.
- Create `apps/web/app/api/suppliers/goods-purchases/__tests__/route.test.ts`
- Create `apps/web/app/api/suppliers/goods-purchases/[id]/items/__tests__/route.test.ts`
- Create `apps/web/app/api/suppliers/goods-purchases/[id]/decision/__tests__/route.test.ts`

**Interfaces:**
- Read routes require `supplier:read`.
- Create requires `supplier:create`.
- Approve/add/edit/remove require `supplier.goods_purchase.approve:update`.
- Reject requires `supplier.goods_purchase.reject:update`.
- Validation errors return 422, lifecycle conflicts return 409, missing rows return 404.

- [ ] **Step 1: Write failing route tests**

Assert exact permissions:

```ts
expect(requirePermission).toHaveBeenCalledWith("supplier", "read");
expect(requirePermission).toHaveBeenCalledWith("supplier", "create");
expect(requirePermission).toHaveBeenCalledWith(
  "supplier.goods_purchase.approve",
  "update",
);
expect(requirePermission).toHaveBeenCalledWith(
  "supplier.goods_purchase.reject",
  "update",
);
```

Assert create returns 201, approve response includes `finalized`, reject without a non-empty reason returns 422, and lifecycle conflicts return Indonesian 409 messages.

- [ ] **Step 2: Run route tests and verify RED**

```powershell
.\node_modules\.bin\vitest.cmd run app/api/suppliers/goods-purchases/__tests__/route.test.ts app/api/suppliers/goods-purchases/[id]/items/__tests__/route.test.ts app/api/suppliers/goods-purchases/[id]/decision/__tests__/route.test.ts
```

Expected: FAIL because the routes do not exist.

- [ ] **Step 3: Add Zod schemas and thin route handlers**

Use these schemas:

```ts
const itemSchema = z.object({
  productId: z.string().trim().min(1),
  quantity: z.number().positive("Jumlah produk harus lebih dari 0"),
  latestUnitPrice: z.number().min(0, "Harga produk tidak boleh negatif"),
  updateMasterHpp: z.boolean().default(false),
});

const createSchema = z.object({
  shoppingRequestId: z.string().trim().min(1),
  items: z.array(
    itemSchema.extend({
      shoppingRequestItemId: z.string().trim().min(1),
    }),
  ).min(1, "Minimal satu produk wajib diisi"),
});

const rejectSchema = z.object({
  reason: z.string().trim().min(1, "Alasan penolakan wajib diisi").max(500),
});
```

Every handler must resolve the tenant before calling the service:

```ts
if (!user.storeId) {
  return apiError("Toko pengguna tidak tersedia", 403, {
    code: "Forbidden",
  });
}
```

Pass `user.storeId` directly into `GoodsPurchaseActor`; do not substitute a fallback store.

Map service errors in every route:

```ts
if (error instanceof GoodsPurchaseNotFoundError) {
  return apiError("Pembelian Barang tidak ditemukan", 404, {
    code: "NotFound",
  });
}
if (error instanceof GoodsPurchaseValidationError) {
  return apiError(error.message, error.isConflict ? 409 : 422, {
    code: error.isConflict ? "Conflict" : "ValidationError",
  });
}
```

Use `apiList`, `buildPaginationMeta`, and `parsePagination` for history. Use `NextResponse.json({ data }, { status: 201 })` for create and `Response.json(result)` for item mutations.

- [ ] **Step 4: Run route tests and verify GREEN**

```powershell
.\node_modules\.bin\vitest.cmd run app/api/suppliers/goods-purchases/__tests__/route.test.ts app/api/suppliers/goods-purchases/[id]/items/__tests__/route.test.ts app/api/suppliers/goods-purchases/[id]/decision/__tests__/route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/app/api/suppliers/goods-purchases
git commit -m "feat: expose goods purchase api"
```

---

### Task 8: Add client API and React Query cache behavior

**Files:**
- Create: `apps/web/features/suppliers/goods-purchases/api/goods-purchases-api.ts`
- Create: `apps/web/features/suppliers/goods-purchases/hooks/useGoodsPurchases.ts`
- Create: `apps/web/features/suppliers/goods-purchases/hooks/__tests__/goods-purchase-cache.test.ts`
- Modify: `apps/web/features/suppliers/goods-purchases/index.ts`

**Interfaces:**
- Produces list/detail/eligible/large-unit queries.
- Produces create, approve item, edit item, remove item, add item, and reject mutations.
- Item mutation success synchronizes detail/history and invalidates finance/products only when `finalized = true`.

- [ ] **Step 1: Write failing cache tests**

```ts
it("syncs item mutations into detail and history", () => {
  syncGoodsPurchaseCaches(queryClient, detail);
  expect(queryClient.getQueryData(["goods-purchases", detail.id]))
    .toEqual({ data: detail });
  expect(queryClient.getQueryData(["goods-purchases", { page: 1 }]))
    .toEqual(expect.objectContaining({
      data: [expect.objectContaining({
        id: detail.id,
        pendingItemCount: detail.pendingItemCount,
        totalAmount: detail.totalAmount,
      })],
    }));
});

it("invalidates finance and products only after finalization", () => {
  invalidateGoodsPurchaseMutationQueries(queryClient, false);
  expect(invalidateSpy).not.toHaveBeenCalledWith(
    expect.objectContaining({ queryKey: ["finance"] }),
  );
  invalidateGoodsPurchaseMutationQueries(queryClient, true);
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["finance"] });
  expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["products"] });
});
```

- [ ] **Step 2: Run cache tests and verify RED**

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/goods-purchases/hooks/__tests__/goods-purchase-cache.test.ts
```

Expected: FAIL because the client layer does not exist.

- [ ] **Step 3: Implement fetch functions**

Every non-OK response must read `{ message }` and throw a friendly Error. Use these paths:

```ts
const GOODS_PURCHASES_PATH = "/api/suppliers/goods-purchases";

export const goodsPurchasePaths = {
  list: GOODS_PURCHASES_PATH,
  eligible: `${GOODS_PURCHASES_PATH}/eligible-shopping-requests`,
  largeUnits: `${GOODS_PURCHASES_PATH}/large-unit-products`,
  detail: (id: string) => `${GOODS_PURCHASES_PATH}/${id}`,
  reject: (id: string) => `${GOODS_PURCHASES_PATH}/${id}/reject`,
  items: (id: string) => `${GOODS_PURCHASES_PATH}/${id}/items`,
  item: (id: string, itemId: string) =>
    `${GOODS_PURCHASES_PATH}/${id}/items/${itemId}`,
  itemApproval: (id: string, itemId: string) =>
    `${GOODS_PURCHASES_PATH}/${id}/items/${itemId}/approval`,
};
```

- [ ] **Step 4: Implement query hooks and cache helpers**

Use query keys:

```ts
["goods-purchases", params]
["goods-purchases", id]
["goods-purchases", "eligible", q]
["goods-purchases", "large-unit-products", q]
```

Create invalidates history and eligible. Reject invalidates history/detail/eligible. Item mutations call `syncGoodsPurchaseCaches`; finalization additionally invalidates `["finance"]`, `["financial-report"]`, `["products"]`, `["dashboard"]`, and eligible.

- [ ] **Step 5: Run tests and verify GREEN**

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/goods-purchases/hooks/__tests__/goods-purchase-cache.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/features/suppliers/goods-purchases/api apps/web/features/suppliers/goods-purchases/hooks apps/web/features/suppliers/goods-purchases/index.ts
git commit -m "feat: add goods purchase client state"
```

---

### Task 9: Build history, create, and detail UI

**Files:**
- Create: `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseList.tsx`
- Create: `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseCreateModal.tsx`
- Create: `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseDetailModal.tsx`
- Create: `apps/web/features/suppliers/goods-purchases/components/__tests__/goods-purchase-ui.test.ts`
- Modify: `apps/web/features/suppliers/components/SupplierPageShell.tsx:38-90`
- Modify: `apps/web/features/suppliers/components/SupplierPageShell.tsx:150-265`
- Modify: `apps/web/features/suppliers/goods-purchases/index.ts`

**Interfaces:**
- Tab query value: `goods-purchases`.
- Create modal consumes eligible Shopping Requests and submits exact approved-positive item set.
- History opens detail and dispatches approval/reject actions to Task 10 components.

- [ ] **Step 1: Write failing source-level UI contract tests**

```ts
it("adds the Pembelian Barang tab and deep link", () => {
  expect(shell).toContain('requestedTab === "goods-purchases"');
  expect(shell).toContain("Pembelian Barang");
  expect(shell).toContain("GoodsPurchaseList");
  expect(shell).toContain("GoodsPurchaseCreateModal");
});

it("requires an approved shopping list before showing item inputs", () => {
  const modal = source("GoodsPurchaseCreateModal.tsx");
  expect(modal).toContain("Pilih Daftar Belanja yang sudah disetujui");
  expect(modal).toContain("selectedRequest");
  expect(modal).toContain("approvedQty");
  expect(modal).toContain("Harga Produk Terbaru");
  expect(modal).toContain("Total pengeluaran");
  expect(modal).toContain("Ajukan Pembelian Barang");
  expect(modal).toContain("Update HPP master ke harga ini saat pembelian disetujui");
});

it("shows history status and detail fields", () => {
  const list = source("GoodsPurchaseList.tsx");
  const detail = source("GoodsPurchaseDetailModal.tsx");
  expect(list).toContain("Buat Pembelian Barang");
  expect(list).toContain("Menunggu Persetujuan");
  expect(list).toContain("Disetujui");
  expect(list).toContain("Ditolak");
  expect(detail).toContain("Daftar Belanja");
  expect(detail).toContain("Total pengeluaran");
  expect(detail).toContain("Alasan penolakan");
});
```

- [ ] **Step 2: Run UI tests and verify RED**

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/goods-purchases/components/__tests__/goods-purchase-ui.test.ts
```

Expected: FAIL because components and tab do not exist.

- [ ] **Step 3: Add Supplier tab and responsive section**

Extend tab state to:

```ts
type SupplierTab = "suppliers" | "recap" | "shopping" | "goods-purchases";
```

Map `?tab=goods-purchases`, render a swipeable tab button labelled **Pembelian Barang**, and mount:

```tsx
<GoodsPurchaseList
  onCreateClick={() => setGoodsPurchaseCreateOpen(true)}
/>
```

Keep existing Supplier, Rekap Stock In, and Daftar Belanja behavior unchanged.

- [ ] **Step 4: Implement create modal**

Behavior:

- Disable item form until an eligible Daftar Belanja is selected.
- On selection, seed every approved-positive item with `quantity = approvedQty`, `latestUnitPrice = currentCostPrice ?? 0`, `updateMasterHpp = false`.
- Show supplier snapshot and item product/unit.
- Reset `updateMasterHpp` to false when the latest price equals HPP.
- Use `calculateGoodsPurchaseTotal` for live preview.
- Disable submit when any quantity is non-positive or price is negative.
- Close and reset only after successful create.
- Use modal size `6xl`, stacked mobile controls, and full-width mobile actions.

- [ ] **Step 5: Implement history and detail**

History fields: number, Shopping Request number, supplier, item count, total, status, creator, and date. Provide status filters, search, pagination, loading/error/empty states, and `Detail` action. Render reason only for rejected detail and HPP update intent per item.

- [ ] **Step 6: Run UI tests and verify GREEN**

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/goods-purchases/components/__tests__/goods-purchase-ui.test.ts features/suppliers/components/__tests__/SupplierPageShellResponsive.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/features/suppliers/goods-purchases/components apps/web/features/suppliers/components/SupplierPageShell.tsx apps/web/features/suppliers/goods-purchases/index.ts
git commit -m "feat: add goods purchase history and form"
```

---

### Task 10: Build per-item approval and rejection UI

**Files:**
- Create: `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseApprovalModal.tsx`
- Create: `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseItemEditor.tsx`
- Create: `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseRejectModal.tsx`
- Create: `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseApprovedDialog.tsx`
- Modify: `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseList.tsx`
- Modify: `apps/web/features/suppliers/goods-purchases/components/__tests__/goods-purchase-ui.test.ts`

**Interfaces:**
- Approval modal calls item mutations immediately.
- `finalized = true` closes approval modal and opens success dialog.
- Approve/reject buttons are gated by `useAuth().canPerform`.

- [ ] **Step 1: Add failing approval UI tests**

```ts
it("reviews products individually and shows the pending counter", () => {
  const modal = source("GoodsPurchaseApprovalModal.tsx");
  expect(modal).toContain("Produk Belum Ada Aksi");
  expect(modal).toContain("Setujui");
  expect(modal).toContain("Edit");
  expect(modal).toContain("Hapus");
  expect(modal).toContain("Tambah Produk");
  expect(modal).toContain("useApproveGoodsPurchaseItem");
  expect(modal).toContain("useEditGoodsPurchaseItem");
  expect(modal).toContain("useRemoveGoodsPurchaseItem");
  expect(modal).toContain("useAddGoodsPurchaseItem");
});

it("confirms edits and removals of approved products", () => {
  const modal = source("GoodsPurchaseApprovalModal.tsx");
  expect(modal).toContain(
    "Barang ini sudah disetujui. Apakah ingin mengedit kembali?",
  );
  expect(modal).toContain(
    "Status akan kembali menjadi Belum Ada Aksi.",
  );
  expect(modal).toContain("Produk yang sudah disetujui akan dihapus");
});

it("closes approval and shows the exact final success copy", () => {
  const modal = source("GoodsPurchaseApprovalModal.tsx");
  const success = source("GoodsPurchaseApprovedDialog.tsx");
  expect(modal).toContain("result.finalized");
  expect(success).toContain("Pembelian Barang Telah Disetujui");
});

it("gates owner decisions with separate permissions", () => {
  const list = source("GoodsPurchaseList.tsx");
  expect(list).toContain('supplier.goods_purchase.approve');
  expect(list).toContain('supplier.goods_purchase.reject');
});
```

- [ ] **Step 2: Run UI tests and verify RED**

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/goods-purchases/components/__tests__/goods-purchase-ui.test.ts
```

Expected: FAIL because approval components are absent.

- [ ] **Step 3: Implement immediate per-item actions**

Render the header counter with correct singular/plural:

```tsx
<p className="text-sm font-black text-amber-700">
  {pendingItemCount} Produk Belum Ada Aksi
</p>
```

For approved edit, require:

```ts
const confirmed = window.confirm(
  "Barang ini sudah disetujui. Apakah ingin mengedit kembali? Status akan kembali menjadi Belum Ada Aksi.",
);
if (!confirmed) return;
```

For approved removal, require:

```ts
const confirmed = window.confirm(
  "Produk yang sudah disetujui akan dihapus dan total pembelian berubah. Lanjutkan?",
);
if (!confirmed) return;
```

Every mutation must show its own pending state, keep the modal open when `finalized = false`, and refresh from the mutation response rather than refetching between actions.

- [ ] **Step 4: Implement add/edit product editor**

The editor must:

- Search `useLargeUnitProducts`.
- Group/display variants by product/stock group and show selectable units.
- Default add quantity to `1` and price to selected variant HPP or `0`.
- Restrict edit unit choices to active large-unit variants in the same stock group.
- Show the HPP checkbox only when the entered price differs.
- Use **Simpan Perubahan** for edit and **Tambah Produk** for add.

- [ ] **Step 5: Implement final success and reject dialogs**

When any item mutation resolves with `finalized = true`, close approval state and open `GoodsPurchaseApprovedDialog`. The dialog title/body must contain **Pembelian Barang Telah Disetujui**.

Reject modal must trim the reason, disable confirmation while empty, call `useRejectGoodsPurchase`, close after success, and return the Shopping Request to the eligible dropdown through cache invalidation.

- [ ] **Step 6: Run UI tests and verify GREEN**

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/goods-purchases/components/__tests__/goods-purchase-ui.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/features/suppliers/goods-purchases/components
git commit -m "feat: add goods purchase review modal"
```

---

### Task 11: Integrate automatic expenses, reports, HPP logs, and notifications

**Files:**
- Create: `apps/web/features/keuangan/helpers/automatic-expense.ts`
- Create: `apps/web/features/keuangan/helpers/__tests__/automatic-expense.test.ts`
- Modify: `apps/web/app/api/finance/expenses/route.ts:45-115`
- Modify: `apps/web/app/api/finance/expenses/[id]/route.ts:20-35,119-135`
- Modify: `apps/web/app/api/finance/expenses/[id]/attachment/route.ts:18-36`
- Modify: `apps/web/features/keuangan/hooks/useKeuangan.ts:24-46`
- Modify: `apps/web/app/(main)/keuangan/page.tsx:425-480`
- Modify: `apps/web/features/financial-report/helpers/journal-core.ts:76-145`
- Modify: `apps/web/app/api/finance/report/journal/route.ts:85-132`
- Modify matching finance, journal, and Keuangan tests.
- Modify: `apps/web/lib/push-events.ts`
- Modify: `apps/web/features/notifications/components/NotificationCenter.tsx`
- Modify: `apps/web/lib/__tests__/push-events.test.ts`
- Modify goods-purchase route tests from Task 7.

**Interfaces:**
- Expense source union adds `{ type: "GOODS_PURCHASE"; id; number }`.
- Legacy source remains `{ type: "SHOPPING_REQUEST"; id; number }`.
- Automatic expense protection applies to either relation.
- Notification deep link uses `/suppliers?tab=goods-purchases`.

- [ ] **Step 1: Write failing finance source/protection tests**

```ts
expect(classifyAutomaticExpense({
  goodsPurchaseId: "purchase-1",
  shoppingRequestId: "request-1",
})).toEqual({
  automatic: true,
  label: "Pembelian Barang",
});

expect(classifyAutomaticExpense({
  goodsPurchaseId: null,
  shoppingRequestId: "request-legacy",
})).toEqual({
  automatic: true,
  label: "Daftar Belanja (Legacy)",
});
```

Update expense API tests to expect `GOODS_PURCHASE` when both relations exist, edit/delete/attachment tests to reject a `goodsPurchaseId`, and journal tests to render `Pembelian Barang PB-202607-001`.

- [ ] **Step 2: Run finance tests and verify RED**

```powershell
.\node_modules\.bin\vitest.cmd run features/keuangan/helpers/__tests__/automatic-expense.test.ts features/keuangan/components/__tests__/expense-source-ui.test.ts app/api/finance/expenses/__tests__/route.test.ts app/api/finance/expenses/[id]/__tests__/route.test.ts app/api/finance/expenses/[id]/attachment/__tests__/route.test.ts features/financial-report/helpers/__tests__/report-core.test.ts app/api/finance/report/journal/__tests__/route.test.ts
```

Expected: FAIL because goods-purchase sources are unknown.

- [ ] **Step 3: Implement DRY automatic source classification**

```ts
export function classifyAutomaticExpense(input: {
  goodsPurchaseId: string | null;
  shoppingRequestId: string | null;
}) {
  if (input.goodsPurchaseId) {
    return { automatic: true as const, label: "Pembelian Barang" };
  }
  if (input.shoppingRequestId) {
    return { automatic: true as const, label: "Daftar Belanja (Legacy)" };
  }
  return { automatic: false as const, label: "Manual" };
}
```

Select `goodsPurchaseId` beside `shoppingRequestId` in every mutation guard and use this helper for the error copy. In expense list, select `goodsPurchase { id, number }`, prefer it over `shoppingRequest`, and add the new source union to `useKeuangan`.

In reports, add `goodsPurchaseNumber?: string | null` to `ReportExpenseInput` and prefer:

```ts
const sourceLabel = expense.goodsPurchaseNumber
  ? `Pembelian Barang ${expense.goodsPurchaseNumber}`
  : expense.shoppingRequestNumber
    ? `Daftar Belanja ${expense.shoppingRequestNumber} (Legacy)`
    : null;
```

- [ ] **Step 4: Add purchase notifications**

Reuse push preference feature key `shoppingRequests`. After create, notify OWNER about a new pending Pembelian. After final approval or reject, notify OWNER and ADMIN except the actor. Use:

```ts
{
  eventName: "goods-purchase-created",
  featureKey: "shoppingRequests",
  payload: {
    title: "Pembelian Barang baru",
    body: `${actorName} mengajukan ${number}.`,
    url: "/suppliers?tab=goods-purchases",
    tag: `goods-purchase:${id}`,
  },
}
```

Add `"goods-purchase"` to `notificationIcon` so the notification uses `ShoppingCart`. Notification failures must be logged inside `after()` and must not roll back the transaction.

- [ ] **Step 5: Run finance and notification tests and verify GREEN**

```powershell
.\node_modules\.bin\vitest.cmd run features/keuangan/helpers/__tests__/automatic-expense.test.ts features/keuangan/components/__tests__/expense-source-ui.test.ts app/api/finance/expenses/__tests__/route.test.ts app/api/finance/expenses/[id]/__tests__/route.test.ts app/api/finance/expenses/[id]/attachment/__tests__/route.test.ts features/financial-report/helpers/__tests__/report-core.test.ts app/api/finance/report/journal/__tests__/route.test.ts lib/__tests__/push-events.test.ts app/api/suppliers/goods-purchases/__tests__/route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/features/keuangan apps/web/app/api/finance apps/web/features/financial-report apps/web/lib/push-events.ts apps/web/features/notifications apps/web/lib/__tests__/push-events.test.ts apps/web/app/api/suppliers/goods-purchases
git commit -m "feat: integrate goods purchase expenses"
```

---

### Task 12: Update Help, AI workflow, and feature documentation

**Files:**
- Modify: `apps/web/features/help-documentation/components/HelpContent.tsx`
- Create: `apps/web/features/help-documentation/__tests__/goods-purchase-help.test.ts`
- Modify: `apps/web/features/ai-assistant/docs/help/suppliers.md`
- Modify: `apps/web/features/ai-assistant/docs/help/faq.md`
- Modify: `apps/web/features/ai-assistant/docs/help/financial-report.md`
- Modify: `apps/web/features/ai-assistant/docs/help/keuangan.md`
- Modify: `apps/web/features/ai-assistant/docs/help/settings-rbac.md`
- Modify: `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`
- Modify: `apps/web/features/ai-assistant/workflows/__tests__/workflow-catalog.test.ts`
- Modify: `markdown-files/shopping-request-approval-without-stock-2026-07-23.md`
- Create: `markdown-files/pembelian-barang-2026-07-23.md`

**Interfaces:**
- Adds FAQ/workflow Q38 with slug `goods-purchase`.
- Removes old statements that Shopping Request approval creates expenses.
- Documents distinct planning, purchasing, finance, and receiving responsibilities.

- [ ] **Step 1: Write failing documentation tests**

```ts
it("documents the complete goods purchase lifecycle", () => {
  const help = readFileSync(
    join(process.cwd(), "features/help-documentation/components/HelpContent.tsx"),
    "utf8",
  );
  expect(help).toContain("Pembelian Barang");
  expect(help).toContain("supplier.goods_purchase.approve:update");
  expect(help).toContain("supplier.goods_purchase.reject:update");
  expect(help).toContain("Produk Belum Ada Aksi");
  expect(help).toContain("tidak mengubah stok");
});

it("adds a guided Pembelian Barang workflow", () => {
  const purchase = FAQ_WORKFLOWS.find(
    (workflow) => workflow.slug === "goods-purchase",
  );
  expect(purchase).toMatchObject({
    faqNumber: 38,
    route: "/suppliers?tab=goods-purchases",
  });
  expect(JSON.stringify(purchase)).toContain("Pembelian Barang Telah Disetujui");
});
```

- [ ] **Step 2: Run docs tests and verify RED**

```powershell
.\node_modules\.bin\vitest.cmd run features/help-documentation/__tests__/goods-purchase-help.test.ts features/ai-assistant/workflows/__tests__/workflow-catalog.test.ts
```

Expected: FAIL because the new help/workflow is absent and old expense statements remain.

- [ ] **Step 3: Update user-facing Help and AI knowledge**

Update Daftar Belanja steps so the final approval says it only finalizes quantities and estimated expense, without stock or Expense mutation.

Add an OWNER Help guide that covers:

1. Open Supplier > Pembelian Barang.
2. Select an approved Daftar Belanja.
3. Fill actual quantities and prices.
4. Submit to `PENDING`.
5. Review each item with approve/edit/remove/add.
6. Use large units only for added products.
7. Reject with a reason or finish all items.
8. Explain HPP selection, automatic Expense, retry after reject, and no stock mutation.

Add workflow Q38:

```ts
workflow({
  faqNumber: 38,
  slug: "goods-purchase",
  title: "Bagaimana cara mengajukan dan menyetujui Pembelian Barang?",
  aliases: [
    "buat pembelian barang",
    "approve pembelian supplier",
    "harga produk terbaru",
    "update hpp pembelian",
  ],
  route: "/suppliers?tab=goods-purchases",
  actionLabel: "Buka Pembelian Barang",
  iconKey: "shopping-cart",
  requiredCapabilities: [{ resource: "supplier", action: "create" }],
  steps: [
    { title: "Pilih Daftar Belanja", description: "Pilih Daftar Belanja approved yang belum memiliki Pembelian aktif atau Pengeluaran legacy." },
    { title: "Isi harga aktual", description: "Periksa jumlah dan harga terbaru setiap produk, lalu pilih update HPP per produk jika diperlukan." },
    { title: "Ajukan Pembelian", description: "Klik Ajukan Pembelian Barang. Riwayat baru berstatus Menunggu Persetujuan dan stok tidak berubah." },
    { title: "Review per produk", description: "Owner memakai izin supplier.goods_purchase.approve:update untuk menyetujui, mengedit, menghapus, atau menambah produk satuan besar. Perubahan langsung tersimpan." },
    { title: "Selesaikan atau tolak", description: "Pembelian tetap pending selama ada Produk Belum Ada Aksi. Setelah semua disetujui, modal tertutup dan muncul Pembelian Barang Telah Disetujui. Penolakan memerlukan izin supplier.goods_purchase.reject:update dan alasan." },
    { title: "Cek dampak", description: "Final approval membuat Pengeluaran dan update HPP yang dipilih, tetapi tidak mengubah stok atau membuat stock log." },
  ],
})
```

- [ ] **Step 4: Update markdown feature documentation**

`pembelian-barang-2026-07-23.md` must document scope, data model, API matrix, RBAC matrix, state transitions, large-unit rule, Expense/HPP effects, cache invalidation, error messages, tests, deployment migration, and rollback considerations.

Update the existing Shopping Request document so its finance section points to Pembelian Barang and no longer claims automatic expense creation.

- [ ] **Step 5: Run docs tests and verify GREEN**

```powershell
.\node_modules\.bin\vitest.cmd run features/help-documentation/__tests__/goods-purchase-help.test.ts features/help-documentation/__tests__/shopping-request-item-approval-help.test.ts features/ai-assistant/workflows/__tests__/workflow-catalog.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/features/help-documentation apps/web/features/ai-assistant/docs/help apps/web/features/ai-assistant/workflows
git add -f markdown-files/shopping-request-approval-without-stock-2026-07-23.md markdown-files/pembelian-barang-2026-07-23.md
git commit -m "docs: document goods purchase workflow"
```

---

### Task 13: Run full verification and request review

**Files:**
- Verify all files changed by Tasks 1-12.

**Interfaces:**
- Produces a verified feature ready for user acceptance.

- [ ] **Step 1: Run all focused feature tests**

From `apps/web`:

```powershell
.\node_modules\.bin\vitest.cmd run features/suppliers/goods-purchases app/api/suppliers/goods-purchases features/suppliers/shopping-requests/repositories/__tests__/shopping-request-expense.test.ts features/suppliers/shopping-requests/repositories/__tests__/shopping-request-item-approval.test.ts features/rbac/helpers/__tests__/rbac-settings-ui.test.ts features/keuangan/helpers/__tests__/automatic-expense.test.ts features/keuangan/components/__tests__/expense-source-ui.test.ts app/api/finance/expenses features/financial-report/helpers/__tests__/report-core.test.ts app/api/finance/report/journal/__tests__/route.test.ts features/help-documentation/__tests__/goods-purchase-help.test.ts features/ai-assistant/workflows/__tests__/workflow-catalog.test.ts
```

Expected: all tests PASS.

- [ ] **Step 2: Run the complete web test suite**

From repository root:

```powershell
pnpm.cmd test
```

Expected: PASS with no failed test files.

- [ ] **Step 3: Run type-check**

```powershell
pnpm.cmd type-check
```

Expected: all workspace type-check tasks PASS.

- [ ] **Step 4: Run lint command required by the repository**

```powershell
pnpm.cmd lint
```

Expected: all lint/type-check tasks PASS.

- [ ] **Step 5: Inspect the final diff**

```powershell
git status -sb
git diff --check
git diff --stat
```

Expected: no whitespace errors; only intended feature files plus preserved user changes are present.

- [ ] **Step 6: Perform manual acceptance on the user-managed dev server**

Open `/suppliers?tab=goods-purchases` and verify:

1. Only eligible approved Daftar Belanja appear.
2. Create defaults quantity/HPP correctly and total updates live.
3. New history row is `PENDING`.
4. Approve one item and see the pending counter decrease without closing.
5. Edit an approved item, accept confirmation, and see it return to Belum Ada Aksi.
6. Add a large-unit product and reject a small-unit product.
7. Remove an approved item with confirmation; block removal of the final item.
8. Approve the final item and see the modal close plus **Pembelian Barang Telah Disetujui**.
9. Confirm one Expense exists, selected HPP values changed, and no stock value/log changed.
10. Reject a separate purchase with a mandatory reason and create a retry from the same Daftar Belanja.

- [ ] **Step 7: Use verification and code-review skills**

Invoke `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`. Fix every correctness issue found and rerun the affected test plus type-check.
