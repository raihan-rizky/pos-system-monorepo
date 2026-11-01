# Penerimaan Barang: Pembayaran dan Satuan Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement the tasks in this checkout. Preserve existing uncommitted changes.

**Goal:** Capture one purchase payment method at receiving, record its expense when the first receipt is approved, and display pricing for all product units together.

**Architecture:** Persist pending payment information on each receipt and establish it on the purchase during locked receipt finalization. Store a versioned collection of unit-pricing snapshots while accepting legacy single-unit snapshots. Keep stock, pricing, payment and expense writes atomic.

**Tech Stack:** Next.js, React, TypeScript, Prisma, PostgreSQL, Vitest.

**Spec:** `markdown-files/penerimaan-pembayaran-satuan-2026-10-31.md`.

## Global Constraints

- Preserve historical expenses, payment details, legacy receipt snapshots and concurrent purchase/receipt safeguards.
- Use Indonesian for user-facing copy. Update Bantuan, workflow catalog, changelog and feature documentation.
- Inspect GitNexus upstream impact before changing each existing function, class or method.
- Do not run `pnpm build` or start or stop the development server.
- Follow the repository's requested failing-test-first workflow.

## File Map

- `apps/web/features/suppliers/shopping-requests/components/ShoppingRequestFinalApprovalModal.tsx`: remove payment selection from purchase approval.
- `apps/web/features/suppliers/shopping-requests/repositories/finalize-shopping-request-repository.ts`: approve purchase without assigning a payment method.
- `apps/web/features/suppliers/goods-purchases/repositories/goods-purchases-repository.ts`: preserve legacy approval behavior while deferring new-flow expenses.
- `packages/db/prisma/schema.prisma` and a new migration: persist receipt-level payment proposals.
- `apps/web/features/inventory-management/types/inventory-management.ts`, `api/inventory-management-api.ts`, route schemas and `services/inbound-receipt-service.ts`: carry and validate receipt payment and multiple unit prices.
- `apps/web/features/inventory-management/components/InboundReceiptModal.tsx`, `InboundReceiptReviewModal.tsx`, and `InboundPricingFields.tsx`: capture and review payment and all unit prices.
- `apps/web/features/inventory-management/helpers/inbound-pricing.ts`, `repositories/InventoryInboundReceiptRepository.ts`, and `services/inbound-receipt-finalizer.ts`: validate and apply versioned snapshots and atomically establish the expense.
- `apps/web/features/help-documentation/components/HelpContent.tsx`, `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`, `apps/web/features/changelog/data/changelog.ts`: keep procedural help and release notes aligned.

## Task 1: Defer payment and expense to first receipt

**Interfaces:** A new receipt proposes `{ paymentMethod: "TRANSFER" | "GIRO", paymentDueDate: string | null }`. The approved purchase retains the authoritative method; an existing expense is never recreated or redated.

- [x] Add focused failing coverage for approval without payment, pending receipt payment, Giro due-date validation, first-receipt expense creation, repeat approval and purchase locking and conflicting receipt methods.
- [x] Run the focused coverage and confirm that it fails on the missing behavior.
- [x] Add nullable receipt payment fields and migration, carry them through receipt creation and review, and remove payment inputs from shopping-list approval.
- [x] Inside the existing locked receipt transaction, compare a previously established method, set it once when absent, and create one expense for the full purchase total only if no prior expense exists. Keep legacy purchase finalization unchanged where needed.
- [x] Run the focused coverage and TypeScript/lint checks; resolve errors within the changed scope.

## Task 2: Display and persist all unit prices

**Interfaces:** A new snapshot contains a version and an array of per-unit `{ productId, unit, unitMultiplierToBase, costPrice, price, hargaAgen, hargaDinas }` entries. Legacy `version: 1` single-unit snapshots remain readable.

- [x] Add focused failing coverage for all units visible, independent edits, repeated product groups, legacy snapshots, automatic HPP, invalid conversions, and atomic updates on approval.
- [x] Run the focused coverage and confirm that it fails on the missing behavior.
- [x] Render all unit rows in creation and review, sharing editable state for duplicate product groups and identifying invalid units.
- [x] Validate unit ownership, price precision and conversion against current product data; persist a versioned snapshot. Apply approved prices through existing group-pricing synchronization and derive supplier cost from the ordered unit.
- [x] Run focused coverage and TypeScript/lint checks; resolve errors within the changed scope.

## Task 3: Update user guidance and review

- [x] Update Help, AI workflow catalog, release note and feature documentation with the actual receipt flow and full-purchase expense timing.
- [x] Run focused regression coverage for affected purchase, receipt and documentation flows; run lint and type checking without a production build.
- [x] Review changed files and GitNexus scope, including historical receipt handling and concurrent finalization; report any verification limitations.

## Execution note (2026-11-01 WIB)

The implementation and scoped checks are complete. Database migrations were applied and verified in development and production. The GitNexus index remained stale because its parser worker could not start; impact and staged-change reports were reviewed with that limitation.
