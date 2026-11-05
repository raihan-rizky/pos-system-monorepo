# Daily Finance RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. Steps use checkbox syntax.

**Goal:** Give SALES independently configurable daily receipts, category, subcategory and payment summaries without exposing full financial reports.

**Architecture:** Separate daily aggregates and endpoint from the existing full report. Reuse canonical transaction classification and existing netInitialPayments, and gate page rendering before mounting any full report hooks. Extend the full report category output without changing other financial metrics.

**Tech Stack:** Next.js, TypeScript, Prisma, TanStack Query, Vitest, existing RBAC catalog.

**Spec:** laporan-keuangan-rbac-design-2026-11-05.md

## Global Constraints

- Indonesian visible text; one WIB day up to today; store-scoped actual receipts.
- No production build, database reset, server restart, or changes to unrelated work. User subsequently authorized migration deploy for dev/production and commit/push main.
- Add seed/default permissions and idempotent permission data migration.
- Publish only task changes from isolated codex/daily-finance-rbac-main based on origin/main; retain root changes and exact baseline snapshots.
- User approved design and execution. Implement inline and request a fresh final code review; no extra execution approval gate.

## Review Focus

- Revocation or user/store change must not show privileged cached data.
- Old invoices paid today and refunds must not double-count DP or settlements.
- Legacy printing rows without transactionCategory must not become ATK.
- Zero item weights and rounding must preserve totals, with missing subcategory labelled.
- Individually denied sections must be absent from JSON, not merely hidden.

### Task 1: RBAC defaults, editor and persisted permissions

**Files:** rbac-core.ts, rbac-activity-catalog.ts, rbac-settings-ui.ts in apps/web/features/rbac/helpers; new daily-finance-permissions.test.ts; packages/db/prisma/migrations/20261105010000_daily_finance_permissions/migration.sql.

**Interfaces:** Four stable resource targets listed in the spec, action read. Existing default builders feed the seed and editor.

- [x] Add tests asserting SALES page access, all four reads, denied full-report access, no accidental CASHIER/INVENTORY grants, explicit revocations and visible editor rows.
- [x] Run pnpm --filter @pos/web test features/rbac/helpers/__tests__/daily-finance-permissions.test.ts; expect missing permissions/page defaults.
- [x] Run GitNexus upstream impact before modifying existing symbols. Implement default targets, labels, module membership, and idempotent migration that explicitly enables SALES page and disables SALES full read.
- [x] Rerun targeted RBAC tests; expect pass.

### Task 2: Receipt aggregation and daily endpoint

**Files:** new helpers/income-categories.ts, helpers/daily-income.ts, services/daily-income.ts in apps/web/features/financial-report; app/api/finance/report/daily/route.ts; helper and route tests.

**Interfaces:** buildDailyIncome({date, transactions, manualIncome}) -> {date,total,categories,subcategories,paymentMethods}; category rows {category,amount}; subcategory rows {category,subcategory,amount}; payment rows {method,amount}. Serialization chooses only allowed sections.

- [x] Add failing pure tests for date bounds, current and historical receipts, refunds/change, mixed tenders, old-invoice settlements, manual method unknown, category/subcategory totals, legacy printing and rounding. Add route tests for authentication, store/page denial, independent section grants, no sensitive fields/queries, single-date validation and no-store.
- [x] Run new tests and verify RED.
- [x] Implement pure allocation/category functions and net payment aggregation. Fetch only necessary rows scoped to store and payment timestamps, retaining complete ledgers for refund allocation. Build allowlisted API output from a fresh RBAC snapshot and reject invalid/future/range requests.
- [x] Rerun new tests and relevant existing receipt tests; expect pass.

### Task 3: Restricted page and full-report categories

**Files:** new components/DailyIncomeReport.tsx and tests; new hooks/useDailyIncome.ts; existing financial-report/page.tsx, helpers/report-core.ts and api/finance/report/route.ts.

**Interfaces:** Page wrapper checks full permission before mounting full component; otherwise daily component fetches /api/finance/report/daily?date with authorization-scoped cache. Full FinancialReport adds subcategories preserving category grossProfit fields.

- [x] Add failing behavior tests that SALES never invokes full-report hook, independent blocks render, historical date input works, revoked sections/cached values disappear; add full-report category/subcategory tests.
- [x] Verify RED before production edits.
- [x] Apply upstream impact findings, implement branch selection and accessible daily UI using existing styles, dates and number formatting. Add canonical main/subcategory aggregation to the full report and required query fields.
- [x] Rerun UI, report and API tests; expect pass.

### Task 4: Help, workflow, release notes and final verification

**Files:** HelpContent.tsx, workflow-catalog.ts, AI help/financial-report.md, changelog.ts and this documentation.

- [x] Add documentation/workflow assertions for four permission names and actual daily usage before changing exported data.
- [x] Verify RED; update help, workflow capabilities and changelog (2026-11-05, stable id, revision 1, exactly three steps and accurate illustration).
- [x] Run focused regression tests, pnpm test, type-check and lint. Save large outputs; compress before reviewing. Report unrelated failures by name.
- [x] Fresh reviewer checks only task diffs against exact baseline snapshots. Fix important findings through RED/GREEN. Run GitNexus detect_changes for scope review; user authorized commit and push main after dev/production migration.
- [x] Record completion/results and Headroom end statistics; leave development server untouched.

## Execution notes — 2026-11-05 WIB

- Migration `20261105010000_daily_finance_permissions` deployed successfully to development and production; Prisma migrate status confirms both schemas are up to date. Environment files remain ignored and are excluded from commits.
- Fresh independent read-only review found no Critical or Important issues. Added direct non-owner full-permission implication regression coverage.
- Full-report subcategory profit uses actual item profit; RED reproduced 42 instead of 40, then GREEN (41 report tests). Existing category/default-role expectations and FAQ count/order were updated for the approved behavior.
- TypeScript check passes. Final regression and full-suite results are recorded below after completion.
- Headroom MCP unavailable; output kept bounded with full logs stored locally. GitNexus worktree detect_changes reports low risk; stale index does not resolve all new report symbols, so the isolated Git diff and read-only review supplement it.
- Documentation kept in this repository markdown-files folder with user approval because the configured D: drive is unavailable. No production build or development-server lifecycle changes.

### Verified results

- Related finance/RBAC/API/AI/help/changelog regression: 93 files passed, 12 skipped; 819 tests passed, 74 skipped.
- Web TypeScript (`tsc --noEmit`, also the lint script): exit 0.
- Live persisted SALES permission rows verified in both development and production: page access=true, full report read=false, all four daily reads=true.
- GitNexus detect_changes on the staged isolated worktree: 30 changed files, low risk. git diff --cached --check passed.

- Full web suite (4 workers): 743 files passed, 24 skipped; 5,887 tests passed, 177 skipped, one workflow-evaluation failure. Diagnosis confirmed Q52 canonical/alias collided with Q33 Sales-workday workflow. Q52 title/aliases now identify income per date; all 52 tests across workflow evaluation, catalog, permission, guidance and daily API suites pass after the fix. The full suite was not repeated after this localized catalog fix.
- Pre-commit ESLint found a forbidden `module` variable in the new permission test; renamed to `financeModule` and reran its tests.
