# Surat Jalan Inline Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Open an editable Surat Jalan receipt directly from Cetak Surat Jalan, save actual shipment edits safely, and print the saved document.

**Architecture:** A shared receipt editor renders both new drafts and saved delivery documents. Existing create permissions and APIs are extended for document names; a store-scoped PATCH endpoint validates saved edits, checks a version, and reconciles proven legacy stock deltas in the transaction lock. Existing receipt launchers share the same document view.

**Tech Stack:** TypeScript, React 19, Next.js 15 App Router, TanStack Query, Prisma, Zod, Vitest, browser interaction harness.

**Spec:** `markdown-files/surat-jalan-edit-langsung-design-2026-11-05.md` (approved 2026-11-05 WIB).

## Global Constraints

- User-visible copy is friendly Indonesian. Preserve existing unrelated workspace changes.
- Inline-edit recipient, display name, quantity, and notes. Product identity, unit, number, date and approval identity stay authoritative.
- Actual shipment quantities obey invoice limits; TRANSACTION-owned stock is never deducted again.
- Store, permission and version checks execute on the server. Legacy stock updates require proof and a journal.
- No production build and no development-server lifecycle changes. No new application dependencies.
- Documentation uses the active repo's markdown-files because drive D is unavailable.
- Execute in the existing non-base feature branch to preserve the uncommitted receipt work this feature follows; do not commit unrelated work.

## Review Focus

1. A second save of a stale editor returns a conflict and preserves current server data.
2. An edit reducing a confirmed legacy quantity returns only the proven stock delta, including stock groups.
3. New or edited quantities cannot consume quantities reserved by other PENDING documents.
4. A delayed save after the document is closed cannot print a different document or save twice.
5. Long names, many rows, keyboard use, and narrow screens preserve all editable and printable content.

### Task 1: Document update rules

**Files:** Create `apps/web/features/surat-jalan/helpers/surat-jalan-document.ts` and `helpers/__tests__/surat-jalan-document.test.ts`.

**Interfaces:**
- Consumes existing `SuratJalanRecord`, `SuratJalanTransactionItem`, and `TransactionStockDeductionSource`.
- Produces `planSuratJalanDocumentUpdate(input): SuratJalanDocumentPlan`, with validated recipient and rows plus per-product quantity deltas; helpers validate proof for legacy stock updates.
- Produces editor-row helpers for draft defaults, existing rows, and per-item maximum including PENDING reservations.

- [x] Write failing tests: changing quantity 4 to 6 reserves 6 with other PENDING quantity 3 against invoice 10; quantity 8 fails; names are trimmed while IDs stay stable; zero removes a row; all zero, negative, non-finite, unknown rows and closed statuses fail; TRANSACTION stock deltas are empty.
- [x] Run `pnpm --filter @pos/web exec vitest run features/surat-jalan/helpers/__tests__/surat-jalan-document.test.ts`; verify RED for the missing behavior.
- [x] Implement pure rules. Legacy confirmed per-product delta is old total minus new total, only after proof matches the previous document quantities and current stock-group identity/multiplier. Text-only changes bypass stock reconciliation.
- [x] Verify GREEN with this file and the existing Surat Jalan helper tests.

### Task 2: Persist document edits and creation names

**Files:** Create `apps/web/app/api/surat-jalan/[id]/document/route.ts` and `document/__tests__/route.test.ts`. Modify `apps/web/app/api/transactions/[id]/surat-jalan/route.ts`, its tests, `features/surat-jalan/types/surat-jalan.ts`, `features/surat-jalan/api/surat-jalan-api.ts`, and RBAC metadata for the existing Surat Jalan resource.

**Interfaces:**
- Consumes Task 1 planner. `PATCH` accepts `{expectedUpdatedAt, recipientName, quantities, documentNames, keterangan}` and returns a canonical `SuratJalanRecord`.
- `updateSuratJalanDocument(id, input): Promise<SuratJalanRecord>` is the client API. Record includes `transactionId` and `updatedAt` for editing.
- Creation accepts optional `documentNames: Record<transactionItemId,string>` and stores the snapshot on `SuratJalanItem.productName`.

- [x] Add RED route tests for permitted update, denied roles, default roles, cross-store not found, stale version 409, invalid quantities, locked parent VOIDED/REFUNDED, TRANSACTION no-stock, legacy delta journal and missing-proof refusal. Add a create test expecting the chosen snapshot name and unchanged product ID.
- [x] Run the new route tests and creation test to observe RED.
- [x] Implement permission guard `surat_jalan/update`, scoped lookup, parent lock, authoritative re-read, version check, planner, atomic item edits and stock journal. Use existing stock-mutation helper; rejected edits roll back completely. Keep approval status and identity unchanged.
- [x] Update creation validation and response metadata; apply chosen display names only to document snapshots. Update existing permission metadata descriptions, preserving default grants.
- [x] Verify GREEN for new routes, create/approval routes, RBAC default behavior and helper tests; run TypeScript.

### Task 3: Shared editable receipt

**Files:** Create `components/SuratJalanReceiptEditor.tsx`, `components/SuratJalanDocument.tsx`, behavior tests and a browser test using the existing harness. Modify `components/surat-jalan-print.css`.

**Interfaces:**
- `SuratJalanReceiptEditor({transactionId, initialRecordId?, onClose})` loads the bundle, owns selection and unsaved edits, and calls creation or Task 2 update.
- `SuratJalanDocument` receives store identity, document metadata, rows and callbacks; renders editable controls with separate printable text.

- [x] Write RED tests: initial render is document; latest active record selected; new draft uses remaining quantities less pending; inline edits submit their real values; unchanged reprint never POSTs; errors retain values and prevent print; repeated clicks produce one request; read-only permission; dirty switch/close preserves data unless discarded.
- [x] Run the tests to observe RED before implementation.
- [x] Implement shared receipt with visible focus, labels, direct name/quantity/note editing, per-row original reference and reset, compact selector and Pengiriman baru. Preserve selection and local edits during background query refreshes.
- [x] Save valid values, flush canonical response into the printable document, then print once. Guard asynchronous sessions and close/switch while saving; invalidate bundle/history/inventory caches after success. Include Retry on load failure.
- [x] Implement print-only text, responsive screen layout, repeating headers and unclipped continuation pages on 215 mm x 165 mm paper. Keep editing references and controls out of print.
- [x] Verify GREEN via behavior tests and browser interaction, including 390px width, Tab/Escape/IME behavior and long-document printing.

### Task 4: Connect existing launchers

**Files:** Modify `components/SuratJalanCreateModal.tsx`, `components/SuratJalanPrintModal.tsx`, relevant modal/print tests and launchers only when required.

**Interfaces:** Existing `SuratJalanCreateModal({open,transactionId,onClose})` remains compatible; existing print button opens the same receipt editor for its record. Other existing lifecycle UI remains usable.

- [x] Add RED integration assertions that Cetak Surat Jalan shows the document without invoice cards/statistics/Buat Surat Jalan; saved print buttons open the selected receipt; old approval and marking paths remain available.
- [x] Run affected tests to verify RED.
- [x] Replace the summary-first content with the shared receipt. Reuse it for saved-print launchers; remove unused preview-only rendering.
- [x] Verify GREEN across Surat Jalan, history action menus and inventory integration tests.

### Task 5: Help, release notes and completion

**Files:** Modify `features/help-documentation/components/HelpContent.tsx`, `features/ai-assistant/workflows/workflow-catalog.ts`, `features/changelog/data/changelog.ts`; create `markdown-files/surat-jalan-edit-langsung-2026-11-05.md` and a safe release visual if supported by the existing changelog type.

- [x] Update the actual usage flow: open receipt, edit directly, save and print; describe permissions and shipment quantities accurately.
- [x] Add dated WIB changelog entry with stable id/revision, concise benefit copy, exactly three usage steps and valid compact highlight fields. Prefer a safe real screenshot; otherwise use the established labelled illustration.
- [x] Run focused tests, configured type/lint checks, the project test command and browser checks, recording existing unrelated failures by name if any.
- [x] Run GitNexus impact checks before each changed symbol and detect_changes for the final scope; if the native index cannot refresh, report the limitation and corroborate references in source.
- [x] Request one fresh review of the task's changed files, resolve material findings with RED-to-GREEN tests, update documentation and ledger, then report the implemented result and verification without committing unrelated work.
