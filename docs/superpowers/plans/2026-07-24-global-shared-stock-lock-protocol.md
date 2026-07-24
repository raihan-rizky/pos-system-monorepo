# Global Shared-Stock Lock Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every identified existing shared-stock and membership writer use one deterministic group-first, product-second row-lock protocol with post-lock state reload and stale-relation conflict handling.

**Architecture:** `stock-group-lock.ts` will own sorted, tenant-scoped `FOR UPDATE` locks for existing stock-group and product rows. Writers may use an initial read only to discover candidate IDs; after locking all candidate groups and products they must reload the state used for validation, calculations, and writes, and reject changed membership instead of expanding the lock set out of order.

**Tech Stack:** Next.js route handlers, TypeScript, Prisma interactive transactions, PostgreSQL row locks, Vitest.

## Global Constraints

- Use test-driven development: add each behavior test and observe the expected failure before production changes.
- Global lock order is sorted stock-group IDs, then sorted product IDs.
- No root `pnpm lint`, Turbo command, `pnpm build`, or development-server lifecycle changes.
- Preserve the Task 6 finalizer semantics and its existing focused regression suite.
- Do not claim real cross-connection PostgreSQL concurrency proof because this repository has no live PostgreSQL/Testcontainers harness.

---

### Task 1: Common Lock Contract

**Files:**
- Modify: `apps/web/features/product-stock-groups/stock-group-lock.ts`
- Create: `apps/web/features/product-stock-groups/__tests__/stock-group-lock.test.ts`

**Interfaces:**
- Produces: `lockStockMutationRows(tx, { storeId, stockGroupIds, productIds })`
- Produces: `StockMutationConflictError`, `isStockMutationConflict(error)`
- Returns: sorted candidate IDs and sets of tenant rows actually locked.

- [ ] **Step 1: Write failing helper tests**

Add tests proving duplicate IDs are normalized, every group is locked in ascending order before any ascending product lock, tenant-missing rows are returned as unlocked, and the single-group helper remains compatible.

- [ ] **Step 2: Run helper tests and verify RED**

Run:

```powershell
.\node_modules\.bin\vitest.CMD run features/product-stock-groups/__tests__/stock-group-lock.test.ts
```

Expected: failure because the multi-row helper and conflict types do not exist.

- [ ] **Step 3: Implement the minimum helper**

Use tenant-scoped tagged SQL against `pos_product_stock_groups` and `pos_products`. Loop over sorted unique IDs so the observed database lock order is deterministic.

- [ ] **Step 4: Re-run helper tests and verify GREEN**

Expected: the helper suite passes with group calls preceding product calls.

### Task 2: Central Stock Delta Writer

**Files:**
- Modify: `apps/web/features/product-stock-groups/stock-mutations.ts`
- Modify: `apps/web/features/product-stock-groups/__tests__/stock-groups.test.ts`

**Interfaces:**
- Consumes: `lockStockMutationRows`
- Preserves: `applyProductStockDelta`, `applyProductStockDeltas`, `setProductDisplayStock`

- [ ] **Step 1: Write failing delta tests**

Cover group-first/product-second locking, post-lock reload, sorted batch lock order, and stale membership rejection without stock writes.

- [ ] **Step 2: Run the stock helper suite and verify RED**

Expected: reads occur before locks with no post-lock verification, and the raw batch fast path bypasses grouping.

- [ ] **Step 3: Implement locked delta application**

Treat the initial product query as a candidate hint, lock candidate groups and products, reload products with current membership/multipliers/base stock, compare membership with the hint, then compute and write. Remove the raw unclassified product-stock shortcut.

- [ ] **Step 4: Re-run the suite and verify GREEN**

Expected: central delta tests pass and existing conversion/insufficient-stock behavior remains intact.

### Task 3: Membership and Product Editing Writers

**Files:**
- Modify: `apps/web/app/api/product-stock-groups/[id]/products/route.ts`
- Modify: `apps/web/app/api/product-stock-groups/[id]/__tests__/route.test.ts`
- Modify: `apps/web/app/api/product-stock-groups/route.ts`
- Modify: `apps/web/app/api/product-stock-groups/__tests__/route.test.ts`
- Modify: `apps/web/app/api/products/[id]/route.ts`
- Modify: `apps/web/app/api/products/[id]/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `lockStockMutationRows`, `isStockMutationConflict`

- [ ] **Step 1: Write failing route tests**

Prove source and target groups lock before products, calculations use the post-lock reload, standalone-to-new-group assignment locks the existing products, and a changed source membership returns HTTP 409 with no write.

- [ ] **Step 2: Run the three route suites and verify RED**

Expected: current routes compute from unlocked reads or from `existingProduct` loaded before the transaction.

- [ ] **Step 3: Implement the protocol**

Discover candidate source group IDs, lock all existing candidate groups and products, reload target groups/products, compare each product's source membership with its hint, then resolve stock and mutate. Map stale relationships and Prisma `P2034` to friendly conflict responses.

- [ ] **Step 4: Re-run route suites and verify GREEN**

Expected: all three writer suites pass.

### Task 4: Approval Writers

**Files:**
- Modify: `apps/web/app/api/inventory-management/stock-group-bulk/[batchId]/approve/route.ts`
- Modify: `apps/web/app/api/inventory-management/stock-group-bulk/[batchId]/approve/__tests__/route.test.ts`
- Modify: `apps/web/app/api/inventory-management/daily-stock-matching/[batchId]/approve/route.ts`
- Create: `apps/web/app/api/inventory-management/daily-stock-matching/[batchId]/approve/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `lockStockMutationRows`, `isStockMutationConflict`

- [ ] **Step 1: Write failing approval tests**

Cover sorted multi-group locks, all group locks before product locks, fresh post-lock base stock/multiplier calculations, and stale batch membership conflicts.

- [ ] **Step 2: Run both approval suites and verify RED**

Expected: stock-group bulk reads before locking and daily matching writes from its first product read.

- [ ] **Step 3: Implement locked approval flows**

Use batch data only as candidate hints. Lock sorted candidate groups and products, reload groups/products after locks, validate batch group relationships, then calculate and mutate.

- [ ] **Step 4: Re-run approval suites and verify GREEN**

Expected: both approval suites pass with deterministic ordering.

### Task 5: Repository and Source Audit

**Files:**
- Modify: `apps/web/features/inventory-management/services/__tests__/inbound-receipt-service.test.ts`
- Create: `apps/web/features/product-stock-groups/__tests__/stock-writer-lock-audit.test.ts`
- Potentially modify only source files discovered by the audit that mutate existing `baseStock` or existing product membership without the common protocol.

**Interfaces:**
- Verifies: `InventoryInboundReceiptRepository.lockStockGroup`
- Verifies: the production writer inventory remains explicit and protocol-covered.

- [ ] **Step 1: Write repository and source-audit tests**

Instantiate the concrete repository with a transaction double to prove raw group locking precedes its ORM reload and a tenant lock miss prevents the ORM read. Build an explicit production writer inventory and assert every existing-row base-stock/membership writer contains the common protocol import/call; fail if source scanning discovers an unclassified writer.

- [ ] **Step 2: Run the tests and verify RED**

Expected: repository test may require a complete transaction double; audit fails for the six listed missing writers.

- [ ] **Step 3: Make the minimum protocol coverage changes**

Do not waive existing-row writers. Creation-only paths may be classified separately but must lock an existing target group whenever they attach a new membership to it.

- [ ] **Step 4: Re-run and verify GREEN**

Expected: concrete repository ordering and writer inventory pass.

### Task 6: Regression, Report, and Commit

**Files:**
- Modify: `.superpowers/sdd/task-6-report.md`

- [ ] **Step 1: Run all focused writer and Task 6 suites**

Include common helpers, every touched route, finalizer, service, and prior 99-test regression inputs.

- [ ] **Step 2: Run targeted static validation**

Run ESLint only over touched TypeScript files, direct `apps/web` TypeScript with `..\..\node_modules\.bin\tsc.CMD --noEmit`, and `git diff --check`.

- [ ] **Step 3: Append the Task 6 report**

Record exact RED and GREEN counts, the writer inventory, protocol order, and the no-live-PostgreSQL limitation.

- [ ] **Step 4: Stage and commit only scoped files**

Commit subject:

```text
fix: enforce global shared-stock lock order
```

Preserve unrelated `providers.tsx`, number-input guard files, and controller artifacts.

## Self-Review

- The plan covers every route named in the re-review, the central mutation helper, the concrete inbound repository test, the future-facing writer audit, conflict mapping, prior finalizer regressions, documentation, and scoped validation.
- No placeholders remain; creation-only writer classification must be evidence-based in the audit.
- All writers consume the same `lockStockMutationRows` contract and use `StockMutationConflictError` for stale relations.

## Execution

The parent task already selected implementation in this session, so this plan will be executed inline without creating subagents.
