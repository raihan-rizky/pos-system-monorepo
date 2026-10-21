# Ekspor keuangan bulanan Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for independent tasks, followed by integration and review in the current session.

**Goal:** Deliver seven-sheet monthly Excel exports and an accessible export dialog.

**Architecture:** A store-scoped monthly endpoint produces a normalized report. A pure workbook builder consumes that report. The dialog downloads the monthly workbook while retaining existing journal/PDF exports.

**Tech Stack:** Next.js, React, TypeScript, Prisma, xlsx-js-style, Vitest, Playwright.

**Spec:** `markdown-files/desain-ekspor-keuangan-bulanan-2026-10-21.md`, approved by the user on 2026-10-21.

## Global Constraints

- Friendly Indonesian copy; seven sheets; no payroll/non Teladan sheet.
- Blank editable capital; unavailable historical inventory/supplier debt remain blank and labelled.
- All dates WIB, historical month support, numeric financial amounts, no copied customer data.
- Store-scoped permission `financial-report:read`, no schema migrations/new dependencies.
- Preserve journal/PDF, other workspace changes, and current development server lifecycle.
- TDD with observed failures before runtime implementations; no production builds.
- Documentation lives in the active repo's `markdown-files` because drive D is unavailable.

## Shared interfaces

`helpers/monthly-report-types.ts` contains type declarations only:

```ts
export type IncomeGroup = 'CETAK' | 'PLAT' | 'STEMPEL' | 'SPANDUK' | 'ATK' | 'PRINT' | 'UNMAPPED';
export type ExpenseGroup = 'CETAK_PLAT' | 'SPANDUK' | 'ATK' | 'OTHER' | 'SALARY';
export type MonthlyIncome = { id: string; date: string; reference: string; description: string; amounts: Record<IncomeGroup, number> };
export type MonthlyExpense = { id: string; date: string; description: string; amount: number; group: ExpenseGroup; purchase?: { reference: string; method: string | null; dueDate: string | null; supplier: string } };
export type MonthlyReceivable = { id: string; date: string; dueDate: string | null; reference: string; description: string; customer: string; amount: number };
export type MonthlyFinancialReport = { year: number; month: number; from: string; to: string; income: MonthlyIncome[]; expenses: MonthlyExpense[]; receivables: MonthlyReceivable[]; inventoryBalance: null; supplierDebtBalance: null; warnings: string[] };
```

## Task 1: Period, model, data service and monthly endpoint

**Files:** Create `helpers/monthly-report-types.ts`, `helpers/monthly-report-core.ts`, `services/monthly-report.ts`, `app/api/finance/report/monthly/route.ts` and neighboring tests.

**Consumes:** Existing payment ledger helper `netInitialPayments`, Prisma transaction/expense/manual receivable data and permission guard.

**Produces:** `buildMonthlyPeriod(year:number,month:number,now?:Date)` with `{from,to,start,end}`; `GET /api/finance/report/monthly?year=2026&month=9` returning `MonthlyFinancialReport`.

- [x] Write tests for leap month, current/future periods, allocation rounding, payment event dates, settlement deduplication, historical receivables, expense deduplication, unavailable balances, auth and store scoping.
- [x] Run `pnpm --filter @pos/web exec vitest run features/financial-report/helpers/__tests__/monthly-report-core.test.ts features/financial-report/services/__tests__/monthly-report.test.ts app/api/finance/report/monthly/__tests__/route.test.ts`; observe missing-feature failures.
- [x] Implement explicit category mapping, cents allocation, cash ledger normalization, historical outstanding balance and store-scoped reads. Future/invalid month yields 422; auth uses existing guard; query failure yields 500 without partial data.
- [x] Rerun the same tests and inspect generated report totals.

## Task 2: Seven-sheet workbook

**Files:** Create `helpers/monthly-workbook.ts`, `helpers/__tests__/monthly-workbook.test.ts`, and print serialization support only if required by the existing XLSX library.

**Consumes:** `MonthlyFinancialReport`.

**Produces:** `buildMonthlyWorkbook(report:MonthlyFinancialReport):WorkBook`, `monthlySheetNames(month:number):string[]`, and `serializeMonthlyWorkbook(report:MonthlyFinancialReport):Uint8Array`.

```ts
const wb = buildMonthlyWorkbook(report);
expect(wb.SheetNames).toEqual(['LAP KEU','BERSIH','SEPTEMBER','RC SEPTEMBER','RP SEPTEMBER','PENGELUARAN BELANJA','PIUTANG & HUTANG']);
expect(wb.Sheets['LAP KEU'].D8.v).toBe('');
expect(wb.Sheets['LAP KEU'].G29.f).toContain('E24-E26');
```

- [x] Add failing tests for seven sheets, editable capital, guarded formulas, daily/detail reconciliation, unknown income group visibility, numeric values, formula-like strings and actual XLSX reopen/print XML.
- [x] Run `pnpm --filter @pos/web exec vitest run features/financial-report/helpers/__tests__/monthly-workbook.test.ts` and verify RED.
- [x] Build each sheet with the supplied column groups and summary anchors; use generated cross-sheet references and cached totals. All input guards distinguish blank from zero. No runtime dependency on sample files.
- [x] Serialize and reopen the workbook. Test formulas after changing capital, print area/orientation, repeated header, panes and currency styles.
- [x] Inspect a synthetic-data preview, never private example data.

## Task 3: Accessible dialog and download adapter

**Files:** Modify `components/ReportExportMenu.tsx`; create `helpers/monthly-export-client.ts`, client/component tests and browser harness.

**Consumes:** Monthly endpoint, `serializeMonthlyWorkbook`, `monthlySheetNames`; existing `exportFinancialReportFile(period,format)` for legacy exports.

**Produces:** Working month/year Excel dialog; `exportMonthlyFinancialReport(year:number,month:number):Promise<void>`.

- [x] Add failing tests for month/year selection, seven-sheet summary, preserved PDF/journal, no duplicate submit, failed fetch/retry, Escape and focus restoration.
- [x] Run targeted Vitest and browser harness; verify failures before implementation.
- [x] Use native modal dialog with labelled controls, explicit format/report choices, responsive scroll and loading/error feedback. Monthly Excel is default; preserve daily/weekly/30d/monthly legacy PDF/journal through a secondary report choice.
- [x] Fetch the monthly report, validate response status, dynamically import workbook code, download using a temporary object URL and revoke it.
- [x] Rerun tests and browser checks at desktop/mobile widths; save a screenshot with synthetic data.

## Task 4: Integration, user help, changelog and verification

**Files:** Update `HelpContent.tsx`, `workflow-catalog.ts`, financial help markdown, `changelog.ts`; add dated user documentation and a safe screenshot/labelled illustration.

- [x] Analyze impact before every existing symbol edit; verify no unrelated edits are overwritten.
- [x] Verify adapter/service/builder shared type signatures and render full dialog via browser.
- [x] Update actual usage flow (open export, choose month/year, download and fill capital). Changelog contains actual WIB date, unique id, revision, short title/copy, highlight limits and exactly three usage steps.
- [x] Run all monthly tests and existing financial-report/journal/payment-ledger regression tests, scoped ESLint and web `tsc --noEmit` directly (root turbo type-check can trigger build).
- [x] Review the final diff and code independently, resolve concrete findings, rerun affected tests, record results in usage documentation and call Headroom stats.

## Execution rulings

- Work in the active feature checkout `codex/receipt-automatic-rows`; no branch switch, commits or server restart. This keeps the running development workspace reviewable and preserves unrelated in-progress work.
- Independent implementers own disjoint new service/UI files; workbook and integration are owned by the primary agent. Shared contract above is fixed before dispatch.
- Existing journal/PDF behavior remains reachable; new monthly endpoint avoids changing shared finance calculations or current dashboard interfaces.

## Final verification

- Commit snapshot rebased on the latest `origin/main`: 223/223 tests passed across 18 files, with a clean full web TypeScript check. Only monthly export changes are included.
- Completed on 2026-10-21 (WIB); implementation notes: `markdown-files/ekspor-keuangan-bulanan-2026-10-21.md`.
- Final regression: 222/223 tests passed across 18 files. The sole failure concerns the separately modified Inventory inbound-receipt help text; monthly export and its guidance pass.
- Browser checks passed at 1200/390/320px; scoped ESLint and full web TypeScript passed.
- Seven-sheet synthetic workbook, formula recalculation, independent code review, GitNexus diff analysis and scoped whitespace checks completed. Windows artifact renderer produced all previews and passing assertions but returned a native shutdown error; details are recorded in the implementation notes.
