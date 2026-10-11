# Rencana Kesiapan Merge Supplier Shopping

**Tujuan:** Menyiapkan `codex/supplier-shopping-merge` agar dapat digabung ke `main` dengan verifikasi lengkap dan WIP pengguna tetap tersimpan.

## Kondisi awal

- Empat temuan P2 telah diperbaiki; review ulang tidak menemukan regresi baru.
- Tes Supplier/API lulus (37 file, 165 tes saat verifikasi awal; satu tes inspeksi string kemudian diganti tes perilaku). Setelah penguatan terakhir, 12 tes sesi/cache/repository lulus.
- TypeScript file berubah beserta dependensinya lulus. Pemeriksaan seluruh aplikasi belum selesai.
- Perubahan terbaru belum di-commit; checkout `main` memiliki WIP yang mencakup file bertumpang tindih.
- Simulasi merge commit saat ini bersih, tetapi belum mencakup perbaikan yang belum di-commit atau WIP di `main`.

## Ruang lingkup

Mencakup validasi lengkap, pengemasan commit Supplier, uji integrasi dengan `main` terbaru, dan langkah aman untuk WIP lokal. Deploy produksi serta perubahan di luar fitur Supplier tidak termasuk tahap kesiapan merge.

## Langkah berurutan

1. **Inventarisasi perubahan.** Rekam status/diff worktree Supplier dan `main`; pastikan thumbnail, warna tombol, perbaikan empat bug, tes, serta dokumentasi masuk ke cakupan Supplier. Pisahkan file environment, keluaran dev, dan pekerjaan fitur lain.
2. **Selesaikan validasi lengkap.** Jalankan `pnpm test` dan `pnpm type-check` pada branch Supplier atau CI. Catat log dan exit code. Script lint web juga menjalankan `tsc --noEmit`, sehingga tidak perlu mengulangi proses identik. Jika gagal, bandingkan dengan checkout bersih base `main` untuk membedakan regresi dan masalah sebelumnya; timeout tidak dihitung lulus.
3. **Verifikasi migrasi pada database lokal terisolasi.** Uji migrasi `20261010_unified_shopping_request_approval` dari skema sebelum fitur, dengan fixture legacy/request baru. Periksa versi alur, status penolakan, transaksi approval/purchase/expense, pengiriman bersamaan, dan bahwa approval tidak mengubah stok. Jangan memakai database produksi.
4. **Jalankan regresi browser.** Pada dev server worktree yang dikelola pengguna, uji buka/tutup/ganti permohonan, konfirmasi jumlah berlebih, draft saat refetch, produk nonaktif jumlah nol, unit tanpa konversi angka, pembelian legacy hingga penerimaan, serta pembaruan Keuangan/HPP. Gunakan fixture lokal dan periksa desktop, ponsel, keyboard, dan konsol.
5. **Commit perubahan Supplier yang sudah diverifikasi.** Jalankan GitNexus `detect_changes` untuk perubahan aktual dan perbandingan terhadap `main`, review diff dan `git diff --check`, kemudian stage hanya cakupan Supplier. Dokumentasi baru berada dalam folder yang di-ignore; sertakan secara eksplisit bila perlu. Jangan mengikutkan WIP `main` atau file environment.
6. **Uji integrasi dengan `main` terbaru.** Fetch referensi terbaru dan buat worktree integrasi bersih. Simulasikan gabungan commit Supplier dengan target `main`; selesaikan konflik yang relevan, ulangi pemeriksaan lengkap pada hasil gabungan, dan tinjau migrasi serta diff final. Checkout `main` yang kotor tetap dipertahankan selama tahap ini.
7. **Siapkan merge lokal.** Sebelum menjalankan merge di checkout utama, simpan WIP `main` dalam snapshot terpisah yang bisa dipulihkan, termasuk file untracked yang relevan. Pastikan snapshot dapat dibaca dan checkout siap menerima merge. Setelah merge, pulihkan WIP serta selesaikan tumpang tindih Bantuan/katalog workflow secara terpisah; jangan menimpa isian pengguna.

## Kriteria siap merge

- Semua perubahan Supplier tersimpan pada commit yang direview.
- Tes lengkap dan pemeriksaan tipe pada hasil integrasi lulus, atau pengecualian masalah base telah diputuskan secara eksplisit.
- Migrasi dan regresi browser terverifikasi pada lingkungan lokal terisolasi.
- Integrasi dengan target `main` terbaru tidak memiliki konflik yang belum terselesaikan.
- WIP checkout utama memiliki snapshot terverifikasi dan strategi pemulihan.

## Batasan pelaksanaan

- Jangan menjalankan `pnpm build` atau mengelola lifecycle dev server pengguna.
- Jangan merge, push, deploy, atau menerapkan migrasi produksi pada tahap penyusunan rencana ini.
- Drive D: yang dirujuk AGENTS.md tidak tersedia; rencana disimpan pada `markdown-files` worktree aktif.
- Headroom MCP is running on localhost:8787; startup/readiness and compression were verified on 2026-10-11.

## Execution evidence — 2026-10-11

- Preserved both checkouts' changes in `C:/Users/Raihan Rizki/.codex/backups/supplier-merge-readiness-2026-10-11-6f2552`. File copies were verified by SHA-256; the main checkout patch passed reverse-application verification without modifying files. Main's 49 changed/untracked files remain in place.
- Fetched origin. Local `main` is 15 commits ahead of `origin/main`; both refs are ancestors of the Supplier branch. Integrating the feature is a fast-forward at these refs.
- Full monorepo validation passed: `pnpm type-check --only`, four tasks successful, exit 0. Turbo's ordinary `type-check` command includes build prerequisites, so `--only` is required during this interactive session. An initial invocation that triggered that prerequisite was stopped.
- Migration validation passed on a separate local PostgreSQL database, `codex_supplier_migration_20261011_v2`, at port 54339. Applied the pre-feature main schema, seeded legacy requests, and ran the exact feature migration. Twelve assertions passed against actual services: legacy compatibility, flow 2 creation, atomic approval/expense/HPP, rejection metadata, retry conflicts, concurrent approvals, approval/rejection race, purchase numbering, rollback/retry, and unchanged stock. Prisma schema comparison returned exit 0 and an empty migration.
- Database evidence is stored in `C:/Users/Raihan Rizki/AppData/Local/Temp/codex-supplier-migration-20261011/` (`integration.log`, `validate.ts`, `schema-diff.log`). The existing `pos_e2e` database was untouched by migration validation.
- The user authorized starting the Supplier worktree dev server on port 3003 with the local `pos_e2e` test database. It uses `.next-readiness` to keep generated development assets separate. Generated config/output changes must be excluded from the feature commit.
- Full tests, live browser regression, final review, and the final commit/integration checks are still in progress. No merge, push, deployment, or production migration has been performed.

### Final regression corrections and live checks

- Modal drafts now reset when opening another approval session, preserve edits on same-request refetch, and cannot submit stale request data. Focus enters the dialog, Tab wraps within it, Escape closes it, and focus returns to the opener; the background is inert while open.
- Finalized and legacy purchase mutations refresh shopping history, finance/report totals, product/unit data, HPP history and stock-group details. Inactive original items can be declined at quantity zero; positive purchases and substitutions still require active products.
- Regression checks include actual QueryClient cache behavior, modal session/keyboard behavior, service and repository validation. The outdated Help test was updated to the approved unified flow; its focused rerun passed. The first full suite had 2,395 passing, one outdated Help assertion failure and ten skipped tests; the final integration rerun remains required.
- Live Chrome validation on localhost:3003 verified thumbnails, unit badges, approval/rejection colors, no overflow at 390px, numerical quantity preservation on unit change, same-request reconnect refetch preserving edits, session reset, and keyboard focus behavior. Fixture A approved 12 dus at Rp 800: exactly one purchase and one Rp 9,600 expense, dus HPP Rp 800, no stock change and no receipt applied. Rejection, inactive decline and legacy receipt checks are still in progress.
- GitNexus current-change analysis reports LOW risk (five mapped symbols, zero mapped processes). Its shared index is thirteen feature commits behind, so mapping is partial; manual review covers the unindexed approval modal and tests. No remaining actionable findings in the final code review.
