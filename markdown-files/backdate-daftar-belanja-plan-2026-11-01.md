# Backdated Purchase Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution. Steps use checkbox (`- [ ]`) syntax for tracking.

**Execution note:** This is the original implementation plan, retained for context rather than as a live checklist. The completed behavior and final file layout are documented in `backdate-daftar-belanja-2026-11-01.md`; development and production migrations were applied and verified on 2026-11-01 WIB.

**Goal:** Add backdated purchases with partial payments to Daftar Belanja and recognize their expenses exactly once under the approved due-date rules.

**Architecture:** Store historical purchases and their payments as their own records, merge them with ordinary shopping requests in the paginated list, and link each recognized expense to its source. Payments on or before the due date generate dated expenses; a scheduled expense represents the remainder at the due date and is excluded from finance reads until that WIB date.

**Tech Stack:** Next.js App Router, TypeScript, React, Prisma/PostgreSQL, TanStack Query, Vitest.

**Spec:** `markdown-files/backdate-daftar-belanja-design-2026-11-01.md`.

## Global Constraints

- Preserve all existing working-tree changes; several target files already have user modifications. Do not stage those modifications as part of this work.
- Do not run `pnpm build` or start or stop the development server. The user's later request authorizes development and production migrations after release verification.
- All dates are calendar dates in `Asia/Jakarta`; user-facing text is Indonesian.
- Use TDD: write the relevant failing test and observe its failure before the implementation.
- Run GitNexus upstream impact on each existing symbol before editing it; report the available risk and direct callers. A result of `UNKNOWN` must be reported honestly and supplemented with source-level caller inspection.
- Keep new documentation in `markdown-files` in this checkout, as approved by the user. Update Help, the AI workflow catalog, and the changelog.

---

### Task 1: Define historical purchase accounting and persistence

**Files:**
- Create: `apps/web/features/suppliers/backdated-purchases/helpers/backdated-purchase-accounting.ts`
- Create: `apps/web/features/suppliers/backdated-purchases/helpers/__tests__/backdated-purchase-accounting.test.ts`
- Modify: `packages/db/prisma/schema.prisma` (`Store`, `Expense`, and new models)
- Create: `packages/db/prisma/migrations/20261101010000_backdated_purchase_payments/migration.sql`

**Interfaces:** `calculateBackdatedRecognition(input: BackdatedRecognitionInput): BackdatedRecognition`; monetary inputs and outputs use integer cents. `BackdatedRecognition` contains `paidCents`, `remainingCents`, `dueCents`, and one `{ paymentId, expenseCents }` entry per payment.

- [ ] Write a failing test using this example and run `pnpm --filter @pos/web exec vitest run features/suppliers/backdated-purchases/helpers/__tests__/backdated-purchase-accounting.test.ts`:

```ts
const result = calculateBackdatedRecognition({
  amountCents: 1_000_000_000,
  dueDate: "2026-11-10",
  payments: [
    { id: "a", amountCents: 400_000_000, paidAt: "2026-10-30" },
    { id: "b", amountCents: 200_000_000, paidAt: "2026-11-02" },
    { id: "c", amountCents: 200_000_000, paidAt: "2026-12-02" },
  ],
});
expect(result).toMatchObject({ paidCents: 800_000_000, remainingCents: 200_000_000, dueCents: 400_000_000 });
expect(result.paymentExpenses).toEqual([
  { paymentId: "a", expenseCents: 400_000_000 },
  { paymentId: "b", expenseCents: 200_000_000 },
  { paymentId: "c", expenseCents: 0 },
]);
```

- [ ] Implement the helper using `paidCents = sum(all payments)`, `dueCents = amountCents - sum(payments where paidAt <= dueDate)`, and `remainingCents = amountCents - paidCents`. Return each payment's amount as `expenseCents` only when its date is on or before the due date. Reject negative, noninteger, duplicate-ID, or overpaid input; cover the due-date boundary, fully paid cases, and late-entered historical payments.
- [ ] Add `BackdatedPurchase` and `BackdatedPurchasePayment` models with store ownership, date-only purchase/due/payment dates, `Decimal(12, 2)` amounts, actor metadata, reference, payment method, and per-request idempotency keys. Add uniquely linked expense relations for the due expense and each payment expense; add foreign keys, store indexes, and uniqueness constraints in the SQL migration. Keep the ordinary shopping-request schema and rows intact.
- [ ] Run `pnpm db:generate` and rerun the focused test. Inspect the migration and generated type errors; apply the development and production migrations after release verification as requested.

### Task 2: Validate inputs and make payment writes atomic

**Files:**
- Create: `apps/web/features/suppliers/backdated-purchases/helpers/backdated-purchase-input.ts`
- Create: `apps/web/features/suppliers/backdated-purchases/repositories/backdated-purchase-repository.ts`
- Create: `apps/web/features/suppliers/backdated-purchases/services/backdated-purchase-service.ts`
- Create: `apps/web/features/suppliers/backdated-purchases/services/__tests__/backdated-purchase-service.test.ts`
- Create: `apps/web/app/api/suppliers/backdated-purchases/route.ts`
- Create: `apps/web/app/api/suppliers/backdated-purchases/[id]/route.ts`
- Create: `apps/web/app/api/suppliers/backdated-purchases/[id]/payments/route.ts`

**Interfaces:** `createBackdatedPurchase(input, actor)`, `getBackdatedPurchase(id, actor)`, and `addBackdatedPurchasePayment(id, input, actor)`. Inputs carry a stable client-generated `requestId`; amounts are decimal strings, dates are `YYYY-MM-DD`, and the actor includes `id`, `name`, and `storeId`.

- [ ] Write and run failing tests for a previous-month purchase, invalid calendar dates, a purchase in the current month, due date before purchase, future payment, payment before purchase, missing reference, zero/overpaid amounts, store isolation, duplicate `requestId`, and simultaneous payments against the same balance.
- [ ] Parse dates strictly, calculate the start of the current WIB month, and convert decimal strings to integer cents without binary floating-point arithmetic. Use the following validation outcomes:

```ts
purchaseDate < currentJakartaMonthStart;
dueDate >= purchaseDate;
purchaseDate <= payment.paidAt && payment.paidAt <= jakartaToday;
amountCents > 0 && totalPaidCents <= amountCents;
reference.trim().length > 0;
```

- [ ] Within one database transaction, lock the purchase row by both `id` and `storeId`, re-read payments, reject overpayment, and insert or reuse the payment by `requestId`. Create an expense for each pre-due payment and upsert or remove the linked due expense based on the accounting helper. Keep the due expense date at midnight WIB and never generate an expense for a post-due payment. Create the purchase, initial payments, and their expenses atomically by the same rules.
- [ ] Require `supplier.create` and `expense.create` to create, `supplier.read` to view, and `supplier.read` plus `expense.update` to add a payment. Return Indonesian 4xx validation/conflict messages and a 201 response containing the updated purchase and balance. Rerun the focused service and route tests.

### Task 3: Include only recognized expenses in every finance read

**Files:**
- Create: `apps/web/features/keuangan/helpers/recognized-expense-filter.ts`
- Create: `apps/web/features/keuangan/helpers/__tests__/recognized-expense-filter.test.ts`
- Modify: `apps/web/app/api/finance/expenses/route.ts`
- Modify: `apps/web/app/api/finance/expenses/summary/route.ts`
- Modify: `apps/web/app/api/finance/report/route.ts`
- Modify: `apps/web/app/api/finance/report/journal/route.ts`
- Modify: `apps/web/features/financial-report/services/monthly-report.ts`
- Modify: `apps/web/features/ai-assistant/repositories/assistant-tools-repository.ts`
- Modify: `apps/web/features/keuangan/helpers/automatic-expense.ts` and `apps/web/app/api/finance/expenses/[id]/route.ts`

**Interfaces:** `recognizedExpenseFilter(now: Date): Prisma.ExpenseWhereInput` returns a condition that excludes future linked due expenses and leaves ordinary expenses and already-recorded payment expenses unchanged.

- [ ] Write and run failing tests with `now = 2026-11-09T16:59:59Z` and `now = 2026-11-09T17:00:00Z` for a due date of 10 November WIB. Assert exclusion before midnight, inclusion at midnight, and unchanged behavior for ordinary expenses.
- [ ] Implement the filter with an explicit `AND` at each finance query so existing `OR` conditions remain intact:

```ts
const condition = {
  OR: [
    { backdatedPurchaseDueId: null },
    { occurredAt: { lt: nextJakartaMidnight(now) } },
  ],
};
```

- [ ] Apply the condition to expense list/count, summary, finance aggregates, journal, monthly report/export input, and AI expense aggregates/counts. Add a clear automatic-expense classification for both historical-payment and due-expense links, and reject direct update/delete of either source-linked expense. Test that a late-entered pre-due payment adjusts the due expense without duplication in every relevant period.
- [ ] Rerun focused finance, assistant, and monthly-report tests. Inspect other `db.expense` readers and raw SQL for additional reporting paths before closing the task.

### Task 4: Merge historical purchases into Daftar Belanja

**Files:**
- Create: `apps/web/features/suppliers/backdated-purchases/repositories/backdated-purchase-list.ts`
- Create: `apps/web/features/suppliers/backdated-purchases/repositories/__tests__/backdated-purchase-list.test.ts`
- Modify: `apps/web/features/suppliers/shopping-requests/services/shopping-requests-service.ts`
- Modify: `apps/web/features/suppliers/shopping-requests/repositories/shopping-requests-repository.ts`
- Modify: `apps/web/features/suppliers/shopping-requests/types/shopping-request.ts`
- Modify: `apps/web/features/suppliers/shopping-requests/api/shopping-requests-api.ts`
- Modify: `apps/web/app/api/suppliers/shopping-requests/route.ts`

**Interfaces:** Add a discriminated list item `kind: "SHOPPING_REQUEST" | "BACKDATED_PURCHASE"`; the latter contains `purchaseDate`, `dueDate`, `paymentMethod`, `reference`, `amount`, `paid`, `remaining`, and `paymentStatus: "UNPAID" | "PARTIAL" | "PAID"`. Extend list filters with `recordType` and `paymentStatus`.

- [ ] Write and run failing tests with alternating ordinary and historical records over at least two pages. Assert a stable `(createdAt DESC, kind, id)` order, total count, no missing or duplicated rows, store isolation, reference search, method/due-date filters, and unpaid/paid filters.
- [ ] Select filtered IDs from both tables with a parameterized SQL `UNION ALL`, apply a single order/offset/limit, then hydrate each type and restore that order. Apply ordinary status and receiving filters only where meaningful; a payment-status filter returns historical records only. Avoid merging two independently paginated result sets.
- [ ] Preserve the existing response envelope and existing shopping-request actions. Update API types and hooks to carry the discriminant and filters. Rerun the list, API, and existing shopping-request tests.

### Task 5: Create the form, payment history, and list controls

**Files:**
- Create: `apps/web/features/suppliers/backdated-purchases/components/BackdatedPurchaseCreateModal.tsx`
- Create: `apps/web/features/suppliers/backdated-purchases/components/BackdatedPurchasePaymentsModal.tsx`
- Create: `apps/web/features/suppliers/backdated-purchases/hooks/useBackdatedPurchases.ts`
- Create: `apps/web/features/suppliers/backdated-purchases/components/__tests__/backdated-purchase-ui.test.tsx`
- Modify: `apps/web/features/suppliers/shopping-requests/components/ShoppingRequestList.tsx`

**Interfaces:** The create form sends `{ purchaseDate, paymentMethod, dueDate, reference, amount, payments, requestId }`; the payment modal sends `{ amount, paidAt, requestId }`. Each request retains its key across a retry.

- [ ] Write and run failing component tests for the Giro default, conditional reference label, previous-month restriction, adding multiple initial payments, validation messages, preserving failed input, displaying totals/status, adding a payment, and hiding normal approval/receipt actions on historical cards.
- [ ] Add an action named `Catat Belanja Terdahulu`, fields and repeatable initial-payment rows, and an accessible payment history/modal. Show `Belum dibayar`, `Dibayar sebagian`, or `Lunas`, with nominal, total paid, remaining, due date, and reference. Invalidate both list and finance queries after a successful mutation. Follow existing modal, button, keyboard, loading, and error patterns.
- [ ] Add record-type and payment-status filters. For an empty mixed list show the existing empty state; for a filtered empty result describe that no records match. Rerun focused component and list tests.

### Task 6: Documentation and final review

**Files:**
- Modify: `apps/web/features/help-documentation/components/HelpContent.tsx`
- Modify: `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`
- Modify: `apps/web/features/changelog/data/changelog.ts`
- Create: `markdown-files/backdate-daftar-belanja-2026-11-01.md`

- [ ] Write failing documentation/workflow assertions where existing tests require them; then describe the actual creation, partial-payment, due-date, and post-due behavior. Add a concise changelog entry with the actual WIB release date, stable ID/revision, accurate illustration, and exactly three usage steps.
- [ ] Run the requested focused tests, `pnpm lint`, and `pnpm type-check` when feasible. Do not run `pnpm build` or control the development server. Check the complete diff against the pre-existing working tree and report any pre-existing failures.
- [ ] If a commit is requested, stage only this task's changes, run `node .gitnexus/run.cjs detect-changes --scope staged --repo pos-system-monorepo`, and inspect staged files before committing. Do not stage unrelated user changes.

## Review of coverage

Tasks 1-2 cover dates, amount validation, partial-payment history, atomicity, idempotency, and store permissions. Task 3 covers due-date visibility and every expense consumer. Tasks 4-5 cover the combined list, filters, form, and payment flow. Task 6 covers Help, assistant knowledge, release notes, and repository constraints.
