# Transaction-Owned Surat Jalan Stock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new transactions the single owner of stock deduction while preserving legacy Surat Jalan stock behavior and adding RBAC-configurable Surat Jalan auto-approval.

**Architecture:** Add a transaction-level stock-source enum that snapshots behavior at creation time: pre-migration rows use `SURAT_JALAN`, and new rows default to `TRANSACTION`. Surat Jalan planning, creation, approval, and UI branch on that immutable source; a dedicated `surat_jalan.auto_approve:create` capability controls document status only for new-mode transactions.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma/PostgreSQL, React Query, Vitest, repository RBAC helpers.

## Global Constraints

- Use test-driven development: every production behavior must have a failing test observed before implementation.
- Do not run `pnpm build`.
- Do not start or stop `pnpm dev`; the user owns the development server lifecycle.
- New user-visible text must use friendly Indonesian.
- New transactions with `COMPLETED` or `DP` status deduct stock at save; `PENDING_APPROVAL` and `DRAFT` do not deduct until their transaction approval.
- Existing transactions at migration time must remain on the legacy Surat Jalan-managed stock flow without stock reconciliation.
- Surat Jalan creation, approval, printing, and marking for new transactions must never mutate stock or write stock movement logs.
- Update Help content and AI Assistant workflow knowledge because this changes a major existing feature.
- Preserve unrelated `AGENTS.md`, `CLAUDE.md`, and any other user-owned worktree changes.

## File Map

- `packages/db/prisma/schema.prisma`: define the stock-source enum and transaction field.
- `packages/db/prisma/migrations/20260823_transaction_stock_deduction_source/migration.sql`: mark existing rows legacy and default future rows to transaction-owned stock.
- `apps/web/features/rbac/helpers/rbac-core.ts`: register and default `surat_jalan.auto_approve`.
- `apps/web/features/rbac/helpers/rbac-settings-ui.ts`: expose auto-approval as its own critical RBAC module.
- `apps/web/components/settings/RbacTab.tsx`: render a human label and only the meaningful Create toggle.
- `apps/web/features/surat-jalan/helpers/surat-jalan-lifecycle.ts`: produce mode-aware status and stock movement plans.
- `apps/web/app/api/transactions/[id]/surat-jalan/route.ts`: resolve RBAC auto-approval and execute only mode-appropriate stock plans.
- `apps/web/app/api/surat-jalan/[id]/approval/route.ts`: make approval document-only in transaction mode.
- `apps/web/app/api/surat-jalan/route.ts`: expose the parent transaction stock source to inventory views.
- `apps/web/features/surat-jalan/types/surat-jalan.ts` and `api/surat-jalan-api.ts`: carry the stock source through UI types.
- `apps/web/features/surat-jalan/components/SuratJalanHeader.tsx`: explain the correct stock owner.
- `apps/web/features/surat-jalan/components/SuratJalanForm.tsx`: remove stock confirmation and stock validation in transaction mode.
- `apps/web/features/surat-jalan/components/SuratJalanQuantityTable.tsx`: hide stock columns in transaction mode while retaining legacy preview.
- `apps/web/features/inventory-management/components/InventorySuratJalanTab.tsx` and `InventoryWorkspace.tsx`: describe approval as document approval where appropriate.
- `apps/web/features/help-documentation/components/HelpContent.tsx`, AI help Markdown, and `workflow-catalog.ts`: synchronize user and assistant documentation.

---

### Task 1: Persist the transaction stock-source boundary

**Files:**
- Create: `apps/web/features/surat-jalan/helpers/__tests__/surat-jalan-stock-source-migration.test.ts`
- Create: `packages/db/prisma/migrations/20260823_transaction_stock_deduction_source/migration.sql`
- Modify: `packages/db/prisma/schema.prisma`

**Interfaces:**
- Produces: Prisma enum `TransactionStockDeductionSource` with values `TRANSACTION | SURAT_JALAN`.
- Produces: required `Transaction.stockDeductionSource` defaulting to `TRANSACTION` for future inserts.
- Preserves: existing `Transaction.stockManagedBySuratJalan` for legacy runtime state.

- [ ] **Step 1: Write the failing migration contract test**

Create a source contract test that fails cleanly while the migration and schema declarations are absent:

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const schemaPath = join(process.cwd(), "../../packages/db/prisma/schema.prisma");
const migrationPath = join(
  process.cwd(),
  "../../packages/db/prisma/migrations/20260823_transaction_stock_deduction_source/migration.sql",
);

describe("transaction stock deduction source migration", () => {
  it("keeps existing transactions on Surat Jalan and defaults new transactions to transaction stock", () => {
    const schema = readFileSync(schemaPath, "utf8");
    const migration = existsSync(migrationPath)
      ? readFileSync(migrationPath, "utf8")
      : "";

    expect(schema).toContain("enum TransactionStockDeductionSource");
    expect(schema).toContain("stockDeductionSource TransactionStockDeductionSource @default(TRANSACTION)");
    expect(migration).toContain("CREATE TYPE \"TransactionStockDeductionSource\"");
    expect(migration).toContain("UPDATE \"pos_transactions\" SET \"stockDeductionSource\" = 'SURAT_JALAN'");
    expect(migration).toContain("SET DEFAULT 'TRANSACTION'");
    expect(migration).toContain("SET NOT NULL");
  });
});
```

- [ ] **Step 2: Run the migration test and verify RED**

Run:

```powershell
pnpm --filter @pos/web exec vitest run features/surat-jalan/helpers/__tests__/surat-jalan-stock-source-migration.test.ts
```

Expected: FAIL because the schema does not contain `TransactionStockDeductionSource` and the migration source is empty.

- [ ] **Step 3: Add the Prisma enum, field, and ordered migration**

Add to `Transaction`:

```prisma
stockDeductionSource TransactionStockDeductionSource @default(TRANSACTION)
```

Add the enum:

```prisma
enum TransactionStockDeductionSource {
  TRANSACTION
  SURAT_JALAN
}
```

Create migration SQL in this exact order:

```sql
CREATE TYPE "TransactionStockDeductionSource" AS ENUM ('TRANSACTION', 'SURAT_JALAN');

ALTER TABLE "pos_transactions"
ADD COLUMN "stockDeductionSource" "TransactionStockDeductionSource";

UPDATE "pos_transactions"
SET "stockDeductionSource" = 'SURAT_JALAN';

ALTER TABLE "pos_transactions"
ALTER COLUMN "stockDeductionSource" SET DEFAULT 'TRANSACTION',
ALTER COLUMN "stockDeductionSource" SET NOT NULL;
```

- [ ] **Step 4: Generate Prisma client and verify GREEN**

Run:

```powershell
pnpm db:generate
pnpm --filter @pos/web exec vitest run features/surat-jalan/helpers/__tests__/surat-jalan-stock-source-migration.test.ts
```

Expected: Prisma generation succeeds and the test passes.

- [ ] **Step 5: Commit the data boundary**

```powershell
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/20260823_transaction_stock_deduction_source/migration.sql apps/web/features/surat-jalan/helpers/__tests__/surat-jalan-stock-source-migration.test.ts
git commit -m "feat: version transaction stock ownership"
```

---

### Task 2: Add RBAC-configurable Surat Jalan auto-approval

**Files:**
- Modify: `apps/web/features/rbac/helpers/__tests__/rbac-core.test.ts`
- Modify: `apps/web/features/rbac/helpers/__tests__/rbac-settings-ui.test.ts`
- Modify: `apps/web/features/rbac/helpers/__tests__/rbac-tab-view.test.tsx`
- Modify: `apps/web/features/rbac/helpers/rbac-core.ts`
- Modify: `apps/web/features/rbac/helpers/rbac-settings-ui.ts`
- Modify: `apps/web/components/settings/RbacTab.tsx`

**Interfaces:**
- Produces: resource target `surat_jalan.auto_approve`.
- Produces: capability lookup `canRolePerformAction(role, "surat_jalan.auto_approve", "create", permissions)`.
- Defaults: ADMIN, CASHIER, and SALES allowed; INVENTORY denied; OWNER allowed implicitly.

- [ ] **Step 1: Write failing RBAC default and configurability tests**

Add to `rbac-core.test.ts`:

```ts
it("defaults Surat Jalan auto approval on for document creators and keeps it configurable", () => {
  const defaults = buildDefaultRolePermissions();

  expect(RESOURCE_TARGETS).toContain("surat_jalan.auto_approve");
  expect(canRolePerformAction("OWNER", "surat_jalan.auto_approve", "create", defaults)).toBe(true);
  expect(canRolePerformAction("ADMIN", "surat_jalan.auto_approve", "create", defaults)).toBe(true);
  expect(canRolePerformAction("CASHIER", "surat_jalan.auto_approve", "create", defaults)).toBe(true);
  expect(canRolePerformAction("SALES", "surat_jalan.auto_approve", "create", defaults)).toBe(true);
  expect(canRolePerformAction("INVENTORY", "surat_jalan.auto_approve", "create", defaults)).toBe(false);

  const customized = normalizeRolePermissions([
    { role: "SALES", scope: "resource", target: "surat_jalan.auto_approve", action: "create", allowed: false },
  ]);
  expect(canRolePerformAction("SALES", "surat_jalan.auto_approve", "create", customized)).toBe(false);
});
```

Add a module assertion to `rbac-settings-ui.test.ts` requiring a critical `surat-jalan-auto-approve` module with `resourceTargets: ["surat_jalan.auto_approve"]`. Add a render assertion to `rbac-tab-view.test.tsx` that the Surat Jalan module contains `Auto Approve Surat Jalan` and its explanatory Indonesian copy.

- [ ] **Step 2: Run focused RBAC tests and verify RED**

```powershell
pnpm --filter @pos/web exec vitest run features/rbac/helpers/__tests__/rbac-core.test.ts features/rbac/helpers/__tests__/rbac-settings-ui.test.ts features/rbac/helpers/__tests__/rbac-tab-view.test.tsx
```

Expected: FAIL because the resource, module, defaults, and label do not exist.

- [ ] **Step 3: Implement the resource defaults and settings presentation**

In `rbac-core.ts`, append `surat_jalan.auto_approve` to `RESOURCE_TARGETS` and add:

```ts
"surat_jalan.auto_approve": {
  read: [],
  create: ["ADMIN", "CASHIER", "SALES"],
  update: [],
  delete: [],
},
```

In `rbac-settings-ui.ts`, add a critical module dedicated to Surat Jalan auto-approval. In `RbacTab.tsx`, treat both auto-approve resources as create-only, label this one `Auto Approve Surat Jalan`, and display: `Aktifkan aksi Buat agar Surat Jalan role ini langsung dikonfirmasi tanpa menunggu approval.`

- [ ] **Step 4: Re-run focused RBAC tests and verify GREEN**

Run the command from Step 2. Expected: all three files pass.

- [ ] **Step 5: Commit RBAC support**

```powershell
git add apps/web/features/rbac/helpers/rbac-core.ts apps/web/features/rbac/helpers/rbac-settings-ui.ts apps/web/components/settings/RbacTab.tsx apps/web/features/rbac/helpers/__tests__/rbac-core.test.ts apps/web/features/rbac/helpers/__tests__/rbac-settings-ui.test.ts apps/web/features/rbac/helpers/__tests__/rbac-tab-view.test.tsx
git commit -m "feat: configure surat jalan auto approval"
```

---

### Task 3: Make the Surat Jalan planner mode-aware

**Files:**
- Modify: `apps/web/features/surat-jalan/types/surat-jalan.ts`
- Modify: `apps/web/features/surat-jalan/helpers/surat-jalan-lifecycle.ts`
- Modify: `apps/web/features/surat-jalan/helpers/__tests__/surat-jalan-lifecycle.test.ts`

**Interfaces:**
- Consumes: `stockDeductionSource: "TRANSACTION" | "SURAT_JALAN"` and `autoApprove: boolean`.
- Produces: `SuratJalanCreationPlan` where transaction mode has no reversal or delivery movements and legacy mode preserves current movements.
- Produces: transaction-mode item snapshots with `stockBefore: null` and `stockAfter: null`.

- [ ] **Step 1: Write failing planner tests for both transaction-mode statuses**

Add two tests using the existing fixture:

```ts
it("confirms transaction-owned Surat Jalan without stock movements when auto approval is allowed", () => {
  const plan = planSuratJalanCreation({
    transaction: {
      id: "txn-new",
      status: "COMPLETED",
      stockDeductionSource: "TRANSACTION",
      stockManagedBySuratJalan: false,
      customerName: "PT Teladan",
      items: invoiceItems,
    },
    existingSuratJalan: [],
    quantities: { "item-paper": 4 },
    keterangan: {},
    recipientName: "Gudang PT Teladan",
    actor: { id: "cashier-1", name: "Cashier", role: "CASHIER" },
    autoApprove: true,
    number: "TLD-23082026-001",
    now: new Date("2026-08-23T04:00:00.000Z"),
  });

  expect(plan.status).toBe("CONFIRMED");
  expect(plan.shouldMarkTransactionManaged).toBe(false);
  expect(plan.invoiceReversalMovements).toEqual([]);
  expect(plan.deliveryStockMovements).toEqual([]);
  expect(plan.items[0]).toEqual(expect.objectContaining({ stockBefore: null, stockAfter: null }));
});
```

Repeat with `autoApprove: false` and assert `status === "PENDING"`, empty approver metadata, and no movements. Update existing legacy test inputs with `stockDeductionSource: "SURAT_JALAN"` and `autoApprove: true`, while preserving every current movement assertion.

- [ ] **Step 2: Run the lifecycle test and verify RED**

```powershell
pnpm --filter @pos/web exec vitest run features/surat-jalan/helpers/__tests__/surat-jalan-lifecycle.test.ts
```

Expected: assertion FAIL because the planner ignores the new source and still reverses transaction-owned stock.

- [ ] **Step 3: Implement source-aware planning**

Extend `SuratJalanCreationTransaction` and planner input, then resolve status with:

```ts
const usesTransactionStock = input.transaction.stockDeductionSource === "TRANSACTION";
const status: SuratJalanStatus = usesTransactionStock
  ? input.autoApprove ? "CONFIRMED" : "PENDING"
  : isFirstSuratJalan ? "CONFIRMED" : "PENDING";
const shouldReverseInvoice =
  !usesTransactionStock &&
  isFirstSuratJalan &&
  !input.transaction.stockManagedBySuratJalan;
```

Only calculate `stockBefore`, enforce stock sufficiency, and produce delivery movements when `usesTransactionStock` is false. Keep quantity/eligibility validation common to both modes.

- [ ] **Step 4: Run lifecycle and core tests and verify GREEN**

```powershell
pnpm --filter @pos/web exec vitest run features/surat-jalan/helpers/__tests__/surat-jalan-lifecycle.test.ts features/surat-jalan/helpers/__tests__/surat-jalan-core.test.ts
```

Expected: all planner and progress tests pass.

- [ ] **Step 5: Commit the planner boundary**

```powershell
git add apps/web/features/surat-jalan/types/surat-jalan.ts apps/web/features/surat-jalan/helpers/surat-jalan-lifecycle.ts apps/web/features/surat-jalan/helpers/__tests__/surat-jalan-lifecycle.test.ts
git commit -m "refactor: separate surat jalan stock modes"
```

---

### Task 4: Apply stock-source and RBAC rules during Surat Jalan creation

**Files:**
- Modify: `apps/web/app/api/transactions/[id]/surat-jalan/__tests__/route.test.ts`
- Modify: `apps/web/app/api/transactions/[id]/surat-jalan/route.ts`

**Interfaces:**
- Consumes: `getGlobalRolePermissions()` and `canRolePerformAction()`.
- Consumes: planner inputs `stockDeductionSource` and `autoApprove` from Task 3.
- Produces: bundle field `transaction.stockDeductionSource`.

- [ ] **Step 1: Write failing create-route tests for new mode**

Extend mocks for `getGlobalRolePermissions` and `canRolePerformAction`. Add one auto-approved case and one pending case. In both, return a transaction with `stockDeductionSource: "TRANSACTION"` and assert:

```ts
expect(body.status).toBe("CONFIRMED");
expect(productUpdateManyMock).not.toHaveBeenCalled();
expect(transactionUpdateMock).not.toHaveBeenCalled();
expect(inventoryLogCreateManyMock).not.toHaveBeenCalled();
```

For the permission-disabled case, make `canRolePerformAction` return false for `surat_jalan.auto_approve`, then assert `body.status === "PENDING"` and the same no-stock side effects. Rename the existing stock reversal test to explicitly say `legacy` and give its fixture `stockDeductionSource: "SURAT_JALAN"`.

- [ ] **Step 2: Run the route test and verify RED**

```powershell
pnpm --filter @pos/web exec vitest run 'app/api/transactions/[id]/surat-jalan/__tests__/route.test.ts'
```

Expected: FAIL because creation still uses sequence-only status and does not resolve the new capability/source.

- [ ] **Step 3: Resolve auto-approval and execute the planner output**

Load global permissions once per request, calculate:

```ts
const autoApprove = canRolePerformAction(
  user.role as Role,
  "surat_jalan.auto_approve",
  "create",
  permissions,
);
```

Pass `transaction.stockDeductionSource` and `autoApprove` into the planner. Return `stockDeductionSource` in GET bundle data. Keep existing movement execution because Task 3 guarantees transaction-mode movement arrays are empty. Update `stockManagedBySuratJalan` only when `plan.shouldMarkTransactionManaged` is true.

- [ ] **Step 4: Run create-route and lifecycle tests and verify GREEN**

```powershell
pnpm --filter @pos/web exec vitest run 'app/api/transactions/[id]/surat-jalan/__tests__/route.test.ts' features/surat-jalan/helpers/__tests__/surat-jalan-lifecycle.test.ts
```

Expected: new-mode and legacy cases pass.

- [ ] **Step 5: Commit creation behavior**

```powershell
git add 'apps/web/app/api/transactions/[id]/surat-jalan/route.ts' 'apps/web/app/api/transactions/[id]/surat-jalan/__tests__/route.test.ts'
git commit -m "feat: keep new surat jalan document only"
```

---

### Task 5: Make new-mode Surat Jalan approval document-only

**Files:**
- Modify: `apps/web/app/api/surat-jalan/[id]/approval/__tests__/route.test.ts`
- Modify: `apps/web/app/api/surat-jalan/[id]/approval/route.ts`

**Interfaces:**
- Consumes: `suratJalan.transaction.stockDeductionSource`.
- Produces: transaction-mode transition `PENDING -> CONFIRMED` with approver metadata and no stock side effects.
- Preserves: current legacy stock validation, deduction, and inventory logging.

- [ ] **Step 1: Write failing approval tests for the branch boundary**

Add a transaction-mode test fixture and assert:

```ts
expect(response.status).toBe(200);
expect(productUpdateManyMock).not.toHaveBeenCalled();
expect(inventoryLogCreateManyMock).not.toHaveBeenCalled();
expect(suratJalanUpdateMock).toHaveBeenCalledWith(
  expect.objectContaining({
    data: expect.objectContaining({
      status: "CONFIRMED",
      approvedById: "owner-1",
    }),
  }),
);
```

Update the current stock-deduction approval test fixture with `stockDeductionSource: "SURAT_JALAN"` so it remains an explicit legacy regression.

- [ ] **Step 2: Run the approval test and verify RED**

```powershell
pnpm --filter @pos/web exec vitest run 'app/api/surat-jalan/[id]/approval/__tests__/route.test.ts'
```

Expected: FAIL because approval still checks and deducts stock for transaction-owned records.

- [ ] **Step 3: Branch approval side effects by stock source**

After common document quantity validation, calculate:

```ts
const usesLegacyStock =
  suratJalan.transaction.stockDeductionSource === "SURAT_JALAN";
```

Wrap current stock sufficiency checks, `applyProductStockDelta` calls, and `inventoryLog.createMany` in `usesLegacyStock`. Keep the status update common and atomic.

- [ ] **Step 4: Re-run approval tests and verify GREEN**

Run the command from Step 2. Expected: transaction-mode document-only and legacy stock-moving tests pass.

- [ ] **Step 5: Commit approval behavior**

```powershell
git add 'apps/web/app/api/surat-jalan/[id]/approval/route.ts' 'apps/web/app/api/surat-jalan/[id]/approval/__tests__/route.test.ts'
git commit -m "feat: separate surat jalan approval from stock"
```

---

### Task 6: Present transaction-owned Surat Jalan as a document workflow

**Files:**
- Modify: `apps/web/app/api/surat-jalan/route.ts`
- Modify: `apps/web/features/surat-jalan/api/surat-jalan-api.ts`
- Modify: `apps/web/features/surat-jalan/types/surat-jalan.ts`
- Modify: `apps/web/features/surat-jalan/components/SuratJalanHeader.tsx`
- Modify: `apps/web/features/surat-jalan/components/SuratJalanForm.tsx`
- Modify: `apps/web/features/surat-jalan/components/SuratJalanQuantityTable.tsx`
- Modify: `apps/web/features/surat-jalan/components/__tests__/stock-action-text.test.ts`
- Modify: `apps/web/features/surat-jalan/components/__tests__/surat-jalan-modal-ui.test.ts`
- Modify: `apps/web/components/__tests__/stock-action-text.test.ts`
- Modify: `apps/web/features/inventory-management/components/InventorySuratJalanTab.tsx`
- Modify: `apps/web/features/inventory-management/components/InventoryWorkspace.tsx`

**Interfaces:**
- Consumes: `transaction.stockDeductionSource` from both bundle endpoints.
- Produces: mode-aware UI with document-only copy for `TRANSACTION` and unchanged stock preview for `SURAT_JALAN`.

- [ ] **Step 1: Write failing UI source and rendering contracts**

Replace the unconditional header-copy assertion with checks for both messages:

```ts
expect(source).toContain("Stok sudah dicatat saat transaksi disimpan atau disetujui.");
expect(source).toContain("Transaksi lama ini masih memakai Surat Jalan sebagai acuan stok.");
```

Update modal UI tests to require `Simpan Surat Jalan`, require the legacy `Ya, Kurangi Stok`, and require branching on `stockDeductionSource`. Add an inventory wording assertion requiring `Approval dokumen tidak mengubah stok transaksi baru.`

- [ ] **Step 2: Run focused UI tests and verify RED**

```powershell
pnpm --filter @pos/web exec vitest run features/surat-jalan/components/__tests__/stock-action-text.test.ts features/surat-jalan/components/__tests__/surat-jalan-modal-ui.test.ts components/__tests__/stock-action-text.test.ts
```

Expected: FAIL because the new stock-source copy and document-only action are absent.

- [ ] **Step 3: Carry the source through APIs and types**

Add `stockDeductionSource: "TRANSACTION" | "SURAT_JALAN"` to `SuratJalanReceiptTransaction` and the bundle transaction type. Add it to the explicit transaction selection/mapping in `app/api/surat-jalan/route.ts`.

- [ ] **Step 4: Implement mode-aware components**

In each component derive:

```ts
const usesTransactionStock =
  bundle.transaction.stockDeductionSource === "TRANSACTION";
```

For transaction mode:

- render `Stok sudah dicatat saat transaksi disimpan atau disetujui.`;
- skip stock-impact preview and insufficient-stock validation;
- hide `Stok Saat Ini` and `Stok Setelah` columns/cells;
- replace the stock warning with a document confirmation explaining that stock will not change;
- use `Simpan Surat Jalan` as the final action.

For legacy mode, retain current preview, stock validation, warning, columns, and `Ya, Kurangi Stok` action. Replace inventory summary copy that promises stock-out approval with wording that distinguishes document approval for new transactions.

- [ ] **Step 5: Re-run UI tests and verify GREEN**

Run the command from Step 2. Expected: all focused UI contracts pass.

- [ ] **Step 6: Commit UI behavior**

```powershell
git add apps/web/app/api/surat-jalan/route.ts apps/web/features/surat-jalan/api/surat-jalan-api.ts apps/web/features/surat-jalan/types/surat-jalan.ts apps/web/features/surat-jalan/components apps/web/components/__tests__/stock-action-text.test.ts apps/web/features/inventory-management/components/InventorySuratJalanTab.tsx apps/web/features/inventory-management/components/InventoryWorkspace.tsx
git commit -m "feat: clarify surat jalan document workflow"
```

---

### Task 7: Synchronize user documentation and AI workflow knowledge

**Files:**
- Create: `D:\main_project\pos-system-monorepo\markdown-files\surat-jalan-stock-source-2026-08-23.md`
- Modify: `apps/web/features/help-documentation/components/HelpContent.tsx`
- Modify: `apps/web/features/ai-assistant/docs/help/history.md`
- Modify: `apps/web/features/ai-assistant/docs/help/inventory.md`
- Modify: `apps/web/features/ai-assistant/docs/help/faq.md`
- Modify: `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`
- Modify: `apps/web/features/help-documentation/__tests__/HelpContent.test.tsx`
- Modify: `apps/web/features/ai-assistant/workflows/__tests__/workflow-catalog.test.ts`

**Interfaces:**
- Produces: one consistent user explanation of transaction stock timing and Surat Jalan document approval.
- Preserves: marking options and the `UNMARKED` day check-out blocker.

- [ ] **Step 1: Write failing documentation contracts**

Add source assertions to `HelpContent.test.tsx` and catalog assertions to `workflow-catalog.test.ts` requiring these exact concepts:

```ts
expect(helpSource).toContain("Stok barang dikurangi saat transaksi disimpan atau disetujui");
expect(helpSource).toContain("Surat Jalan transaksi baru tidak mengurangi stok lagi");
expect(workflowSource).toContain("Approval Surat Jalan hanya mengonfirmasi dokumen dan tidak mengurangi stok transaksi baru");
```

- [ ] **Step 2: Run the selected documentation tests and verify RED**

Run:

```powershell
pnpm --filter @pos/web exec vitest run features/help-documentation/__tests__/HelpContent.test.tsx features/ai-assistant/workflows/__tests__/workflow-catalog.test.ts
```

Expected: FAIL because the new workflow explanation is absent.

- [ ] **Step 3: Update Help, AI docs, and workflow catalog**

Document these rules in friendly Indonesian:

- auto-approved transaction saves deduct stock immediately;
- pending and draft transactions wait for transaction approval;
- transaction-owned Surat Jalan does not change stock during create, approval, print, or marking;
- Surat Jalan may be immediately confirmed or pending based on RBAC;
- legacy transactions retain their prior stock behavior;
- marking remains operational and `UNMARKED` still blocks inventory check-out.

Create the dated external markdown feature document with the same workflow, migration boundary, RBAC capability, and operational verification steps. Because the required `D:\main_project` path is outside the workspace root, request filesystem approval before creating it and use `apply_patch` after approval.

- [ ] **Step 4: Re-run documentation tests and verify GREEN**

Run the test command from Step 2. Expected: all documentation contracts pass.

- [ ] **Step 5: Commit repository documentation**

Stage only repository files; the external markdown file is delivered separately because it is outside this Git worktree.

```powershell
git add apps/web/features/help-documentation/components/HelpContent.tsx apps/web/features/ai-assistant/docs/help/history.md apps/web/features/ai-assistant/docs/help/inventory.md apps/web/features/ai-assistant/docs/help/faq.md apps/web/features/ai-assistant/workflows/workflow-catalog.ts
git commit -m "docs: explain transaction-owned surat jalan stock"
```

---

### Task 8: Run regression validation without disrupting HMR

**Files:**
- Verify only; no production file is created by this task.

**Interfaces:**
- Consumes: all deliverables from Tasks 1-7.
- Produces: evidence that focused behavior, full web tests, lint/type-check, and formatting are clean.

- [ ] **Step 1: Run the complete Surat Jalan and RBAC test set**

```powershell
pnpm --filter @pos/web exec vitest run features/surat-jalan 'app/api/transactions/[id]/surat-jalan' app/api/surat-jalan features/rbac/helpers/__tests__
```

Expected: all tests pass with no warnings or unhandled errors.

- [ ] **Step 2: Run transaction stock regressions**

```powershell
pnpm --filter @pos/web exec vitest run app/api/transactions/__tests__/create-route.test.ts 'app/api/transactions/[id]/approve/__tests__/route.test.ts' 'app/api/transactions/[id]/approve-draft/__tests__/route.test.ts' 'app/api/transactions/[id]/items/__tests__' app/api/offline-sync/transactions/__tests__/route.test.ts
```

Expected: auto-approved save deducts, pending/draft save does not, approvals deduct once, and offline behavior remains aligned.

- [ ] **Step 3: Run project validation commands**

```powershell
pnpm lint
pnpm type-check
git diff --check
```

Expected: all commands exit 0. Do not substitute `pnpm build`.

- [ ] **Step 4: Review the final diff and worktree boundaries**

```powershell
git status -sb
git diff --stat 16f114d..HEAD
```

Confirm that `AGENTS.md`, `CLAUDE.md`, and unrelated user files were not staged or modified by implementation.

- [ ] **Step 5: Commit any validation-only test corrections**

If validation required a test correction, stage only those test files and commit:

```powershell
git commit -m "test: cover transaction-owned surat jalan flow"
```

If no test correction was needed, do not create an empty commit.
