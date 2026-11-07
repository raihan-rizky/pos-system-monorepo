# Penerimaan Barang: Edit Produk dan Multi-Giro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memungkinkan perubahan produk/kuantitas pada Penerimaan Barang dan menyimpan beberapa pembayaran giro/transfer pada satu Pembelian Barang dengan total yang tervalidasi.

**Architecture:** Perluas model pembayaran Pembelian Barang dengan child rows yang kompatibel dengan kolom pembayaran lama. Service penerimaan menjadi sumber validasi transaksi untuk pembayaran dan penggantian produk; UI hanya mengedit state dan menampilkan error API. Finalisasi stok tetap memakai snapshot baris yang sudah direview.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL, Zod, Vitest, React Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-07-penerimaan-multi-giro-design.md`

## Global Constraints

- User-visible text harus berbahasa Indonesia.
- Jalankan `pnpm dev` untuk iterasi; jangan menjalankan `pnpm build`.
- Gunakan TDD: tulis test gagal, jalankan, baru implementasi minimal.
- Validasi pembayaran dan item wajib terjadi pada API/service transaction, bukan hanya client.
- Pertahankan kolom legacy `paymentMethod`/`paymentDueDate` dan fallback pembacaan.
- Update Bantuan, katalog workflow AI, changelog, dan dokumentasi markdown untuk fitur besar.

## Review Focus

- Dua giro dengan nominal dan jatuh tempo berbeda tersimpan atomik dan totalnya tepat.
- Total pembayaran kurang/lebih satu sen ditolak dengan pesan yang dapat ditindaklanjuti.
- Giro tanpa tanggal atau transfer dengan tanggal ditolak server.
- Produk pengganti berasal dari store yang sama, tidak duplikat, dan kuantitas tidak melewati sisa setelah penerimaan pending lain.
- Data legacy satu giro tetap tampil dan finalisasi tidak membuat expense ganda.

### Task 1: Dampak simbol dan baseline test

**Files:**
- Read: `apps/web/features/inventory-management/services/inbound-receipt-service.ts`
- Read: `apps/web/features/inventory-management/repositories/InventoryInboundReceiptRepository.ts`
- Read: `apps/web/features/inventory-management/api/inventory-management-api.ts`
- Test: existing inbound receipt service/repository/route suites

**Interfaces:**
- Produces a recorded blast radius for `createInboundReceipt`, `editInboundReceiptItem`, `removeInboundReceiptItem`, `settleGoodsPurchasePayment`, and related API handlers before edits.

- [ ] **Step 1: Run GitNexus impact analysis** for each symbol (upstream) and record direct callers, affected flows, and risk.
- [ ] **Step 2: Run targeted existing tests** for inbound receipt service, repository payment, item route, and modal to establish a green baseline.
- [ ] **Step 3: Run `mcp__headroom__headroom_compress` on large test output** before reasoning over it; retain only bounded summaries.

### Task 2: Model pembayaran multi-baris dan fallback legacy

**Files:**
- Modify: `packages/db/prisma/schema.prisma` near `GoodsPurchase`/`PurchasePaymentMethod`
- Create: `packages/db/prisma/migrations/20261107090000_goods_purchase_payment_schedule/migration.sql`
- Modify: `apps/web/features/inventory-management/types/inventory-management.ts`
- Test: `apps/web/features/inventory-management/helpers/__tests__/inbound-payment.test.ts`

**Interfaces:**
- Add `GoodsPurchasePayment` with `id`, `goodsPurchaseId`, `method`, `amount`, `dueDate`, `note`, `createdById`, `createdAt` and relation `GoodsPurchase.payments`.
- Add `InboundPaymentInput`, `InboundPaymentView`, and `validateInboundPayments(totalAmount, payments)` helpers.
- Validation returns normalized cents-safe totals and rejects invalid method/date/amount combinations.

- [ ] **Step 1: Write failing helper tests** for two giro rows (7/30 days), exact total, mismatch, invalid date, transfer date, and legacy normalization.
- [ ] **Step 2: Run the helper test and verify it fails** because the types/helper do not exist.
- [ ] **Step 3: Implement the Prisma model/migration and payment helper** with positive two-decimal amounts, ISO dates for giro, and no due date for transfer.
- [ ] **Step 4: Run helper tests and Prisma/type generation checks** until green.

### Task 3: Repository/service validation and product replacement

**Files:**
- Modify: `apps/web/features/inventory-management/repositories/InventoryInboundReceiptRepository.ts`
- Modify: `apps/web/features/inventory-management/services/inbound-receipt-service.ts`
- Modify: `apps/web/features/inventory-management/types/inventory-management.ts`
- Test: `apps/web/features/inventory-management/services/__tests__/inbound-receipt-service.test.ts`
- Test: `apps/web/features/inventory-management/repositories/__tests__/inbound-purchase-payment.test.ts`

**Interfaces:**
- Extend `createInboundReceipt` input with `payments?: InboundPaymentInput[]` and resolve legacy payment when omitted.
- Extend `editInboundReceiptItem` input with `productId` and return the refreshed line including product/pricing data.
- Repository methods validate and persist payment rows in the same transaction as the purchase/receipt mutation.

- [ ] **Step 1: Add failing service/repository tests** for multi-giro persistence, total mismatch, legacy fallback, valid product replacement, duplicate product rejection, and remaining-quantity conflict.
- [ ] **Step 2: Run those tests and verify expected failures** before changing production code.
- [ ] **Step 3: Implement transactional payment upsert/fallback and product replacement** while resetting review fields and reloading current product snapshots.
- [ ] **Step 4: Run focused service/repository suites and fix only implementation failures.**

### Task 4: API contracts and RBAC boundary

**Files:**
- Modify: `apps/web/app/api/inventory-management/inbound-receipts/route.ts`
- Modify: `apps/web/app/api/inventory-management/inbound-receipts/[id]/items/[itemId]/route.ts`
- Modify: `apps/web/features/inventory-management/api/inventory-management-api.ts`
- Test: matching route test files under `apps/web/app/api/inventory-management/inbound-receipts/**/__tests__`

**Interfaces:**
- Zod schemas accept `payments` rows and `productId` on item edit.
- API responses expose normalized payment rows and refreshed product metadata.
- Existing permissions remain enforced: create/update uses inventory boundary; item edits use `inventory.inbound_receipt.edit`.

- [ ] **Step 1: Write failing route tests** for accepting valid rows, rejecting malformed multi-giro, rejecting total mismatch, and denying missing permission.
- [ ] **Step 2: Run route tests and verify failures** are caused by the new contract.
- [ ] **Step 3: Implement schemas, API client payloads, and response typing.**
- [ ] **Step 4: Run route suites and type-check the web package.**

### Task 5: Penerimaan Barang UI

**Files:**
- Modify: `apps/web/features/inventory-management/components/InboundReceiptModal.tsx`
- Modify: `apps/web/features/inventory-management/components/InboundReceiptReviewModal.tsx`
- Modify: `apps/web/features/inventory-management/components/InboundReceiptTab.tsx` if payment summary is rendered there
- Test: component tests for create/review/payment editor

**Interfaces:**
- Payment editor supports add/remove rows, method, nominal, due date, and note; displays total and selisih.
- Item editor includes a product selector scoped to purchase-eligible products and quantity input.
- Submit/save buttons remain disabled or show Indonesian validation errors until valid.

- [ ] **Step 1: Add failing component tests** for two giro rows, total summary, product selector, and reset-to-pending behavior.
- [ ] **Step 2: Run component tests to verify red.**
- [ ] **Step 3: Implement controlled UI and API calls with accessible labels and Indonesian copy.**
- [ ] **Step 4: Run focused component tests plus browser tests for receiving flow.**

### Task 6: Documentation, help, AI workflow, changelog

**Files:**
- Modify: `apps/web/features/help-documentation/components/HelpContent.tsx`
- Modify: `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`
- Modify: `apps/web/features/changelog/data/changelog.ts`
- Create/update: `D:/main_project/pos-system-monorepo/markdown-files/2026-11-07-penerimaan-multi-giro.md` when that documentation root exists
- Create/update: `docs/superpowers/specs/2026-11-07-penerimaan-multi-giro-design.md`

- [ ] **Step 1: Add failing documentation/catalog tests** for the new help text, workflow entry, and changelog shape/date.
- [ ] **Step 2: Implement concise Indonesian usage flow** with exactly three changelog steps and no sensitive data.
- [ ] **Step 3: Run documentation/catalog tests.**

### Task 7: Full verification and change-scope audit

**Files:**
- Read: changed files and migration
- Test: full required suites

- [ ] **Step 1: Run `pnpm lint`, targeted Vitest suites, and `pnpm type-check` (never `pnpm build`).**
- [ ] **Step 2: Run browser/e2e receiving tests if available.**
- [ ] **Step 3: Run GitNexus `detect_changes()` and verify only intended symbols/flows changed.**
- [ ] **Step 4: Call `mcp__headroom__headroom_stats` at session end and report validation evidence.**

### Task 8: Preserve latest main financial reports with payment schedules

Context: publication onto latest main revealed automatic verified SupplierPayable and financial-report code added after this feature's initial workspace baseline. Keep these behaviors compatible with the approved multi-payment design. Inventory settlement (handled by coordinator) creates one SupplierPayable per GoodsPurchase for the GIRO subtotal only, due at earliest giro date; actual payments remain aggregate and payment schedules remain immutable after first positive receipt approval.

**Ownership:** modify only `apps/web/features/financial-report/helpers/monthly-report-core.ts`, `apps/web/features/financial-report/helpers/monthly-balances.ts`, `apps/web/features/financial-report/services/monthly-report.ts`, and directly relevant tests under `apps/web/features/financial-report/`. Do not edit inventory, giro APIs/UI, schema, documentation, or unrelated files. Do not stage or commit; coordinator will commit after authorized development and production migrations. No subagents.

**Acceptance:**
- Read GoodsPurchase.payments (method, amount, dueDate, id) with legacy fallback when no children exist. Do not infer a missing legacy method.
- Monthly purchase schedule emits each GIRO child in its own due month at its own amount and aggregates TRANSFER children in the receipt month; sum is counted once. Preserve distinction between planned giro schedule and actual SupplierPayable payment cash movements.
- Query must include expenses needed for child due dates in requested month, including direct and unambiguous shopping-request fallback links. Preserve amount mismatch, ambiguous historical links, future receipts, incomplete history and cancelled formerly approved purchase safeguards.
- Supplier debt totals use GIRO subtotal and actual aggregate repayments. Keep one aggregate debt row with earliest scheduled due date; preserve legacy debt fallback and unknown-history behavior. Individual giro repayment allocation is not inferred. Do not duplicate actual repayment totals.
- Tests first, verify RED then GREEN: two GIRO due dates across different months; mixed TRANSFER+GIRO; transfer-only; legacy one-GIRO; aggregate actual partial payments counted once; future obligation/due-before-receipt; authorized queries/store isolation as applicable. Existing finance suite must remain passing.
- Run relevant GitNexus upstream impact before symbol edits (source root index is stale for recent main files; log unavailable targets and bound caller search). Main functions already analyzed: buildMonthlyReport and getMonthlyFinancialReport LOW, one direct caller each. Run Headroom stats start/end and compress large outputs. No secrets in output. No pnpm build, no dev-server lifecycle changes. Focused pnpm --filter @pos/web test commands only; coordinator runs full suite.
- Write an implementation report in this task's .superpowers workspace containing changed paths, exact test commands/results, RED evidence, any limitations. Return a concise status and report path.
