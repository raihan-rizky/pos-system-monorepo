# Koreksi Pembayaran Pembelian Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for implementation. Track the steps with the checkboxes below.

**Goal:** Izinkan koreksi pembayaran pembelian yang disetujui dari daftar belanja dengan peringatan saat ada penerimaan tertunda, tanpa merusak total, riwayat, saldo, atau penerimaan berikutnya.

**Architecture:** Perluas alur koreksi daftar yang sudah memiliki izin, riwayat, alokasi, dan utang supplier. Bedakan perubahan pembayaran saja dari perubahan barang, simpan jadwal saat ini sebagai sumber utama bagi penerimaan, dan gunakan snapshot riwayat untuk perhitungan keuangan.

**Tech Stack:** Next.js, React, TypeScript, Prisma, PostgreSQL, Vitest.

**Spec:** markdown-files/koreksi-pembayaran-pembelian-desain-2026-11-19.md.

## Global Constraints

- Bahasa tampilan Indonesia; pertahankan izin koreksi existing dan isolasi toko.
- Pertahankan total, basis total, pengeluaran, stok, dan harga pada koreksi pembayaran saja.
- Jangan mengubah pembayaran aktual tanpa pilihan eksplisit; simpan audit dan perbarui saldo serta laporan.
- Jangan jalankan pnpm build atau mengelola proses pnpm dev.
- Jalankan migrasi yang diperlukan pada pos-vps di lingkungan yang sesuai.

## Review Focus

1. Penerimaan tertunda dan koreksi barang bersamaan: peringatan hanya melonggarkan koreksi pembayaran, tidak membiarkan benturan stok.
2. Pembelian diterima sebagian: total Rp8.936.156 dan basisnya tetap sama setelah koreksi dan penerimaan berikutnya.
3. Rincian lama pada penerimaan tertunda: persetujuan memakai jadwal terbaru untuk transfer dan utang Giro.
4. Pembayaran aktual yang sudah terjadi, termasuk nominal nol lama dan pembayaran Giro: tidak dihapus atau dihitung ganda.
5. Perubahan bersamaan dan akses lintas toko: transaksi terkunci, audit akurat, dan peran tanpa izin ditolak.

---

### Task 1: Koreksi pembayaran tanpa memblokir penerimaan

**Files:** Modify shopping-request-correction-editor.ts, shopping-request-correction-plan.ts, shopping-request-correction-repository.ts, shopping-request-correction-finance.ts, refresh-received-purchase-total.ts; test shopping-request-correction-stock.integration.test.ts and finance unit tests.

**Interfaces:** planShoppingRequestCorrection returns a payment-only classification and preserves the existing purchase total and basis for that class; applyCorrectionFinance receives the plan's effective total/basis; existing correction audit identifies whether the correction affects items/receipts.

- [ ] Add a failing regression with an approved partial purchase, pending receipt, existing total 8936156, payment schedule TRANSFER 4947500 and GIRO 3988656 due 2026-12-05. Assert direct correction, unchanged total/basis/expense/stock, correct effective paid amount and payable, and before/after audit.
- [ ] Run the focused test and confirm failure arises from the pending-receipt block or incorrect total.
- [ ] Implement payment-only classification on server from authoritative existing and submitted values. Preserve guards for item, price, receipt and stock edits; retain permission and transaction checks.
- [ ] Prevent a payment-only audit from triggering conversion to RECEIVED on subsequent receipt approval; retain legacy item-correction behavior.
- [ ] Run the focused regression and relevant correction, payable, reporting, and authorization tests. Cover zero-value legacy rows, rollback, and concurrent actual payments.

### Task 2: Penerimaan tertunda dengan jadwal terbaru

**Files:** Modify InventoryInboundReceiptRepository.ts, inbound-receipt-finalizer.ts and InboundReceiptReviewModal.tsx as needed; tests inbound-purchase-payment.test.ts, inbound-receipt-finalizer.test.ts and correction integration tests.

**Interfaces:** settleGoodsPurchasePayment must use the current locked purchase schedule when a previously submitted receipt carries an outdated schedule; existing receipt snapshots remain historical.

- [ ] Add failing tests for a stale pending receipt after a payment-only correction and for first receipt approval after the correction. Assert no outdated schedule overwrites the latest, no rejection, accurate initial transfer and Giro payable, and unchanged ordered basis.
- [ ] Implement current-schedule selection under the purchase lock and show a nonblocking, accessible warning in the review flow. Keep valid input, store, and financial history checks.
- [ ] Run the focused tests including concurrent correction/approval and unchanged no-schedule first-receipt behavior.

### Task 3: Antarmuka koreksi dan dokumentasi

**Files:** Modify ShoppingRequestList.tsx, ShoppingRequestCorrectionModal.tsx, InboundPaymentFields.tsx where needed, help/workflow/changelog content, and add local visual assets only if required by the approved design.

**Interfaces:** Existing correction route and permission remain authoritative; shortcut opens payment section and submits through the existing preview/save workflow.

- [ ] Add failing component tests for an accessible warning that does not disable payment-only correction, a correctly preserved total, editable split payment, payment-source distinction, and the existing unauthorized state.
- [ ] Implement the approved responsive visual direction, scoped CSS variables and self-hosted typography. Keep the saved payment source correction explicit; show actual versus planned values and the effect on payable.
- [ ] Update Bantuan, AI workflow catalog, dated documentation and the WIB changelog entry; keep content accurate to implemented behavior.
- [ ] Run focused component, accessibility, help/workflow and type checks; inspect desktop and mobile layouts without starting or stopping the user's development server.

### Task 4: Release and monitor

- [ ] Run the relevant focused tests plus the repository test, lint and type-check commands. Investigate and report any baseline failures.
- [ ] Review the complete diff, run GitNexus detect_changes before each commit, and commit only intended files.
- [ ] Integrate onto the current PRD branch and dev without losing either branch's existing changes; push each authorized branch.
- [ ] Monitor both deployments through SSH pos-vps until each reaches the expected commit and reports healthy. Diagnose, fix, redeploy and continue monitoring on failure.
- [ ] Verify the actual running versions, migration state if applicable, and non-mutating runtime health checks. Do not modify the example production purchase without a separate explicit instruction.
