# Nominal Pembayaran di Riwayat Transaksi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tampilkan nominal Rupiah pada setiap badge metode pembayaran di halaman Riwayat Transaksi untuk transaksi tunggal dan multipayment.

**Architecture:** Tambahkan helper presentasi kecil yang memformat nilai pembayaran dan fallback legacy. Reuse helper itu dari `PaymentBadge` yang dipakai oleh tabel desktop dan kartu mobile, lalu pin perilakunya dengan unit test.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Tailwind CSS.

**Spec:** `docs/superpowers/specs/2026-11-05-riwayat-nominal-pembayaran-design.md`

## Global Constraints

- Teks antarmuka Bahasa Indonesia.
- Format nominal `Rp 15.000`, tanpa desimal.
- Jangan mengubah kontrak API atau menambah dependensi.
- Pertahankan akses keyboard dan layout responsif.

## Review Focus

- Transaksi tunggal tanpa `payments` harus menampilkan `amountPaid`.
- Multipayment harus mempertahankan urutan dan nominal tiap baris pembayaran.
- Nilai nol dan nilai desimal harus diformat stabil.
- Badge tetap dapat membungkus di mobile tanpa memotong teks.

### Task 1: Payment presentation helper

**Files:**
- Create: `apps/web/app/(main)/history/helpers/payment-presentation.ts`
- Test: `apps/web/app/(main)/history/__tests__/payment-presentation.test.ts`

- [ ] Tulis tes formatter dan fallback, jalankan sampai merah, lalu implementasikan helper minimal.
- [ ] Jalankan tes fokus sampai hijau.

### Task 2: Render nominal in history badges

**Files:**
- Modify: `apps/web/app/(main)/history/HistoryClientPage.tsx`
- Test: `apps/web/app/(main)/history/__tests__/tempo-payment-status.test.tsx`

- [ ] Render metode dan nominal pada badge di tabel desktop serta kartu mobile menggunakan helper.
- [ ] Pertahankan indikator Multi-payment dan wrapping responsif.
- [ ] Jalankan tes riwayat, lint, dan type-check.

### Task 3: Product documentation and release notes

**Files:**
- Create: `markdown-files/riwayat-nominal-pembayaran-2026-11-05.md`
- Modify: `apps/web/features/help-documentation/components/HelpContent.tsx`
- Modify: `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`
- Modify: `apps/web/features/changelog/data/changelog.ts`

- [ ] Dokumentasikan cara membaca nominal, perbarui Bantuan dan katalog AI Assistant, lalu tambahkan changelog WIB dengan tiga langkah.
