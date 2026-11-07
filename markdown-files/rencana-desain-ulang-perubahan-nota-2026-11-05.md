# Receipt Changes Audit Desk Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and one final independent review. Track steps with checkboxes.

**Goal:** Apply approved design A to the existing receipt-change screen so Owners can review revisions quickly without losing snapshot detail.
**Architecture:** Extract pure snapshot formatting and comparison from the current component; render a revision navigator, grouped differences, and structured receipt versions from the existing API. Preserve existing server behavior and notification deep links.
**Tech Stack:** React 19, Next.js 15, TypeScript, Tailwind CSS 3, lucide-react, Vitest; no new dependency.
**Spec:** `markdown-files/desain-ulang-perubahan-nota-2026-11-05.md` (approved).

## Global Constraints

- Friendly Indonesian copy, existing application typography and brand tokens.
- Preserve Owner/store guards and all saved versions; no API/database changes.
- Notification deep links select the exact revision; invalid IDs show explanation and latest revision.
- Desktop timeline; compact labelled mobile version picker; no page overflow on phones.
- Original means transaction detail before the first Sales edit, not historical printing/branding.
- Keyboard access, visible focus, readable comparison labels, reduced motion; loading, empty, retryable error states.
- TDD before product code; no production build or application server lifecycle changes.
- Update Help, AI workflow catalog, changelog dated 2026-11-05 WIB, and documentation.
- D: is unavailable: documentation stays in the active worktree's `markdown-files` and the limitation is recorded.

## Review Focus

- Repeated/unidentified products and reordered lines: no missing information or false pairing.
- Same visible name with changed IDs, tiny numerical changes, or same-second timestamps: differences remain observable.
- Printing receipts added/removed, stock links, split/debt payments: every existing detail remains inspectable.
- Deep-linked old/missing revisions and many revisions: selection, original, and latest remain accurate.
- Long text and empty/error states at 390 px: controls remain usable and no horizontal page overflow.

## Files and responsibilities

- Create `apps/web/features/receipt-changes/lib/receipt-comparison.ts`: pure typed fields, formatting, grouping and comparison.
- Create `apps/web/features/receipt-changes/components/ReceiptSnapshot.tsx`: structured saved receipt and grouped detail rows.
- Modify `apps/web/features/receipt-changes/components/ReceiptChangeComparison.tsx`: audit desk, selection, active views, revision context.
- Modify `apps/web/features/receipt-changes/components/ReceiptChangesPage.tsx`: page frame and fetch states/retry.
- Create `apps/web/features/receipt-changes/__tests__/receipt-comparison-model.test.ts` and shared fixture; modify comparison tests.
- Modify `apps/web/features/help-documentation/components/app-shell-preview/pages/HistoryPreview.tsx`, `HelpContent.tsx`, relevant help tests, `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`, and `apps/web/features/changelog/data/changelog.ts`.
- Keep temporary browser preview assets and execution logs under ignored `.superpowers/`.

### Task 1: Reliable structured comparison

**Produces:** `getReceiptSections(snapshot): ReceiptSection[]`, `compareReceiptSnapshots(before, after): ReceiptDifferenceGroup[]`, `formatReceiptCurrency(number): string`, `formatReceiptDate(string): string`, `getReceiptRevisionSummary(groups): string`. Fields have stable keys, labels, display strings, raw values, and optional technical flag; difference rows retain both strings.

- [x] Write fixture and failing model tests for scalar/identity changes, precision, payment arrays, reordered/duplicate/ID-less items, printing lines/metadata, and additions/removals.
- [x] Run model tests and confirm expected missing implementation failure.
- [x] Implement pure model. Match identical items first, then only unambiguous identities; show unmatched/ambiguous rows as added/removed. Compare raw normalized values; never infer equality from formatting.
- [x] Run model tests: 9 passed.

### Task 2: Audit desk interface and states

**Consumes:** Task 1 interfaces, existing `ReceiptChangeRecord[]` and `initialChangeId`.
**Produces:** Existing exported `ReceiptChangeComparison({changes, initialChangeId})` and `ReceiptChangesPage({transactionId, initialChangeId})`; exported `ReceiptSnapshot({snapshot, title})` for version rendering.

- [x] Extend comparison tests first for audit-desk headings, current revision button, exact deep link/fallback, friendly statuses, and structured original detail with technical IDs behind disclosure.
- [x] Run UI tests and confirm new assertions failed against the old UI.
- [x] Implement responsive audit desk, selected-revision context, neutral monetary delta, grouped before/after comparison, and the Yang berubah / Nota asli / Versi lengkap views. Keep original snapshot from `changes[0].before` regardless of selected revision.
- [x] Implement page loading skeleton, empty state, error with retry, and existing abort/stale-request protection. Use native controls and preserve focus during view/revision changes.
- [x] Run receipt tests: 37 passed; web TypeScript check passed.
- [x] Bundle actual components with demo snapshots into the existing companion server (test-only assets); exercise revision/view changes, retry states, keyboard, desktop and phone in browser. Do not use preview data in production code.

### Task 3: Guidance, release notes and verification

**Consumes:** Task 2 final navigation labels and behavior.

- [x] Update help preview regression expectations to Jejak perubahan / Yang berubah / Nota asli / Versi lengkap and confirm failing before editing preview.
- [x] Update the help preview, Owner guide and Q50/workflow steps to match actual navigation. Add a unique improvement changelog entry dated 2026-11-05, revision 1, exactly three steps, compact highlight. Retain all existing entries/dates.
- [x] Prefer a cropped screenshot of actual components with clearly marked demo data; otherwise keep an accurate labelled illustration.
- [x] Run receipt-change, help, workflow and changelog regressions: 144 passed; web type-check, changed-file ESLint, and `git diff --check` passed.
- [x] Run the web suite once, saving bounded logs. It was interrupted after no progress beyond startup; the bounded regression gate remains green. Report this timeout accurately.
- [x] Run GitNexus impact attempts and manual changed-symbol review. Fresh review found two UX issues; both were fixed with red/green tests. Detect-changes is deferred until just before commit.
- [x] Update design/implementation documentation and execution ledger with actual results and tool limitations. No migration is needed for this UI redesign.

## Self-review and execution decision

All approved design sections map to the three tasks. The user explicitly approved applying design A; continue inline under that authorization without another permission gate. This plan changes presentation and comparisons within one feature, so an inline implementation with one final fresh review is appropriate.
