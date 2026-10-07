# POS review fixes implementation plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task by task, without delegation.

**Goal:** Fix the four verified transaction regressions without changing the approved feature scope.

**Architecture:** Correct invoice allocation and payment recording at their API entry points. Reuse the shared deterministic stock-lock helper for reversal. Keep all writes within their existing database transactions.

**Tech Stack:** TypeScript, Next.js, Prisma/PostgreSQL, Vitest.

## Constraints

- Do not run production builds or manage the user's development server.
- Preserve unrelated AGENTS.md, next-env.d.ts, and .serena changes.
- Headroom MCP is unavailable; use bounded output and never print database credentials.
- GitNexus impact checked before production edits. Approval endpoints: LOW indexed impact; offline creator: one direct caller and two affected modules; reversal helper: absent from stale index, manually traced to void/delete.
- Use only an isolated fixture schema for PostgreSQL integration tests.

## Tasks

1. Offline invoice allocation: add API tests for historical timestamps, invoice-number gaps and collisions in apps/web/app/api/offline-sync/transactions/__tests__/route.test.ts. Verify RED, allocate by maximum existing invoice suffix and retry invoice uniqueness failures in route.ts, verify GREEN. Keep offline mutation idempotency intact.
2. Draft overpayment: add API regression linking recorded payment rows to netInitialPayments in approve-draft/__tests__/route.test.ts. Verify RED, preserve gross received amount in the header and ledger while change remains separate in route.ts, verify GREEN. Cover explicit split tender.
3. Pending approval split tender: reproduce the modal's explicit unchanged fields in approve/__tests__/route.test.ts. Verify RED, preserve saved rows when submitted amount and method remain equivalent in route.ts, verify GREEN; keep deliberate tender changes supported.
4. Reversal lock order: add tests requiring group-first, sorted product locks before writes in transaction-reversal-service.test.ts. Verify RED, call lockStockMutationRows in restoreStock before updates, verify GREEN. Reject missing lock targets before stock changes.
5. Run relevant report, payment, offline, reversal and stock-group suites, TypeScript and touched-file ESLint. Add a PostgreSQL concurrent reversal test for opposite product order and run the fixture-only integration suite. Document results and limitations here or in a dated results file.

## Progress

- [x] Reproduce all four bugs and identify root causes.
- [x] Run GitNexus impact analysis.
- [x] Verify regression tests fail for each root cause.
- [x] Implement and verify all four fixes.
- [x] Validate concurrent reversals and update results documentation.

Final evidence: 258 unique selected regression tests passed (the single cold-import timeout was resolved by the 14-test draft recheck); both new PostgreSQL concurrent reversal scenarios passed. Web TypeScript, touched-file ESLint and diff whitespace checks passed. See pos-review-fixes-results-2026-10-07.md for the fixture cleanup, stale-index limitations and historical-data scope.

Merge validation: the full web suite passed on 7 October 2026: 408 files / 2,221 tests, with 2 files / 10 opt-in tests skipped. Integration into main uses fast-forward after a scoped commit containing the eleven source/test files and these two documents; the user's unrelated local changes remain outside the commit.
