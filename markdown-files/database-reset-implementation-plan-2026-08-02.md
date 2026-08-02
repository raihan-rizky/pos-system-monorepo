# Database Reset Implementation Plan

> **For agentic workers:** Implement this plan task-by-task using the repository's execution workflow. Every step is checkbox-tracked and ends with a focused test or review.

**Goal:** Add an owner-only Settings flow that previews and atomically deletes selected operational data for the current store while preserving users, settings, RBAC, and shared data.

**Architecture:** A focused `database-reset` feature owns a typed domain registry, dependency planner, preview counts, preserved-data reporting, and child-first transactional deletion. Two owner-only route handlers expose preview and execute operations; a TanStack Query hook and Reset Database tab consume them.

**Tech Stack:** Next.js App Router, React, TanStack Query, Prisma, Zod, Vitest, Playwright, existing RBAC guard and UI primitives.

## Global Constraints

- Both routes must call `requireRole("OWNER")`; frontend visibility is not authorization.
- Every database operation is scoped to the authenticated user's `storeId`.
- Preserve `User`, `Store`, `StoreSettings`, `RolePermission`, global `Category`, assistant chat/session/message data, vector/document data, and shared legacy tables.
- Do not run `pnpm build`; use `pnpm dev` only if an existing server is needed for browser verification.
- Keep user-visible copy in friendly Indonesian; retain technical terms such as `RESET DATABASE`, `cascade`, and `RBAC` where useful.
- Use TDD for each implementation unit: failing test, verify failure, minimum implementation, focused pass, commit.
- Update HelpContent after implementation. Do not update `workflow-catalog.ts` because this is not a guided AI workflow.

## File map

Create:

- `apps/web/features/database-reset/types/database-reset.ts` — domain union, confirmation constant, plan/preview/summary types.
- `apps/web/features/database-reset/helpers/database-reset-registry.ts` — allowlisted domain definitions, model membership, scope builders, dependency metadata.
- `apps/web/features/database-reset/helpers/database-reset-plan.ts` — plan creation, dependency closure, counts, preserved reporting, operation ordering, transactional execution.
- `apps/web/features/database-reset/helpers/__tests__/database-reset-plan.test.ts` — planner/execution tests with mocked Prisma access.
- `apps/web/app/api/settings/database-reset/preview/route.ts` and `.../preview/__tests__/route.test.ts`.
- `apps/web/app/api/settings/database-reset/execute/route.ts` and `.../execute/__tests__/route.test.ts`.
- `apps/web/hooks/useDatabaseReset.ts` — preview/execute TanStack Query mutations.
- `apps/web/components/settings/DatabaseResetTab.tsx` — danger-zone UI plus prop-driven `DatabaseResetView`.
- `apps/web/features/database-reset/__tests__/DatabaseResetTab.test.tsx` — static UI tests.

Modify:

- `apps/web/app/(main)/settings/page.tsx` — owner-only tab and component rendering.
- `apps/web/features/help-documentation/components/HelpContent.tsx` — Owner safety instructions.
- `apps/web/e2e/settings.spec.ts` — mocked, non-destructive reset flow.

Do not modify Prisma schema or add a migration.

## Public contract

```ts
export type DatabaseResetDomain =
  | "productCatalog"
  | "customers"
  | "salesFinance"
  | "supplierProcurement"
  | "inventoryOperations"
  | "importBatchJobs"
  | "storeNotifications";

export const DATABASE_RESET_CONFIRMATION = "RESET DATABASE" as const;
```

Domain registry membership:

- `productCatalog`: `Product`, `Brand`, `ProductStockGroup`, `PrintingService`, `ProductSupplier`, `ProductPriceLog`, `ProductStockGroupActivity`; preserve global `Category`.
- `customers`: `Customer` and current-store customer-owned records.
- `salesFinance`: `Transaction`, `TransactionItem`, `TransactionPayment`, `DebtPaymentLog`, `CashierShift`, `Expense`, `InvoiceDateChangeLog`, `ProductionActivityLog`.
- `supplierProcurement`: `Supplier`, `ShoppingRequest`, `ShoppingRequestItem`, `GoodsPurchase`, `GoodsPurchaseItem`, `InventoryInboundReceipt`, `InventoryInboundReceiptLine`.
- `inventoryOperations`: inventory logs/verifications/corrections/movements, inventory tasks/day sessions/checklists, `SuratJalan`/items, `InternalStockOutRequest`, and production materials.
- `importBatchJobs`: `BatchOperation`/items, `ProductImportJob`/rows/planned rows, `BulkStockImportJob`.
- `storeNotifications`: current-store `Notification` rows and `PushSubscription` rows with matching `storeId`.

Restrictive references must be represented as required dependencies, including product references from transactions, procurement, inbound receipts, surat jalan, inventory, and stock-out records; procurement references from expenses; and transaction references from expenses and operational logs. Cascade children are auto-included and locked; required domains block execution until selected.

---

### Task 1: Build typed registry and dependency planner

**Files:** types, registry, planner, and planner test paths from the file map.

**Produces:**

```ts
export async function createDatabaseResetPlan(input: {
  db: DatabaseResetReadClient;
  storeId: string;
  domains: readonly DatabaseResetDomain[];
}): Promise<DatabaseResetPlan>;

export async function executeDatabaseResetPlan(
  tx: Prisma.TransactionClient,
  plan: DatabaseResetPlan,
): Promise<DatabaseResetSummary>;
```

- [ ] Write failing tests that prove global `Category` never enters operations, product references add `ProductSupplier` as cascade and sales as a blocking dependency, overlapping domains deduplicate operations, and child operations precede parents.
- [ ] Run `pnpm --filter @pos/web exec vitest run features/database-reset/helpers/__tests__/database-reset-plan.test.ts`; expect failure because the module is absent.
- [ ] Implement a typed allowlist. Each operation must receive `{ storeId }`; no client-supplied model/table name is accepted. Return selected domains, counts, `cascades`, `requiredDependencies`, `preserved`, `canExecute`, and deterministic child-first operations.
- [ ] Implement `executeDatabaseResetPlan` to invoke only registry-owned `deleteMany` operations and return deleted counts. Deduplicate models reachable from multiple domains.
- [ ] Rerun the focused Vitest command; expect all planner tests to pass.
- [ ] Commit with `git add apps/web/features/database-reset && git commit -m "feat: add database reset dependency planner"`.

### Task 2: Add preview and execute API routes

**Files:** both route paths and test paths from the file map.

- [ ] Write failing preview tests for Owner success, non-owner `403`, invalid/empty domains `422`, and proof that the planner receives the guard-returned `storeId` rather than a request value.
- [ ] Run `pnpm --filter @pos/web exec vitest run app/api/settings/database-reset/preview/__tests__/route.test.ts`; expect failure.
- [ ] Implement `POST /api/settings/database-reset/preview`: call `requireRole("OWNER")`, parse with Zod, build the plan, return JSON, use `handleAuthError`, and log unexpected errors with `getLogger("api:settings:database-reset")`.
- [ ] Write failing execute tests for exact phrase rejection, required dependency `409`, active shift/import/batch blocking, one `$transaction` call, success summary, and rollback/error `500`.
- [ ] Run `pnpm --filter @pos/web exec vitest run app/api/settings/database-reset/execute/__tests__/route.test.ts`; expect failure.
- [ ] Implement `POST /api/settings/database-reset/execute`: validate `{ domains, confirmation }`, require exact `DATABASE_RESET_CONFIRMATION`, rebuild the plan, check `plan.canExecute`, and query blockers scoped to current store: `CashierShift.status === OPEN`, `ProductImportJob.status` in `PENDING|RUNNING|CANCEL_REQUESTED`, or `BatchOperation.status === PENDING`.
- [ ] Execute `executeDatabaseResetPlan(tx, plan)` inside `db.$transaction(async (tx) => ...)`. Return summary plus timestamp. Map auth to `401/403`, input to `422`, dependency/active process to `409`, and all other failures to `500` without partial success.
- [ ] Run both route test files and expect PASS.
- [ ] Commit with `git add apps/web/app/api/settings/database-reset && git commit -m "feat: add owner database reset API"`.

### Task 3: Add hook and Settings UI

**Files:** `useDatabaseReset.ts`, `DatabaseResetTab.tsx`, its test, and Settings page.

- [ ] Write failing static-render tests for the danger zone, seven domain choices, preserved shared-data copy, cascade/required labels, exact phrase input, disabled execution while dependencies block, and success summary.
- [ ] Run `pnpm --filter @pos/web exec vitest run features/database-reset/__tests__/DatabaseResetTab.test.tsx`; expect failure.
- [ ] Implement these hook signatures:

```ts
export function useDatabaseResetPreview(): UseMutationResult<DatabaseResetPreview, Error, DatabaseResetDomain[]>;
export function useDatabaseResetExecute(): UseMutationResult<DatabaseResetSummary, Error, {
  domains: DatabaseResetDomain[];
  confirmation: string;
}>;
```

POST JSON to the routes, parse `{ message }` errors, and invalidate operational query families after success without invalidating store settings/RBAC.

- [ ] Implement `DatabaseResetView` with Indonesian copy, checkbox selection, `Lihat Dampak Reset`, impact counts, locked cascade rows, blocking dependency warnings, `Ketik RESET DATABASE`, disabled `Reset Data Terpilih`, loading/error/success states, and a deleted-count summary. Keep it prop-driven for static tests.
- [ ] Add the `reset` tab to Settings with a danger icon, `ownerOnly: true`, and content guarded by `role === "OWNER"`; preserve `store` as the default tab.
- [ ] Run the focused UI test and `pnpm --filter @pos/web type-check`; expect PASS.
- [ ] Commit with `git add apps/web/hooks/useDatabaseReset.ts apps/web/components/settings/DatabaseResetTab.tsx apps/web/features/database-reset/__tests__/DatabaseResetTab.test.tsx "apps/web/app/(main)/settings/page.tsx" && git commit -m "feat: add owner database reset settings UI"`.

### Task 4: Update Help documentation

**File:** `apps/web/features/help-documentation/components/HelpContent.tsx` plus the smallest relevant Help test file.

- [ ] Add a failing assertion for Owner help containing `Reset Database`, `RESET DATABASE`, current-store scope, cascade warnings, and the no-auto-seed rule; run the focused Help test and verify failure.
- [ ] Add an Owner-only accordion entry explaining domain selection, impact review, required dependencies, closing active shifts/imports, exact phrase confirmation, rollback safety, and preserved shared data.
- [ ] Run the focused Help test and expect PASS.
- [ ] Commit with `git add apps/web/features/help-documentation && git commit -m "docs: explain database reset safety flow"`.

### Task 5: Add non-destructive E2E coverage

**File:** `apps/web/e2e/settings.spec.ts`.

- [ ] Mock preview and execute routes with Playwright. Assert Owner visibility, cascade and required-dependency preview, disabled execute state, exact request body `{ domains, confirmation: "RESET DATABASE" }`, and success summary.
- [ ] Add a non-owner fixture assertion that the tab is absent. Never call a real reset endpoint.
- [ ] Run `pnpm --filter @pos/web e2e --grep "settings|database reset"`; expect PASS.
- [ ] Commit with `git add apps/web/e2e/settings.spec.ts && git commit -m "test: cover owner database reset settings flow"`.

### Task 6: Final validation and handoff

- [ ] Run `pnpm --filter @pos/web exec vitest run features/database-reset app/api/settings/database-reset`; expect PASS.
- [ ] Run `pnpm type-check`; expect no TypeScript diagnostics.
- [ ] Run `pnpm lint`; expect no new lint errors.
- [ ] Run `pnpm --filter @pos/web e2e --grep settings`; expect PASS with reset APIs mocked.
- [ ] Run `git diff --check`, `git status -sb`, and `git log -8 --oneline`. Confirm no Prisma migration, production build, real database wipe, or `workflow-catalog.ts` change.

## Plan self-review

- Scope 1, current-store-only behavior, preserved users/settings/RBAC/shared data, selective domains, cascade/required dependency semantics, exact confirmation, atomic rollback, active-process blocking, no auto-seed, HelpContent update, and non-destructive E2E coverage each have an explicit task.
- The planner and routes have stable signatures and consistent type names across tasks.
- Every step is concrete; each validation command and expected result is specified.
