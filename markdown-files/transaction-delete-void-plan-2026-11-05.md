# Hapus dan Void Transaksi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menyediakan Hapus/Void untuk semua jenis transaksi, menangani seluruh surat jalan terkait, dan menjadikan pemeriksaan stok nota penawaran sebagai peringatan saat penghapusan.

**Architecture:** Pertahankan `reverseTransaction` sebagai layanan siklus transaksi. Perluas penanganan surat jalan dan peringatan terstruktur tanpa mengubah kontrak hasil yang sudah dipakai; API meneruskan peringatan ke modal dan notifikasi Riwayat.

**Tech Stack:** Next.js 15, React 19, TypeScript, Prisma, TanStack Query, Vitest.

## Global Constraints

- Teks antarmuka dalam bahasa Indonesia; ikuti gaya UI yang ada.
- Jangan menjalankan production build atau mengubah siklus hidup server development.
- Pertahankan perubahan lokal yang sudah ada.
- Jalankan impact upstream sebelum mengubah simbol; laporkan risiko HIGH/CRITICAL.
- Tulis tes gagal sebelum perubahan implementasi, kemudian jalankan tes terkait dan pemeriksaan TypeScript.
- Jangan menambah stok berdasarkan perkiraan ketika bukti mutasi tidak dapat dipastikan.
- Dokumentasi berada di `C:\Projects\pos-system-monorepo\markdown-files`.

## Task 1: Siklus transaksi dan surat jalan

**Files:**
- Modify: `apps/web/features/transactions-stock/services/transaction-reversal-service.ts`
- Test: `apps/web/features/transactions-stock/services/__tests__/transaction-reversal-service.test.ts`
- Create if shared by UI/server: `apps/web/features/transactions-stock/helpers/transaction-lifecycle-policy.ts`

**Interfaces:**
- Consumes: `ReverseTransactionInput`, jurnal stok, status transaksi, dan surat jalan.
- Produces: hasil `APPLIED | ALREADY_VOIDED | NOT_FOUND`, serta callback opsional untuk peringatan `{ code, message }`; snapshot audit menyimpan peringatan.

- [ ] Tulis tes Void dengan surat jalan PENDING dan CONFIRMED; Hapus dengan beberapa surat jalan; Hapus nota penawaran VOIDED tanpa invoice/jurnal; Void berulang dan Hapus setelah Void.
  ```ts
  await expect(reverseTransaction(tx, { ...input, action: "DELETE" })).resolves.toBe("APPLIED");
  expect(tx.transactionLifecycleAudit.create).toHaveBeenCalled();
  ```
- [ ] Jalankan `pnpm --filter @pos/web test features/transactions-stock/services/__tests__/transaction-reversal-service.test.ts` dan verifikasi kegagalan pada pembatasan surat jalan/pembuktian stok.
- [ ] Hapus penolakan berdasarkan keberadaan surat jalan; batalkan surat jalan aktif saat Void; hapus item dan surat jalan sebelum item transaksi saat Hapus.
  ```ts
  await tx.suratJalan.updateMany({ where: { transactionId, status: { in: ["PENDING", "CONFIRMED"] } }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  ```
- [ ] Tangani kegagalan pembuktian stok khusus penghapusan nota penawaran yang belum menjadi invoice dengan peringatan dan tanpa pengembalian stok perkiraan. Simpan jurnal, referensi sumber, dan snapshot audit.
- [ ] Jalankan tes layanan dan helper stok yang sudah ada; pastikan tes baru lulus serta kontrak lama tetap bekerja.

## Task 2: API dan hasil penghapusan

**Files:**
- Modify: `apps/web/app/api/transactions/[id]/route.ts`
- Modify: `apps/web/hooks/useTransactions.ts`
- Test: `apps/web/app/api/transactions/[id]/__tests__/route.test.ts`
- Test: `apps/web/hooks/__tests__/useTransactions.test.ts` atau berkas tes mutasi transaksi terdekat.

**Interfaces:**
- Consumes: hasil layanan dan callback peringatan dari Task 1.
- Produces: DELETE tetap 204 tanpa peringatan; DELETE 200 dengan `{ warnings }` jika ada peringatan; hook mengembalikan hasil yang dapat ditampilkan setelah modal ditutup.

- [ ] Tulis tes bahwa DELETE percetakan diizinkan dan peringatan nota penawaran dikirim ke klien; pertahankan tes izin dan 404.
  ```ts
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ warnings: [{ code: "STOCK_HISTORY_REVIEW_REQUIRED" }] });
  ```
- [ ] Jalankan tes API untuk memverifikasi hasil gagal.
- [ ] Hapus penolakan berdasarkan subkategori percetakan. Izinkan Void status DRAFT melalui aturan otorisasi yang sesuai dan tetap gunakan layanan terpusat.
- [ ] Teruskan peringatan dari layanan; parse hasil 200/204 di hook tanpa mewajibkan body untuk 204.
- [ ] Jalankan tes API, pembatalan draft, dan tes hook terkait.

## Task 3: Menu, modal, dan notifikasi Riwayat

**Files:**
- Modify: `apps/web/app/(main)/history/TransactionActionMenu.tsx`
- Modify: `apps/web/app/(main)/history/HistoryClientPage.tsx`
- Test: `apps/web/app/(main)/history/__tests__/TransactionActionMenu.test.tsx`
- Add: tes kontrak tampilan desktop/ponsel dan konfirmasi di folder tes Riwayat.

**Interfaces:**
- Consumes: izin akun, status transaksi, ringkasan surat jalan, hasil penghapusan `{ warnings }`.
- Produces: menu Hapus/Void yang konsisten dan peringatan yang terlihat setelah penghapusan berhasil.

- [ ] Ubah tes transaksi dengan surat jalan agar mengharapkan Hapus/Void; tambah tes semua kategori dan status akhir.
  ```ts
  expect(html).toMatch(/>\s*Hapus\s*</);
  expect(html).toMatch(/>\s*Void\s*</);
  ```
- [ ] Jalankan tes menu dan verifikasi gagal.
- [ ] Hapus filter `isBundled` untuk kedua aksi dan filter percetakan untuk Hapus pada kedua susunan Riwayat. Gunakan aturan Void yang konsisten untuk status nonterminal dan izin akun.
- [ ] Perbaiki nomor nota penawaran di modal, penjelasan stok, dan penjelasan tindakan pada surat jalan terkait. Tampilkan peringatan sukses menggunakan pola notifikasi Riwayat yang sudah ada.
- [ ] Jalankan tes menu/konfirmasi dan periksa interaksi keyboard serta viewport ponsel menggunakan server yang dikelola pengguna jika tersedia.

## Task 4: Bantuan, workflow, rilis, dan verifikasi akhir

**Files:**
- Modify: `apps/web/features/help-documentation/components/HelpContent.tsx`
- Modify: `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`
- Modify: `apps/web/features/changelog/data/changelog.ts`
- Update: spesifikasi dan rencana ini dengan hasil pelaksanaan.

- [ ] Jalankan impact sebelum mengubah simbol dokumentasi aplikasi.
- [ ] Tambahkan panduan alur Hapus/Void seluruh transaksi dan surat jalan, termasuk peringatan stok nota penawaran.
- [ ] Tambahkan entri rilis tanggal WIB 2026-11-05, id stabil, revision 1, tepat tiga langkah, dan highlight sesuai batas karakter; gunakan ilustrasi berlabel yang cocok.
- [ ] Jalankan tes terkait layanan/API/UI/help/workflow/changelog, lint berkas yang diubah, `pnpm --filter @pos/web type-check`, dan `git diff --check` pada berkas tugas.
- [ ] Tinjau diff terhadap salinan awal berkas agar perubahan tugas terpisah dari perubahan lokal sebelumnya; catat batasan lingkungan dan hasil pemeriksaan.
- [ ] Panggil Headroom stats pada akhir sesi dan laporkan hasil ringkas ke pengguna.

## Hasil pelaksanaan — 2026-11-05

- Layanan terpusat sudah menangani Void/Hapus untuk semua jenis transaksi, seluruh surat jalan terkait, dan nota Percetakan sumber. Pengembalian stok memakai bukti mutasi serta tetap aman pada Void berulang atau Hapus setelah Void.
- Peringatan riwayat stok nota penawaran tidak menghalangi penghapusan; hasil dan kebutuhan pemeriksaan ditampilkan setelah berhasil dan disimpan dalam audit.
- Void memakai `transaction.update` dan Hapus memakai `transaction.delete` pada UI serta API. Grant dapat dikonfigurasi per role. Katalog RBAC juga menampilkan kedua aktivitas beserta prasyarat akses Riwayat dan Lihat transaksi.
- Suite fokus: 221 tes pada 13 berkas lulus. Pemeriksaan browser: 32 kombinasi role/grant pada desktop dan ponsel serta 12 skenario jenis transaksi dan dialog lulus.
- Gate suite penuh menemukan panduan progres RBAC yang ikut terhapus dan fixture semua-aktivitas yang belum memberi izin Hapus. Panduan dipulihkan dan fixture dilengkapi; pemeriksaan ulang terkait lulus.
- Prisma client lokal digenerate ulang dari schema yang sudah ada agar model penutupan inventaris tersedia. Tes model tersebut dan `pnpm --filter @pos/web type-check` pada hasil gabungan lulus.
- ESLint berkas tugas dan `git diff --check` lulus. Suite penuh dijalankan kembali oleh hook pre-push untuk integrasi akhir.
- Implementasi disimpan pada worktree terisolasi agar perubahan lokal lain tetap terpisah. Dokumentasi Bantuan, FAQ/workflow, metadata RBAC, dan Catatan Perubahan ikut diperbarui.
- Headroom stats dipanggil; proxy kompresi lokal tidak dapat dijangkau, sehingga keluaran pemeriksaan dibaca dalam potongan terbatas. Indeks GitNexus diperbarui dan pemeriksaan perubahan digunakan sebelum commit.
# Amendment: stock-history warnings for every DELETE

**Goal:** Extend the approved nonblocking stock-history warning to ATK, printing, converted invoices, and all other transaction types.

**Architecture:** Keep the centralized reversal service and its typed evidence error. DELETE records a warning and skips uncertain stock returns; financial reversal, RBAC (`transaction.delete` / `transaction.update`), operational errors, and VOID rules retain their safeguards.

**Tech Stack:** TypeScript, Next.js, Prisma, Vitest.

**Constraints:** Indonesian UI; no production build or server lifecycle changes; preserve unrelated work; no guessed stock returns.

## Execution ledger (amendment)

- [x] Add failing service tests for missing/inconsistent evidence across invoice types and financial reversal; update DELETE expectations while preserving VOID proof checks.
- [x] Broaden only typed DELETE evidence warnings; make delete confirmation generic; update Help, workflow/FAQ, changelog, and design.
- [x] Run focused service/API/RBAC/UI tests, lint/type-check and browser checks; fresh branch review; GitNexus detect-changes before commit.

Verification: RED showed 6 expected evidence-blocking failures. GREEN: 60 service tests (including missing/inconsistent linked Surat Jalan evidence); focused 119 service/API/RBAC/UI/workflow tests; browser 32 role/grant combinations and 12 desktop/mobile transaction scenarios. Fresh read-only review found no actionable issues. GitNexus detected 9 expected symbols, 0 affected processes, low risk. ESLint passed. Root type-check invoked Turbo dependency build and failed before Next at missing Prisma CLI; direct TypeScript (tsc --noEmit) passed after linking the existing Prisma dependencies. Headroom tools work, but its configured proxy reports unreachable.

Publication gate: the normal pre-push hook runs the full suite before updating the authorized remote branches.

Gate diagnosis: the first complete run passed 5,853 tests and skipped 177; one unrelated stock-group approval test exceeded its 5-second deadline during its first route import. All three tests in that file passed in isolation. That first test now has a 15-second deadline to accommodate cold imports on slower Windows runs; the full pre-push gate is repeated.
