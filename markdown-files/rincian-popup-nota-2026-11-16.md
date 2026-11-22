# Rincian Penerimaan: Popup Nota

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to execute this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** Klik pada baris Nota atau Piutang Nota di rincian pemasukan harian membuka popup nota yang sesuai.

**Architecture:** Gunakan kembali `ReceiptHistoryReceiptDialog` yang sudah dipakai halaman Riwayat. `DailyIncomeReceiptDialog` menyimpan ID transaksi nota terpilih dan memberi `Modal` target portal di dalam native dialog agar popup tetap di lapisan teratas; Escape menutup popup dulu. Tidak ada endpoint atau skema data baru.

**Tech Stack:** Next.js, React, TypeScript, Vitest, Playwright.

**Spec:** Bagian Design pada dokumen ini.

## Global Constraints

- Pertahankan label dan instruksi pengguna dalam Bahasa Indonesia yang ramah.
- Baris pemasukan manual dan Piutang Manual tidak membuka popup nota.
- Pratinjau Sales tetap mengikuti pembatasan klik nota yang berlaku di Riwayat.
- Pertahankan tombol Rincian alokasi di setiap baris secara terpisah dan dapat diakses lewat keyboard.
- Perubahan target portal harus opsional agar popup nota lain dan modal aplikasi tetap memakai perilaku sebelumnya.
- Jangan menjalankan `pnpm build`, `pnpm dev`, atau menghentikan server pengembangan.

## Review Focus

- Nota biasa dan Piutang Nota membuka transaksi dengan ID yang tepat.
- Tombol tutup popup mengembalikan fokus ke baris nota yang membukanya.
- Dialog status nota saat pemuatan atau galat tetap berada di atas rincian harian.
- Pemasukan manual tidak mendapat aksi popup nota.
- Pratinjau Sales tidak membuka detail transaksi yang memang dibatasi di Riwayat.
- Popup portal berada di dalam native dialog, bisa diklik, dan Escape tidak menutup rincian harian.

---

## Design

### Intent dan batasan

Rincian penerimaan harian sudah menampilkan nota, pembayaran Piutang Nota, pemasukan manual, dan pembayaran Piutang Manual. Saat ini label Nota mengarah ke halaman Riwayat, sehingga pengguna harus berpindah halaman untuk melihat nota. Keberhasilan berarti satu klik pada baris nota menampilkan popup nota di atas rincian yang sedang dibuka, sedangkan baris manual tetap menampilkan rincian alokasinya.

Tidak ada perubahan pada perhitungan pemasukan, izin API, penyimpanan, atau struktur data.

### Pendekatan

1. Mempertahankan navigasi ke Riwayat. Ini memakai perilaku sekarang, tetapi tidak menampilkan popup langsung di rincian harian.
2. Memakai kembali `ReceiptHistoryReceiptDialog` di `DailyIncomeReceiptDialog`. Ini pilihan implementasi karena memenuhi alur satu klik dan menggunakan pemuatan nota yang sudah ada.

### Keputusan

Baris nota dirender sebagai tombol yang mencakup identitas dan nominal transaksi. Klik atau aktivasi keyboard membuka popup dengan `transactionId` dari baris tersebut. Tombol Rincian alokasi tetap menjadi kontrol terpisah. Saat popup ditutup, fokus kembali ke tombol nota. `Modal` menerima `portalRoot` opsional dan merender popup nota di dalam native dialog; tombol Escape menutup nota tanpa menutup rincian harian. Dalam pratinjau Sales, baris nota tetap nonaktif sebagaimana perilaku yang sudah digunakan di halaman Riwayat.

## Implementation Plan

### Task 1: Buka popup nota dari rincian pemasukan

**Files:**

- Create: `apps/web/features/financial-report/__tests__/daily-income-note-popup-browser.test.mjs`
- Modify: `apps/web/features/financial-report/components/DailyIncomeReceiptDialog.tsx`
- Modify: `apps/web/features/transaction-history/components/ReceiptHistoryReceiptDialog.tsx`
- Modify: `apps/web/components/ReceiptModal.tsx`
- Modify: `packages/ui/src/Modal.tsx`
- Update: `markdown-files/rincian-popup-nota-2026-11-16.md`

**Interfaces:**

- Consume: `ReceiptHistoryReceiptDialog({ transactionId, onClose, portalRoot })` dari `features/transaction-history/components/ReceiptHistoryReceiptDialog.tsx`; `Modal({ portalRoot })` secara default tetap merender ke `document.body`.
- Produce: aktivasi tombol Nota dan Piutang Nota di `DailyIncomeReceiptDialog` membuka dialog dengan `transactionId` baris.

- [x] **Step 1: Write the failing browser test.** Fixture memuat Nota `INV-001`, Piutang Nota `INV-PIUTANG-001`, dan pemasukan manual. Tes gagal pertama kali karena tombol popup nota belum tersedia.
- [x] **Step 2: Verify RED.** `node apps/web/features/financial-report/__tests__/daily-income-note-popup-browser.test.mjs` gagal sesuai harapan; setelah implementasi awal, tes juga membuktikan portal yang berakhir di `document.body` berada di belakang native dialog.
- [x] **Step 3: Implement the behavior.** Simpan `transactionId` terpilih dan tombol pemicu, render dialog nota yang sudah ada secara dinamis, arahkan portal popup ke dalam native dialog, pertahankan tombol Rincian alokasi terpisah serta pembatasan `previewSales`, dan pulihkan fokus setelah popup ditutup.
- [x] **Step 4: Verify GREEN.** Tes browser lulus dengan `ReceiptHistoryReceiptDialog` dan `Modal` yang sebenarnya serta data contoh. Tes mencakup klik baris nota/Piutang Nota, posisi portal, status loading, Escape, tombol tutup, fokus pemicu, baris manual, dan pratinjau Sales. `RECEIPT_POPUP_SCREENSHOT_PATH` menyimpan screenshot fixture.
- [x] **Step 5: Verify code.** `pnpm --dir apps/web type-check` lulus. Tes Vitest terarah lulus (2 berkas/26 tes). Suite lengkap paket web lulus sebelum tambahan target portal; CI akan menjalankan ulang suite lengkap pada perubahan akhir. Jangan jalankan production build.
- [ ] **Step 6: Finish review and release.** Periksa diff, dampak perubahan, Bantuan, workflow AI, changelog, dan screenshot fixture; commit lalu push ke `dev` sesuai permintaan, kemudian pantau CI/deployment `pos-vps` dengan GitHub MCP.
