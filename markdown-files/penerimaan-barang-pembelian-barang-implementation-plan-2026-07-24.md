# Penerimaan Barang dari Pembelian Barang Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mengubah Penerimaan Barang agar bersumber dari Pembelian Barang approved, mendukung partial multi-receipt, review per item, finalisasi stok bersama atomik, bundle Stock Log, dan integrasi quick action Supplier.

**Architecture:** Extend model `InventoryInboundReceipt` existing dengan relasi ke `GoodsPurchase`, state match/review per line, dan fulfillment status terpisah pada purchase. Business rules quantity berada di helper/service, persistence dan row lock berada di repository, sedangkan stock mutation plus bundle creation diisolasi dalam finalizer transaction. Modal pengajuan dibuat shared supaya entry point Inventory dan Supplier memakai behavior yang sama.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Prisma/PostgreSQL, TanStack Query, Vitest, Tailwind, RBAC resource permissions.

## Global Constraints

- Penerimaan baru wajib memakai Pembelian Barang `APPROVED`; receipt legacy berbasis Daftar Belanja tetap read-only.
- Multiple receipt `SUBMITTED` boleh berjalan bersamaan; pending quantity menjadi reservation advisory.
- Total quantity receipt `APPROVED` tidak boleh melampaui `GoodsPurchaseItem.quantity`.
- Match status Sesuai/Tidak Sesuai dipilih manual; note wajib bila received quantity berbeda dari expected batch snapshot.
- Item approve/edit/remove/reject tidak mengubah stok sampai semua item receipt selesai disetujui.
- Finalisasi receipt, stock-group base mutation, canonical logs, bundle snapshots, receipt status, dan fulfillment status harus satu transaction.
- Satu receipt approved menghasilkan tepat satu bundle Stock Log berjudul nama supplier; nomor `PB-...` hanya tampil pada detail bundle.
- Canonical received line dihitung sekali untuk cost/supplier recap; variant impact snapshot tidak menjadi movement biaya tambahan.
- Permission `approve`, `reject`, dan `edit` default OWNER; permission `revise` dihapus dari flow baru.
- User-visible copy menggunakan bahasa Indonesia yang ramah.
- Jangan menjalankan `pnpm build`, jangan start/stop `pnpm dev`, dan jangan menyentuh perubahan lokal user di `apps/web/app/providers.tsx` atau `apps/web/lib/number-input-guard.ts`.
- Setiap perubahan production code mengikuti TDD: test merah, implementasi minimal, test hijau, lalu commit kecil.

---

## File Structure

### Domain dan Persistence

- Modify `packages/db/prisma/schema.prisma` — enum, relasi receipt/purchase/bundle, fulfillment state.
- Create `packages/db/prisma/migrations/20260724_goods_purchase_inbound_receipts/migration.sql` — migration additive dan legacy-safe.
- Modify `apps/web/features/inventory-management/types/inventory-management.ts` — contract queue, comparison, review, mutation.
- Modify `apps/web/features/inventory-management/helpers/inbound-receipt-rules.ts` — pure quantity, note, match, conflict, fulfillment rules.
- Create `apps/web/features/inventory-management/services/inbound-receipt-finalizer.ts` — finalisasi atomik stok, bundle, dan fulfillment.
- Modify `apps/web/features/inventory-management/services/inbound-receipt-service.ts` — orchestration create/review/reject/read.
- Modify `apps/web/features/inventory-management/repositories/InventoryInboundReceiptRepository.ts` — tenant query, locks, persistence.

### API dan Client

- Modify `apps/web/app/api/inventory-management/receiving-queue/route.ts` — eligible Goods Purchase queue.
- Modify `apps/web/app/api/inventory-management/inbound-receipts/route.ts` — history filter dan create payload baru.
- Create item routes under `apps/web/app/api/inventory-management/inbound-receipts/[id]/items/[itemId]/`.
- Modify reject route and remove needs-revision action from the new client flow.
- Create `apps/web/app/api/suppliers/goods-purchases/[id]/receiving-comparison/route.ts`.
- Modify `apps/web/features/inventory-management/api/inventory-management-api.ts` — typed client calls.

### UI

- Refactor `apps/web/features/inventory-management/components/InboundReceiptModal.tsx` — shared Goods Purchase receiving form.
- Create `apps/web/features/inventory-management/components/InboundReceiptReviewModal.tsx` — item decisions.
- Modify `apps/web/features/inventory-management/components/InboundReceiptTab.tsx` — history, filters, review entry.
- Modify `apps/web/features/inventory-management/components/InventoryWorkspace.tsx` — query deep link and shared modal props.
- Create `apps/web/features/inventory-management/components/InboundReceiptStockBundleModal.tsx` — read-only bundle detail.
- Modify `apps/web/app/(main)/inventory/StockLogsTab.tsx` — group and open inbound receipt bundles.
- Modify Supplier Goods Purchase list, shell, detail/comparison components for quick actions.

### Documentation

- Modify Help, visual preview, AI workflow catalog, AI FAQ, and feature markdown after behavior is green.

---

### Task 1: Pure Quantity, Match, Conflict, and Fulfillment Rules

**Files:**
- Modify: `apps/web/features/inventory-management/helpers/inbound-receipt-rules.ts`
- Modify: `apps/web/features/inventory-management/helpers/__tests__/inbound-receipt-rules.test.ts`
- Modify: `apps/web/features/inventory-management/types/inventory-management.ts`

**Interfaces:**
- Produces:
  - `calculateInboundAvailability(input): InboundAvailability`
  - `requiresInboundQuantityNote(expectedQuantity, receivedQuantity): boolean`
  - `hasInboundQuantityConflict(input): boolean`
  - `resolveGoodsPurchaseFulfillment(items): GoodsPurchaseFulfillmentStatus`
  - match/review/queue/comparison TypeScript contracts used by every later task.

- [ ] **Step 1: Write failing domain tests**

```ts
import {
  calculateInboundAvailability,
  hasInboundQuantityConflict,
  requiresInboundQuantityNote,
  resolveGoodsPurchaseFulfillment,
} from "../inbound-receipt-rules";

it("subtracts approved and pending reservations from ordered quantity", () => {
  expect(
    calculateInboundAvailability({
      orderedQuantity: 50,
      approvedReceivedQuantity: 20,
      pendingReservedQuantity: 10,
    }),
  ).toEqual({
    orderedQuantity: 50,
    approvedReceivedQuantity: 20,
    pendingReservedQuantity: 10,
    availableQuantity: 20,
  });
});

it("requires a note from quantity difference, independent of match badge", () => {
  expect(requiresInboundQuantityNote(50, 40)).toBe(true);
  expect(requiresInboundQuantityNote(50, 50)).toBe(false);
});

it("marks a stale pending receipt as conflicting after another receipt is approved", () => {
  expect(
    hasInboundQuantityConflict({
      orderedQuantity: 10,
      approvedReceivedQuantity: 8,
      currentReceiptQuantity: 4,
    }),
  ).toBe(true);
});

it("resolves not received, partial, and received fulfillment", () => {
  expect(
    resolveGoodsPurchaseFulfillment([
      { orderedQuantity: 10, approvedReceivedQuantity: 0 },
    ]),
  ).toBe("NOT_RECEIVED");
  expect(
    resolveGoodsPurchaseFulfillment([
      { orderedQuantity: 10, approvedReceivedQuantity: 6 },
    ]),
  ).toBe("PARTIALLY_RECEIVED");
  expect(
    resolveGoodsPurchaseFulfillment([
      { orderedQuantity: 10, approvedReceivedQuantity: 10 },
    ]),
  ).toBe("RECEIVED");
});
```

- [ ] **Step 2: Run the domain test and verify RED**

Run:

```powershell
cd apps/web
.\node_modules\.bin\vitest.cmd run features/inventory-management/helpers/__tests__/inbound-receipt-rules.test.ts
```

Expected: FAIL because the four exports do not exist.

- [ ] **Step 3: Add exact domain types and minimal implementation**

```ts
export type GoodsPurchaseFulfillmentStatus =
  | "NOT_RECEIVED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED";

export type InboundReceiptMatchStatus = "MATCHED" | "MISMATCHED";
export type InboundReceiptItemReviewStatus = "PENDING" | "APPROVED";

export interface InboundAvailability {
  orderedQuantity: number;
  approvedReceivedQuantity: number;
  pendingReservedQuantity: number;
  availableQuantity: number;
}

export function calculateInboundAvailability(input: {
  orderedQuantity: number;
  approvedReceivedQuantity: number;
  pendingReservedQuantity: number;
}): InboundAvailability {
  return {
    ...input,
    availableQuantity: Math.max(
      0,
      input.orderedQuantity -
        input.approvedReceivedQuantity -
        input.pendingReservedQuantity,
    ),
  };
}

export function requiresInboundQuantityNote(
  expectedQuantity: number,
  receivedQuantity: number,
): boolean {
  return Math.abs(expectedQuantity - receivedQuantity) > 1e-9;
}

export function hasInboundQuantityConflict(input: {
  orderedQuantity: number;
  approvedReceivedQuantity: number;
  currentReceiptQuantity: number;
}): boolean {
  return (
    input.approvedReceivedQuantity + input.currentReceiptQuantity >
    input.orderedQuantity + 1e-9
  );
}

export function resolveGoodsPurchaseFulfillment(
  items: Array<{
    orderedQuantity: number;
    approvedReceivedQuantity: number;
  }>,
): GoodsPurchaseFulfillmentStatus {
  const received = items.reduce(
    (sum, item) => sum + item.approvedReceivedQuantity,
    0,
  );
  if (received <= 1e-9) return "NOT_RECEIVED";
  return items.every(
    (item) =>
      item.approvedReceivedQuantity + 1e-9 >= item.orderedQuantity,
  )
    ? "RECEIVED"
    : "PARTIALLY_RECEIVED";
}
```

Add nested queue and comparison contracts to `inventory-management.ts`:

```ts
export interface ReceivingQueuePurchase {
  id: string;
  number: string;
  supplierId: string | null;
  supplierName: string;
  fulfillmentStatus: GoodsPurchaseFulfillmentStatus;
  pendingReceiptCount: number;
  items: ReceivingQueuePurchaseItem[];
}

export interface ReceivingQueuePurchaseItem {
  goodsPurchaseItemId: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string | null;
  orderedQuantity: number;
  approvedReceivedQuantity: number;
  pendingReservedQuantity: number;
  availableQuantity: number;
}

export interface ReceivingQueueResult {
  purchases: ReceivingQueuePurchase[];
}
```

- [ ] **Step 4: Run the domain test and verify GREEN**

Expected: all tests in `inbound-receipt-rules.test.ts` PASS.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/features/inventory-management/helpers/inbound-receipt-rules.ts apps/web/features/inventory-management/helpers/__tests__/inbound-receipt-rules.test.ts apps/web/features/inventory-management/types/inventory-management.ts
git commit -m "feat: add inbound receipt quantity rules"
```

---

### Task 2: Prisma Persistence and Owner-Default RBAC

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/20260724_goods_purchase_inbound_receipts/migration.sql`
- Create: `apps/web/features/inventory-management/helpers/__tests__/goods-purchase-inbound-migration.test.ts`
- Modify: `apps/web/features/rbac/helpers/rbac-core.ts`
- Modify: `apps/web/features/rbac/helpers/rbac-settings-ui.ts`
- Modify: RBAC tests under `apps/web/features/rbac/helpers/__tests__/`

**Interfaces:**
- Consumes: fulfillment/match/review names from Task 1.
- Produces: nullable legacy-safe Prisma fields, `INBOUND_RECEIPT` batch type, and `inventory.inbound_receipt.edit`.

- [ ] **Step 1: Write failing migration and RBAC tests**

```ts
expect(schema).toContain("enum GoodsPurchaseFulfillmentStatus");
expect(schema).toContain("enum InventoryInboundReceiptMatchStatus");
expect(schema).toContain("enum InventoryInboundReceiptLineReviewStatus");
expect(schema).toMatch(/goodsPurchaseId\s+String\?/);
expect(schema).toMatch(/stockBundleId\s+String\?\s+@unique/);
expect(schema).toMatch(/goodsPurchaseItemId\s+String\?/);
expect(schema).toContain("INBOUND_RECEIPT");
```

```ts
expect(RESOURCE_TARGETS).toContain("inventory.inbound_receipt.edit");
expect(RESOURCE_TARGETS).not.toContain("inventory.inbound_receipt.revise");
expect(
  canRolePerformAction(
    "ADMIN",
    "inventory.inbound_receipt.edit",
    "update",
    normalizeRolePermissions(null),
  ),
).toBe(false);
```

- [ ] **Step 2: Run focused migration/RBAC tests and verify RED**

Run:

```powershell
cd apps/web
.\node_modules\.bin\vitest.cmd run features/inventory-management/helpers/__tests__/goods-purchase-inbound-migration.test.ts features/rbac/helpers/__tests__/rbac-core.test.ts features/rbac/helpers/__tests__/rbac-settings-ui.test.ts
```

Expected: FAIL on missing schema enums/fields and edit permission.

- [ ] **Step 3: Add additive Prisma fields and migration**

Add these schema concepts:

```prisma
enum GoodsPurchaseFulfillmentStatus {
  NOT_RECEIVED
  PARTIALLY_RECEIVED
  RECEIVED
}

enum InventoryInboundReceiptMatchStatus {
  MATCHED
  MISMATCHED
}

enum InventoryInboundReceiptLineReviewStatus {
  PENDING
  APPROVED
}

enum BatchOperationType {
  PRODUCT_IMPORT
  BULK_STOCK_ADJUSTMENT
  BULK_STOCK_GROUP_ADJUSTMENT
  DAILY_STOCK_MATCHING
  INBOUND_RECEIPT
  UNDO
}
```

Add nullable fields so legacy rows require no guessed backfill:

```prisma
model GoodsPurchase {
  fulfillmentStatus GoodsPurchaseFulfillmentStatus @default(NOT_RECEIVED)
  inboundReceipts   InventoryInboundReceipt[]
}

model InventoryInboundReceipt {
  goodsPurchaseId String?
  stockBundleId   String? @unique
  goodsPurchase  GoodsPurchase? @relation(fields: [goodsPurchaseId], references: [id], onDelete: SetNull)
  stockBundle    BatchOperation? @relation("inbound_receipt_stock_bundle", fields: [stockBundleId], references: [id], onDelete: SetNull)

  @@index([goodsPurchaseId, status, createdAt])
}

model InventoryInboundReceiptLine {
  goodsPurchaseItemId String?
  matchStatus         InventoryInboundReceiptMatchStatus?
  reviewStatus        InventoryInboundReceiptLineReviewStatus?
  approvedById        String?
  approvedByName      String?
  approvedAt          DateTime?
  goodsPurchaseItem   GoodsPurchaseItem? @relation(fields: [goodsPurchaseItemId], references: [id], onDelete: SetNull)

  @@unique([receiptId, goodsPurchaseItemId])
  @@index([goodsPurchaseItemId, reviewStatus])
}

model BatchOperation {
  inboundReceipt InventoryInboundReceipt? @relation("inbound_receipt_stock_bundle")
}
```

The SQL migration must create enums, columns, indexes, unique constraints, and foreign keys without updating legacy receipt rows.

- [ ] **Step 4: Replace revise permission with edit permission**

```ts
export const RESOURCE_TARGETS = [
  // existing resources
  "inventory.inbound_receipt.approve",
  "inventory.inbound_receipt.reject",
  "inventory.inbound_receipt.edit",
] as const;
```

Keep editable-role defaults false; OWNER continues to bypass editable permission storage.

- [ ] **Step 5: Validate schema and rerun tests**

Run:

```powershell
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/db'
$env:DIRECT_URL='postgresql://user:pass@localhost:5432/db'
pnpm.cmd --filter @pos/db exec prisma validate
cd apps/web
.\node_modules\.bin\vitest.cmd run features/inventory-management/helpers/__tests__/goods-purchase-inbound-migration.test.ts features/rbac/helpers/__tests__/rbac-core.test.ts features/rbac/helpers/__tests__/rbac-settings-ui.test.ts
```

Expected: Prisma valid and focused tests PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260724_goods_purchase_inbound_receipts apps/web/features/inventory-management/helpers/__tests__/goods-purchase-inbound-migration.test.ts apps/web/features/rbac/helpers
git commit -m "feat: persist goods purchase inbound receipts"
```

---

### Task 3: Goods Purchase Receiving Queue and Comparison Read Model

**Files:**
- Modify: `apps/web/features/inventory-management/repositories/InventoryInboundReceiptRepository.ts`
- Modify: `apps/web/features/inventory-management/services/inbound-receipt-service.ts`
- Modify: `apps/web/features/inventory-management/services/__tests__/inbound-receipt-service.test.ts`
- Modify: `apps/web/features/inventory-management/types/inventory-management.ts`
- Modify: `apps/web/app/api/inventory-management/receiving-queue/route.ts`
- Modify: `apps/web/app/api/inventory-management/receiving-queue/__tests__/route.test.ts`
- Create: `apps/web/app/api/suppliers/goods-purchases/[id]/receiving-comparison/route.ts`
- Create: `apps/web/app/api/suppliers/goods-purchases/[id]/receiving-comparison/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `calculateInboundAvailability` and queue contracts.
- Produces:
  - `listReceivingQueue(storeId, { search, take, goodsPurchaseId? })`
  - `getGoodsPurchaseReceivingComparison(storeId, goodsPurchaseId)`
  - queue payload grouped by purchase.

- [ ] **Step 1: Write failing service tests for approved Goods Purchase source**

```ts
it("lists approved goods purchases and reserves submitted receipt quantities", async () => {
  repository.listReceivingQueue.mockResolvedValue([
    {
      goodsPurchaseId: "gp-1",
      goodsPurchaseNumber: "PB-202607-001",
      supplierId: "supplier-1",
      supplierName: "CV Kertas",
      fulfillmentStatus: "NOT_RECEIVED",
      itemId: "gpi-1",
      productId: "product-1",
      productName: "Kertas Dus",
      sku: "KD-1",
      unit: "dus",
      orderedQuantity: 50,
      approvedReceivedQuantity: 20,
      pendingReservedQuantity: 10,
      pendingReceiptIds: ["receipt-2"],
    },
  ]);

  await expect(getReceivingQueue({ repository, user })).resolves.toEqual({
    purchases: [
      expect.objectContaining({
        id: "gp-1",
        number: "PB-202607-001",
        pendingReceiptCount: 1,
        items: [
          expect.objectContaining({
            availableQuantity: 20,
          }),
        ],
      }),
    ],
  });
});
```

Add a repository source assertion proving the query uses `goodsPurchase.findMany`, `status: "APPROVED"`, and not `shoppingRequest.findMany`.

- [ ] **Step 2: Run focused tests and verify RED**

Expected: current repository still queries Daftar Belanja and returns flat queue items.

- [ ] **Step 3: Implement tenant-scoped grouped queue**

Query Goods Purchases with:

```ts
where: {
  storeId,
  status: "APPROVED",
  fulfillmentStatus: { not: "RECEIVED" },
  ...(goodsPurchaseId ? { id: goodsPurchaseId } : {}),
}
```

For each Goods Purchase item, aggregate new receipt lines:

```ts
const approvedReceivedQuantity = lines
  .filter((line) => line.receipt.status === "APPROVED")
  .reduce((sum, line) => sum + line.receivedQuantity, 0);
const pendingLines = lines.filter(
  (line) => line.receipt.status === "SUBMITTED",
);
const pendingReservedQuantity = pendingLines.reduce(
  (sum, line) => sum + line.receivedQuantity,
  0,
);
```

Group flat repository rows by Goods Purchase in the service and discard purchases whose items all have `availableQuantity <= 0`.

- [ ] **Step 4: Implement comparison read model**

Return:

```ts
export interface GoodsPurchaseReceivingComparison {
  goodsPurchaseId: string;
  goodsPurchaseNumber: string;
  supplierName: string;
  fulfillmentStatus: GoodsPurchaseFulfillmentStatus;
  items: Array<{
    goodsPurchaseItemId: string;
    productName: string;
    sku: string;
    unit: string | null;
    orderedQuantity: number;
    approvedReceivedQuantity: number;
    pendingReservedQuantity: number;
    remainingQuantity: number;
  }>;
  receipts: Array<{
    id: string;
    createdAt: string;
    status: InboundReceiptStatus;
    approvedAt: string | null;
    approverName: string | null;
    lines: Array<{
      goodsPurchaseItemId: string;
      receivedQuantity: number;
      matchStatus: InboundReceiptMatchStatus;
      note: string | null;
    }>;
  }>;
}
```

Protect the new comparison route with `requirePermission("supplier", "read")`.

- [ ] **Step 5: Run service and route tests**

Expected: queue and comparison tests PASS, including cross-store not-found behavior.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/features/inventory-management/repositories/InventoryInboundReceiptRepository.ts apps/web/features/inventory-management/services/inbound-receipt-service.ts apps/web/features/inventory-management/services/__tests__/inbound-receipt-service.test.ts apps/web/features/inventory-management/types/inventory-management.ts apps/web/app/api/inventory-management/receiving-queue apps/web/app/api/suppliers/goods-purchases
git commit -m "feat: list goods purchases for receiving"
```

---

### Task 4: Create and Submit Receipt from Goods Purchase

**Files:**
- Modify: `apps/web/features/inventory-management/services/inbound-receipt-service.ts`
- Modify: `apps/web/features/inventory-management/repositories/InventoryInboundReceiptRepository.ts`
- Modify: `apps/web/features/inventory-management/services/__tests__/inbound-receipt-service.test.ts`
- Modify: `apps/web/app/api/inventory-management/inbound-receipts/route.ts`
- Modify: `apps/web/app/api/inventory-management/inbound-receipts/__tests__/route.test.ts`

**Interfaces:**
- Consumes: queue item IDs, note rule, and Prisma relations.
- Produces:
  - `createAndSubmitGoodsPurchaseReceipt(input)`
  - new payload `{ goodsPurchaseId, lines[{ goodsPurchaseItemId, matchStatus, receivedQuantity, note }] }`.

- [ ] **Step 1: Write failing create validation tests**

Cover:

```ts
it("requires every currently available purchase item", async () => {
  await expect(createAndSubmitInboundReceipt(inputMissingItem)).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
    message: "Semua produk yang masih tersedia wajib diisi",
  });
});

it("requires a note when received quantity differs from expected batch", async () => {
  await expect(createAndSubmitInboundReceipt(inputWithoutDifferenceNote)).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
    message: "Catatan produk wajib diisi saat jumlah diterima berbeda",
  });
});

it("does not allow received quantity above current available quantity", async () => {
  await expect(createAndSubmitInboundReceipt(overReceiptInput)).rejects.toMatchObject({
    code: "CONFLICT",
  });
});
```

- [ ] **Step 2: Run create service/route tests and verify RED**

Expected: old payload still accepts `shoppingRequestId`, status enum line, and client-supplied expected quantity.

- [ ] **Step 3: Implement server-authoritative create**

Inside one transaction:

1. Lock Goods Purchase row.
2. Load `APPROVED` purchase and items for the actor store.
3. Recompute approved/pending/available quantities.
4. Require exact set of items with `availableQuantity > 0`.
5. Ignore any client expected quantity; persist `expectedQuantitySnapshot = availableQuantity`.
6. Validate received range and note.
7. Create receipt directly as `SUBMITTED`.
8. Create lines with `reviewStatus = PENDING`.

Payload schema:

```ts
const createSchema = z.object({
  goodsPurchaseId: z.string().min(1),
  note: z.string().trim().max(500).optional().nullable(),
  lines: z.array(
    z.object({
      goodsPurchaseItemId: z.string().min(1),
      matchStatus: z.enum(["MATCHED", "MISMATCHED"]),
      receivedQuantity: z.number().min(0),
      note: z.string().trim().max(500).optional().nullable(),
    }),
  ).min(1),
});
```

Do not accept `shoppingRequestId`, `shoppingRequestItemId`, editable expected quantity, or old line status for new receipt creation.

- [ ] **Step 4: Run create tests and verify GREEN**

Expected: create service and API tests PASS; no stock mutation methods called.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/features/inventory-management/services/inbound-receipt-service.ts apps/web/features/inventory-management/repositories/InventoryInboundReceiptRepository.ts apps/web/features/inventory-management/services/__tests__/inbound-receipt-service.test.ts apps/web/app/api/inventory-management/inbound-receipts
git commit -m "feat: submit goods purchase receipts"
```

---

### Task 5: Individual Item Approve, Edit, Remove, and Header Reject

**Files:**
- Modify: `apps/web/features/inventory-management/services/inbound-receipt-service.ts`
- Modify: `apps/web/features/inventory-management/repositories/InventoryInboundReceiptRepository.ts`
- Modify: `apps/web/features/inventory-management/services/__tests__/inbound-receipt-service.test.ts`
- Create:
  - `apps/web/app/api/inventory-management/inbound-receipts/[id]/items/[itemId]/approval/route.ts`
  - `apps/web/app/api/inventory-management/inbound-receipts/[id]/items/[itemId]/route.ts`
  - matching route tests.
- Modify: reject route and tests.

**Interfaces:**
- Produces:
  - `approveInboundReceiptItem`
  - `editInboundReceiptItem`
  - `removeInboundReceiptItem`
  - `rejectInboundReceipt`
  - `InboundReceiptMutationResult { data, finalized }`.

- [ ] **Step 1: Write failing review tests**

```ts
it("approves one line without changing stock while another line is pending", async () => {
  const result = await approveInboundReceiptItem(reviewInput);
  expect(result.finalized).toBe(false);
  expect(repository.applyProductStockDelta).not.toHaveBeenCalled();
  expect(repository.createInboundStockLog).not.toHaveBeenCalled();
});

it("resets an approved line to pending after edit", async () => {
  await editInboundReceiptItem({
    ...reviewInput,
    itemId: "line-1",
    input: {
      matchStatus: "MATCHED",
      receivedQuantity: 40,
      note: "Supplier ready 40",
    },
  });
  expect(repository.updateReceiptLine).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      reviewStatus: "PENDING",
      approvedById: null,
      approvedAt: null,
    }),
  );
});

it("requires one line to remain after removal", async () => {
  await expect(removeInboundReceiptItem(singleLineInput)).rejects.toMatchObject({
    code: "VALIDATION_ERROR",
  });
});
```

Also test stale quantity conflict and mandatory header rejection reason.

- [ ] **Step 2: Run review tests and verify RED**

Expected: old service only supports whole-receipt approve/edit/revise.

- [ ] **Step 3: Implement row-locked item mutations**

All item mutations begin with:

```ts
const receipt = await repository.lockSubmittedReceipt(tx, {
  storeId,
  receiptId,
});
if (!receipt) {
  throw new InventoryManagementError(
    "CONFLICT",
    "Penerimaan Barang sudah tidak menunggu persetujuan",
    409,
  );
}
```

Edit validation uses:

```ts
if (
  hasInboundQuantityConflict({
    orderedQuantity: line.goodsPurchaseItem.quantity,
    approvedReceivedQuantity: line.approvedReceivedExcludingCurrentReceipt,
    currentReceiptQuantity: input.receivedQuantity,
  })
) {
  // Persist edit so user can see it, but expose conflict=true in the response.
}
```

Approve refuses a conflicting line. Remove deletes only the targeted line after verifying at least two lines exist. Reject atomically changes header `SUBMITTED -> REJECTED`; it does not create stock/log/bundle.

- [ ] **Step 4: Add RBAC routes**

- Approval route: `requirePermission("inventory.inbound_receipt.approve", "update")`
- PATCH/DELETE item route: `requirePermission("inventory.inbound_receipt.edit", "update")`
- Reject route: `requirePermission("inventory.inbound_receipt.reject", "update")`

Delete the needs-revision button/client call later, but keep legacy GET readability.

- [ ] **Step 5: Run service and route tests**

Expected: item lifecycle and RBAC tests PASS, with zero stock writes before finalization.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/features/inventory-management/services/inbound-receipt-service.ts apps/web/features/inventory-management/repositories/InventoryInboundReceiptRepository.ts apps/web/features/inventory-management/services/__tests__/inbound-receipt-service.test.ts apps/web/app/api/inventory-management/inbound-receipts
git commit -m "feat: review inbound receipt items"
```

---

### Task 6: Atomic Shared-Stock Finalizer and Receipt Bundle

**Files:**
- Create: `apps/web/features/inventory-management/services/inbound-receipt-finalizer.ts`
- Create: `apps/web/features/inventory-management/services/__tests__/inbound-receipt-finalizer.test.ts`
- Modify: `apps/web/features/inventory-management/services/inbound-receipt-service.ts`
- Modify: `apps/web/features/inventory-management/repositories/InventoryInboundReceiptRepository.ts`
- Modify: `apps/web/features/inventory-management/types/inventory-management.ts`

**Interfaces:**
- Consumes: locked submitted receipt, stock group helpers, line item prices.
- Produces:
  - `finalizeInboundReceiptIfReady({ repository, tx, receiptId, user, now })`
  - committed `INBOUND_RECEIPT` BatchOperation and fulfillment update.

- [ ] **Step 1: Write failing finalizer tests**

Cover all of these exact behaviors:

```ts
it("updates one shared base stock and snapshots every active variant", async () => {
  const result = await finalizeInboundReceiptIfReady(input);
  expect(repository.incrementStockGroupBase).toHaveBeenCalledWith(
    tx,
    expect.objectContaining({
      stockGroupId: "group-1",
      baseDelta: 24,
    }),
  );
  expect(result.bundle.variantImpacts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ productId: "dus", delta: 2 }),
      expect.objectContaining({ productId: "pack", delta: 4 }),
      expect.objectContaining({ productId: "pcs", delta: 24 }),
    ]),
  );
});

it("creates canonical cost movement once and does not duplicate it for variants", async () => {
  await finalizeInboundReceiptIfReady(input);
  expect(repository.createCanonicalInventoryLog).toHaveBeenCalledTimes(1);
  expect(repository.createCanonicalInventoryLog).toHaveBeenCalledWith(
    tx,
    expect.objectContaining({
      productId: "dus",
      quantity: 2,
      unitCost: 120_000,
    }),
  );
});

it("creates one supplier-titled bundle and stores PB number only in summary detail", async () => {
  await finalizeInboundReceiptIfReady(input);
  expect(repository.createReceiptStockBundle).toHaveBeenCalledWith(
    tx,
    expect.objectContaining({
      title: "CV Kertas",
      goodsPurchaseNumber: "PB-202607-001",
      type: "INBOUND_RECEIPT",
    }),
  );
});

it("rolls back final item approval when finalization conflicts", async () => {
  await expect(finalizeInboundReceiptIfReady(conflictingInput)).rejects.toMatchObject({
    code: "CONFLICT",
  });
  expect(repository.markReceiptApproved).not.toHaveBeenCalled();
});
```

Also test standalone products, multiple stock groups in one bundle, quantity zero, and existing `stockBundleId` idempotency.

- [ ] **Step 2: Run finalizer tests and verify RED**

Expected: finalizer file is missing.

- [ ] **Step 3: Implement grouped stock calculation**

Use one accumulator per stock group:

```ts
const grouped = new Map<
  string,
  {
    baseDelta: number;
    canonicalLines: FinalizableReceiptLine[];
  }
>();

for (const line of positiveLines) {
  if (!line.stockGroupId) continue;
  const current = grouped.get(line.stockGroupId) ?? {
    baseDelta: 0,
    canonicalLines: [],
  };
  current.baseDelta +=
    line.receivedQuantity * line.unitMultiplierToBase;
  current.canonicalLines.push(line);
  grouped.set(line.stockGroupId, current);
}
```

For each group:

1. Read and lock current `baseStock` plus active variants.
2. Increment base once by accumulated `baseDelta`.
3. Derive every variant before/after using `calculateDisplayStock`.
4. Store variant impact snapshots without independent stock mutation.

Standalone lines increment `Product.stock` directly.

- [ ] **Step 4: Implement canonical logs and committed bundle**

For every positive receipt line, create one canonical log:

```ts
{
  productId: line.productId,
  supplierId: receipt.supplierId,
  type: "IN",
  reason: "RESTOCK",
  quantity: line.receivedQuantity,
  unitCost: line.goodsPurchaseItem.latestUnitPrice,
  note: receipt.supplierName,
  status: "APPROVED",
  approvedBy: user.id,
  approverName: user.name,
  decidedAt: now,
}
```

Create one `BatchOperation`:

```ts
{
  type: "INBOUND_RECEIPT",
  status: "COMMITTED",
  storeId: receipt.storeId,
  createdBy: user.id,
  summary: {
    source: "INBOUND_RECEIPT",
    title: receipt.supplierName,
    receiptId: receipt.id,
    goodsPurchaseId: receipt.goodsPurchaseId,
    goodsPurchaseNumber: receipt.goodsPurchaseNumber,
    supplierId: receipt.supplierId,
    supplierName: receipt.supplierName,
    type: "IN",
    totalCount: canonicalLogs.length,
    approvedCount: canonicalLogs.length,
    pendingCount: 0,
    rejectedCount: 0,
  },
}
```

Create canonical batch items linked to inventory logs and variant-impact batch items with before/after snapshots but no `inventoryLogId`. Set `receipt.stockBundleId`, mark receipt approved, and recompute fulfillment in the same transaction.

- [ ] **Step 5: Wire finalizer after each item approval**

`approveInboundReceiptItem` updates the line and then calls `finalizeInboundReceiptIfReady`. The finalizer returns `finalized: false` if another line is pending.

- [ ] **Step 6: Run finalizer and inbound service tests**

Expected: all focused tests PASS and no test observes stock mutation before final receipt approval.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/features/inventory-management/services/inbound-receipt-finalizer.ts apps/web/features/inventory-management/services/__tests__/inbound-receipt-finalizer.test.ts apps/web/features/inventory-management/services/inbound-receipt-service.ts apps/web/features/inventory-management/repositories/InventoryInboundReceiptRepository.ts apps/web/features/inventory-management/types/inventory-management.ts
git commit -m "feat: finalize shared-stock inbound receipts"
```

---

### Task 7: Typed Client API and Shared Receiving Modal

**Files:**
- Modify: `apps/web/features/inventory-management/api/inventory-management-api.ts`
- Modify: `apps/web/features/inventory-management/api/__tests__/inventory-management-api.test.ts`
- Modify: `apps/web/features/inventory-management/components/InboundReceiptModal.tsx`
- Modify: `apps/web/features/inventory-management/components/__tests__/InboundReceiptModal.test.tsx`
- Modify: `apps/web/features/inventory-management/index.ts`

**Interfaces:**
- Consumes: queue and create route contracts.
- Produces shared modal props:

```ts
interface InboundReceiptModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  initialGoodsPurchaseId?: string | null;
}
```

- [ ] **Step 1: Replace old UI tests with failing Goods Purchase tests**

Assert:

```ts
expect(html).toContain("Pilih Pembelian Barang");
expect(html).toContain("PB-202607-001");
expect(html).toContain("Ada 1 penerimaan menunggu persetujuan");
expect(html).toContain("Sesuai");
expect(html).toContain("Tidak Sesuai");
expect(html).toContain("Jumlah Diterima");
expect(html).not.toContain("Invoice Daftar Belanja");
expect(html).not.toContain("Status Line");
expect(html).not.toContain("Qty Ekspektasi");
```

Add a test proving `initialGoodsPurchaseId="gp-2"` selects GP-2 when the queue loads.

- [ ] **Step 2: Run client/modal tests and verify RED**

Expected: modal still renders the Daftar Belanja picker and old six-value status select.

- [ ] **Step 3: Add typed client functions**

```ts
export function createInboundReceipt(input: {
  goodsPurchaseId: string;
  note?: string | null;
  lines: Array<{
    goodsPurchaseItemId: string;
    matchStatus: InboundReceiptMatchStatus;
    receivedQuantity: number;
    note?: string | null;
  }>;
}) {
  return postInventoryManagement(
    "/api/inventory-management/inbound-receipts",
    input,
  );
}

export function approveInboundReceiptItem(id: string, itemId: string) {
  return postInventoryManagement(
    `/api/inventory-management/inbound-receipts/${id}/items/${itemId}/approval`,
    {},
  );
}
```

Add PATCH/DELETE item, reject, filtered history, queue with `goodsPurchaseId`, and comparison calls.

- [ ] **Step 4: Refactor modal state**

Use one entry per Goods Purchase item:

```ts
type LineInput = {
  matchStatus: InboundReceiptMatchStatus;
  receivedQuantity: string;
  note: string;
};
```

Initialize received quantity as an empty string. Disable submit unless every visible item:

- has a finite number;
- is in `0..availableQuantity`;
- has a note when different from `availableQuantity`.

Render hidden source input as `inboundGoodsPurchaseId`. Do not expose editable expected quantity.

- [ ] **Step 5: Run client/modal tests and verify GREEN**

- [ ] **Step 6: Commit**

```powershell
git add apps/web/features/inventory-management/api apps/web/features/inventory-management/components/InboundReceiptModal.tsx apps/web/features/inventory-management/components/__tests__/InboundReceiptModal.test.tsx apps/web/features/inventory-management/index.ts
git commit -m "feat: add shared goods receipt modal"
```

---

### Task 8: Inventory History and Item Review Modal

**Files:**
- Create: `apps/web/features/inventory-management/components/InboundReceiptReviewModal.tsx`
- Create: `apps/web/features/inventory-management/components/__tests__/InboundReceiptReviewModal.test.tsx`
- Modify: `apps/web/features/inventory-management/components/InboundReceiptTab.tsx`
- Modify: `apps/web/features/inventory-management/components/__tests__/InboundReceiptTab.test.tsx`
- Modify: `apps/web/features/inventory-management/components/InventoryWorkspace.tsx`
- Modify: `apps/web/features/inventory-management/components/__tests__/InventoryWorkspace.test.tsx`

**Interfaces:**
- Consumes: item mutation client functions and optional `goodsPurchaseId` URL filter.
- Produces per-item review UX and success callback.

- [ ] **Step 1: Write failing history/action/review tests**

```ts
expect(
  getInboundReceiptRowActions({
    status: "SUBMITTED",
    canApproveInboundReceipt: true,
    canRejectInboundReceipt: true,
    canEditInboundReceipt: true,
  }).map((action) => action.label),
).toEqual(["Proses", "Tolak"]);
```

Review modal source assertions:

```ts
expect(source).toContain("Belum Ada Aksi");
expect(source).toContain("Setujui Item");
expect(source).toContain("Edit");
expect(source).toContain("Hapus");
expect(source).toContain("Sesuai");
expect(source).toContain("Tidak Sesuai");
expect(source).toContain("Konflik Qty");
expect(source).not.toContain("Minta Revisi");
```

InventoryWorkspace test must assert parsing:

```ts
searchParams.get("tab");
searchParams.get("subtab");
searchParams.get("goodsPurchaseId");
```

- [ ] **Step 2: Run component tests and verify RED**

- [ ] **Step 3: Build review modal**

Rules:

- Approve button requires approve permission and is disabled for conflict.
- Edit/remove controls require edit permission.
- Edit approved line calls:

```ts
window.confirm(
  "Produk ini sudah disetujui. Edit akan mengembalikan status menjadi Belum Ada Aksi. Lanjutkan?",
);
```

- Remove approved line calls a destructive confirmation.
- Final mutation response closes modal and shows **Penerimaan Barang Telah Disetujui** when `finalized`.
- Header reject remains outside item list and requires a non-empty reason.

- [ ] **Step 4: Simplify history actions and remove revise**

Remove:

- `needsRevisionInboundReceipt` import and handler;
- `canReviseInboundReceipt`;
- Minta Revisi action;
- creator-only Edit & Ajukan path for new workflow.

Legacy `NEEDS_REVISION` rows remain visible without mutation actions.

- [ ] **Step 5: Implement deep-link filter**

`InventoryWorkspace` opens Transaksi > Penerimaan Barang when:

```ts
tab === "transactions" && subtab === "inbound"
```

Pass `goodsPurchaseId` to `InboundReceiptTab`, which calls:

```ts
fetchInboundReceipts({
  status: selectedStatus,
  goodsPurchaseId,
});
```

Render “Belum ada riwayat penerimaan untuk Pembelian Barang ini” when filtered data is empty.

- [ ] **Step 6: Run Inventory component tests**

Expected: modal/history/deep-link tests PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/features/inventory-management/components
git commit -m "feat: review inbound receipts per item"
```

---

### Task 9: Stock Log Receipt Bundle and Detail Modal

**Files:**
- Modify: `apps/web/app/api/inventory/logs/route.ts`
- Modify: `apps/web/app/api/inventory/logs/__tests__/route.test.ts`
- Modify: `apps/web/app/api/inventory/bulk/[batchId]/route.ts`
- Create: `apps/web/app/api/inventory/bulk/[batchId]/__tests__/route.test.ts`
- Modify: `apps/web/app/(main)/inventory/StockLogsTab.tsx`
- Modify: `apps/web/app/(main)/inventory/__tests__/StockLogsTab.test.tsx`
- Create: `apps/web/features/inventory-management/components/InboundReceiptStockBundleModal.tsx`
- Create: `apps/web/features/inventory-management/components/__tests__/InboundReceiptStockBundleModal.test.tsx`

**Interfaces:**
- Consumes: `BatchOperation.type = INBOUND_RECEIPT`, canonical logs, and all batch item snapshots.
- Produces read-only Stock Log bundle detail.

- [ ] **Step 1: Write failing bundle grouping tests**

```ts
expect(groupBulkLogs([inboundCanonicalLog])).toEqual([
  expect.objectContaining({
    kind: "bundle",
    batch: expect.objectContaining({
      type: "INBOUND_RECEIPT",
    }),
  }),
]);
```

Detail modal assertions:

```ts
expect(html).toContain("CV Kertas");
expect(html).toContain("PB-202607-001");
expect(html).toContain("Sebelum");
expect(html).toContain("Sesudah");
expect(html).toContain("Perubahan");
expect(html).toContain("Dus");
expect(html).toContain("Pack");
expect(html).toContain("Pcs");
```

List row assertion:

```ts
expect(listHtml).toContain("CV Kertas");
expect(listHtml).not.toContain("PB-202607-001");
```

- [ ] **Step 2: Run Stock Log tests and verify RED**

- [ ] **Step 3: Expose inbound batch detail**

Extend batch GET allowlist with `INBOUND_RECEIPT` and return all batch items ordered by creation, including `beforeSnapshot`, `afterSnapshot`, product identity, and linked canonical inventory log.

Do not create any new mutation endpoint for committed inbound bundles.

- [ ] **Step 4: Group and render bundle**

Add `INBOUND_RECEIPT` to `groupBulkLogs` bundle types. The list summary chooses:

```ts
productName: String(
  summary.supplierName || summary.title || "Supplier",
)
```

The detail modal reads `summary.goodsPurchaseNumber`; only the modal renders that value. Separate canonical movements from variant impacts using snapshot metadata written by the finalizer.

- [ ] **Step 5: Run Stock Log API/UI tests**

- [ ] **Step 6: Commit**

```powershell
git add apps/web/app/api/inventory/logs apps/web/app/api/inventory/bulk/[batchId] 'apps/web/app/(main)/inventory/StockLogsTab.tsx' 'apps/web/app/(main)/inventory/__tests__/StockLogsTab.test.tsx' apps/web/features/inventory-management/components/InboundReceiptStockBundleModal.tsx apps/web/features/inventory-management/components/__tests__/InboundReceiptStockBundleModal.test.tsx
git commit -m "feat: show inbound receipt stock bundles"
```

---

### Task 10: Supplier Quick Receipt, History Link, and Comparison

**Files:**
- Modify: `apps/web/features/suppliers/goods-purchases/types/goods-purchase.ts`
- Modify: `apps/web/features/suppliers/goods-purchases/repositories/goods-purchases-repository.ts`
- Modify: `apps/web/features/suppliers/goods-purchases/hooks/useGoodsPurchases.ts`
- Modify: `apps/web/features/suppliers/goods-purchases/api/goods-purchases-api.ts`
- Modify: `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseList.tsx`
- Create: `apps/web/features/suppliers/goods-purchases/components/GoodsPurchaseReceivingComparisonModal.tsx`
- Modify: `apps/web/features/suppliers/components/SupplierPageShell.tsx`
- Modify Supplier Goods Purchase UI/cache/repository tests.

**Interfaces:**
- Consumes: shared `InboundReceiptModal`, comparison endpoint, and fulfillment status.
- Produces Supplier status labels and navigation actions.

- [ ] **Step 1: Write failing Supplier UI tests**

```ts
expect(listSource).toContain("BARANG DITERIMA SEBAGIAN");
expect(listSource).toContain("BARANG DITERIMA");
expect(listSource).toContain("Barang Sudah Diterima?");
expect(listSource).toContain("Lihat Riwayat Penerimaan Barang");
expect(listSource).toContain("inventory");
expect(comparisonSource).toContain("Dipesan");
expect(comparisonSource).toContain("Diterima");
expect(comparisonSource).toContain("Pending");
expect(comparisonSource).toContain("Sisa");
```

Add cache tests proving receipt finalization invalidates:

```ts
["goods-purchases"]
["inventory-management"]
["inventory-logs"]
```

- [ ] **Step 2: Run Supplier tests and verify RED**

- [ ] **Step 3: Add fulfillment to Goods Purchase read models**

Map `fulfillmentStatus` in list/detail types. Display label priority:

```ts
function goodsPurchaseDisplayStatus(row: GoodsPurchaseListItem) {
  if (row.status !== "APPROVED") return row.status;
  if (row.fulfillmentStatus === "RECEIVED") return "BARANG DITERIMA";
  if (row.fulfillmentStatus === "PARTIALLY_RECEIVED") {
    return "BARANG DITERIMA SEBAGIAN";
  }
  return "DISETUJUI";
}
```

- [ ] **Step 4: Add quick receipt modal**

In `SupplierPageShell`, own:

```ts
const [receivingGoodsPurchaseId, setReceivingGoodsPurchaseId] =
  useState<string | null>(null);
```

Render shared modal:

```tsx
<InboundReceiptModal
  open={receivingGoodsPurchaseId !== null}
  initialGoodsPurchaseId={receivingGoodsPurchaseId}
  onClose={() => setReceivingGoodsPurchaseId(null)}
  onSuccess={() => {
    setReceivingGoodsPurchaseId(null);
    queryClient.invalidateQueries({ queryKey: ["goods-purchases"] });
  }}
/>
```

Show **Barang Sudah Diterima?** only for approved NOT_RECEIVED/PARTIALLY_RECEIVED purchases and users with `canPerform("inventory", "update")`.

- [ ] **Step 5: Add history link and comparison modal**

History link:

```ts
router.push(
  `/inventory?tab=transactions&subtab=inbound&goodsPurchaseId=${row.id}`,
);
```

Click partial/full row opens comparison modal populated by the new endpoint. Render cumulative table and receipt batch breakdown.

- [ ] **Step 6: Run Supplier tests**

- [ ] **Step 7: Commit**

```powershell
git add apps/web/features/suppliers/goods-purchases apps/web/features/suppliers/components/SupplierPageShell.tsx
git commit -m "feat: connect goods purchases to receiving"
```

---

### Task 11: Remove New-Flow Revision Surfaces and Synchronize Documentation

**Files:**
- Modify: `apps/web/features/help-documentation/components/HelpContent.tsx`
- Modify: `apps/web/features/help-documentation/components/app-shell-preview/pages/InventoryPreview.tsx`
- Modify: `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`
- Modify: `apps/web/features/ai-assistant/docs/help/inventory.md`
- Modify: `apps/web/features/ai-assistant/docs/help/faq.md`
- Modify: `apps/web/features/ai-assistant/services/assistant-tool-registry.ts` if modal action copy/source changes.
- Modify: relevant Help/AI tests.
- Create: `markdown-files/penerimaan-barang-pembelian-barang-2026-07-24.md`

**Interfaces:**
- Consumes: final user-visible workflow.
- Produces synchronized Help and AI guidance.

- [ ] **Step 1: Write failing documentation tests**

Assert the combined Help/AI source:

```ts
expect(content).toContain("Pilih Pembelian Barang");
expect(content).toContain("Sesuai");
expect(content).toContain("Tidak Sesuai");
expect(content).toContain("Barang Sudah Diterima?");
expect(content).toContain("Lihat Riwayat Penerimaan Barang");
expect(content).toContain("stok bersama");
expect(content).toContain("bundle");
expect(content).not.toContain("Pilih invoice daftar belanja");
expect(content).not.toContain("Minta Revisi");
```

- [ ] **Step 2: Run Help/AI tests and verify RED**

- [ ] **Step 3: Update user guidance**

Document:

- create from approved Goods Purchase;
- manual match badge and difference note;
- pending reservation warnings;
- per-item review and whole-document reject;
- stock only after final approval;
- partial repeat receipts;
- shared-stock variants and supplier-titled Stock Log bundle;
- Supplier quick actions and comparison.

Keep legacy receipt wording clearly labeled as legacy history.

- [ ] **Step 4: Write technical feature documentation**

The markdown file must include:

- data model and migration;
- API list;
- RBAC keys;
- quantity formulas;
- atomic finalization;
- bundle semantics;
- legacy compatibility;
- test commands.

- [ ] **Step 5: Run Help/AI tests**

- [ ] **Step 6: Commit**

```powershell
git add apps/web/features/help-documentation apps/web/features/ai-assistant markdown-files/penerimaan-barang-pembelian-barang-2026-07-24.md
git commit -m "docs: document goods purchase receiving"
```

---

### Task 12: Final Regression, Review, and Handoff

**Files:**
- Verify all files changed in Tasks 1–11.
- Do not modify unrelated user files.

**Interfaces:**
- Consumes the complete implementation.
- Produces validation evidence and a review-ready main branch.

- [ ] **Step 1: Run focused feature suites**

```powershell
cd apps/web
.\node_modules\.bin\vitest.cmd run features/inventory-management app/api/inventory-management features/suppliers/goods-purchases features/rbac/helpers/__tests__ app/'(main)'/inventory/__tests__/StockLogsTab.test.tsx features/help-documentation/__tests__ features/ai-assistant/workflows/__tests__/workflow-catalog.test.ts
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run TypeScript checks without production build**

```powershell
.\node_modules\.bin\tsc.CMD --noEmit -p apps/web/tsconfig.json
.\node_modules\.bin\tsc.CMD --noEmit -p packages/db/tsconfig.json
.\node_modules\.bin\tsc.CMD --noEmit -p packages/ui/tsconfig.json
.\node_modules\.bin\tsc.CMD --noEmit -p packages/config/tsconfig.json
.\node_modules\.bin\tsc.CMD --noEmit -p packages/product-import-worker/tsconfig.json
.\node_modules\.bin\tsc.CMD --noEmit -p apps/admin/tsconfig.json
```

Expected: all commands exit 0.

- [ ] **Step 3: Validate Prisma and targeted ESLint**

```powershell
$env:DATABASE_URL='postgresql://user:pass@localhost:5432/db'
$env:DIRECT_URL='postgresql://user:pass@localhost:5432/db'
pnpm.cmd --filter @pos/db exec prisma validate
$files = git diff --name-only 3c392d6..HEAD -- 'apps/web/**/*.ts' 'apps/web/**/*.tsx'
& .\node_modules\.bin\eslint.CMD $files
git diff --check
```

Expected: Prisma valid, ESLint no errors, and diff check clean.

- [ ] **Step 4: Perform requirement audit**

Verify with repository searches and tests:

```powershell
rg -n "shoppingRequestId|Invoice Daftar Belanja|Minta Revisi" apps/web/features/inventory-management apps/web/app/api/inventory-management/inbound-receipts
rg -n "inventory.inbound_receipt.(approve|reject|edit)" apps/web/features/rbac apps/web/app/api/inventory-management/inbound-receipts
rg -n "INBOUND_RECEIPT|stockBundleId|fulfillmentStatus" packages/db/prisma apps/web
```

Expected:

- old source/revision copy only remains in explicitly labeled legacy compatibility code/tests;
- all three RBAC resources exist;
- bundle and fulfillment relations are present.

- [ ] **Step 5: Request code review**

Use `superpowers:requesting-code-review` against the implementation range. Require reviewer focus on:

- double stock mutation;
- duplicate canonical cost movements;
- same-group multi-line aggregation;
- over-receipt race conditions;
- cross-store relation access;
- stale pending conflicts;
- legacy receipt regressions;
- Supplier/Inventory cache invalidation.

- [ ] **Step 6: Fix confirmed findings with TDD**

For each confirmed finding:

1. Add a failing regression test.
2. Run the focused test and confirm RED.
3. Apply the smallest fix.
4. Run focused test and confirm GREEN.
5. Commit with `fix:` message.

- [ ] **Step 7: Final status and commit audit**

```powershell
git status -sb
git log --oneline -15
```

Expected: only the pre-existing user changes remain unstaged:

- `apps/web/app/providers.tsx`
- `apps/web/lib/number-input-guard.ts`
- `apps/web/lib/__tests__/number-input-guard.test.ts`

Do not push unless the user explicitly requests it.
