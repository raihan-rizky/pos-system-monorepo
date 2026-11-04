# Gaji/Mingguan RP Month Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. User authorized full implementation, commit, and push to main.

**Goal:** Only the selected custom category Gaji/Mingguan contributes to the salary/weekly column in RP Month and its summaries.

**Architecture:** Resolve the report expense group from the existing custom category name. Preserve the selected category and net amount; leave expense persistence and permissions unchanged. Use the workbook's existing group-based column allocation and hidden grouping column for summaries.

**Tech Stack:** TypeScript, Next.js, Prisma, Vitest, xlsx-js-style.

**Spec:** User-approved inline design, 2026-11-05: Gaji/Mingguan goes to Gaji/Mingguan; every other category including built-in Gaji goes to Nilai; category edits appear after re-export; total counts once; monthly summaries agree; no checkbox or database field.

## Global Constraints

- Preserve unrelated changes in the original checkout. Publish from an isolated worktree based on current origin/main.
- Run GitNexus upstream impact before changing functions, then detect_changes before commit.
- Write and observe failing tests before changing production code.
- Use friendly Indonesian guidance; no dependency or schema changes.
- Never run pnpm build or start/stop the user's development server.
- Headroom MCP is unavailable; keep command output bounded.
- D: is unavailable on this host; documentation uses the actual repository's markdown-files directory.

## Review Focus

- Built-in SALARY must become OTHER; description mentioning Gaji/Mingguan must not affect grouping.
- Match the complete category name, ignoring case and spaces around the slash; reject partial names and lookalike categories.
- Historical data and edits use the current selected category on re-export without modifying stored records.
- Custom category labels must not break the workbook's hidden group column or SUMIFS summaries.
- Net amounts, duplicate removal, deleted/out-of-period filtering, purchase separation, and total counts remain correct.

### Task 1: Report classification and Excel regression coverage

**Files:**
- Modify: apps/web/features/financial-report/helpers/monthly-report-core.ts
- Modify: apps/web/features/financial-report/helpers/__tests__/monthly-report-core.test.ts
- Create: apps/web/features/financial-report/helpers/__tests__/salary-weekly-category.test.ts

**Interfaces:** buildMonthlyReport retains its input and output interfaces. Only expense group assignment changes. buildMonthlyWorkbook consumes the resulting report without persistence changes.

- [x] Run financial report baseline tests from clean origin/main.
- [x] Add tests for custom Gaji/Mingguan, formatting variants, built-in Gaji, unrelated/custom lookalikes, description-only matches, category changes, net amount, deduplication and period/deletion filtering.
- [x] Verify tests fail on the old built-in-SALARY classification.
- [x] Replace the category grouping predicate with exact normalized custom-category matching.
- [x] Update the legacy regression expectation for built-in Gaji to OTHER.
- [x] Verify generated RP cells D/E/F, hidden group H, daily cached values and SUMIFS formulas, BERSIH totals, and serialized Excel data.
- [x] Run focused financial report tests and relevant type/lint checks.

### Task 2: Guidance, verification and publication

**Files:**
- Modify: apps/web/features/help-documentation/components/HelpContent.tsx
- Modify: apps/web/features/ai-assistant/workflows/workflow-catalog.ts
- Modify: apps/web/features/financial-report/helpers/monthly-workbook-guide.ts
- Create: markdown-files/gaji-mingguan-rp-month-2026-11-05.md

**Interfaces:** Existing help/workflow/Excel guide content explains the same category rule and re-export flow. Existing access controls remain in effect.

- [x] Update relevant guidance to state that only Gaji/Mingguan uses the salary column; built-in Gaji and others use Nilai.
- [x] Run the full pnpm test suite and record failures by name; run lint/type checks and resolve change-related failures.
- [x] Obtain independent whole-change review, fix material findings, rerun relevant checks.
- [x] Run GitNexus detect_changes and inspect staged diff for intended scope only.
- [ ] Commit with a conventional message, fetch/reconcile new main commits safely, and push HEAD:main without force.
- [ ] Verify remote main contains the exact commit and the worktree is clean before completing the goal.

## Execution ledger

- Base: origin/main at 939ebbed8b592b2697bc52cb3395247873880590; no abandoned worktree met every safe removal condition.
- Task 1: complete. Baseline 44 tests passed. New regression RED: 9 failed, 6 passed. Focused GREEN: 43 passed. Wider financial/help/workflow/changelog regression: 403 passed, 6 skipped.
- Direct web lint and direct workspace type checks passed. Root Turbo lint was stopped after it unexpectedly invoked a web production build through a dependency; the user's original development-server checkout was untouched. Validation switched to direct package scripts.
- Ruling: preserve HelpContent's existing step count/order because the visual contracts use step indexes. Updated existing descriptions; all help regression tests passed.
- Independent read-only review: no material findings.
- GitNexus native reindex failed. Its existing financial-report snapshot was copied into the isolated ignored index to analyze the actual staged diff. detect_changes returned 9 files, 4 mapped symbols, LOW risk; the older builder span was supplemented by explicit diff and current caller review.
- Full suite: `pnpm test --pool=forks` passed (732 files passed, 24 skipped; 5,717 tests passed, 177 skipped). No final-suite failures. The forks pool completed after the initial threads run encountered a worker teardown failure.
- Implementation verification is complete. Commit/push and remote verification are the remaining publication steps.
