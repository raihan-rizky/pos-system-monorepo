# Pill Filter Katalog POS — Implementation Plan

> **For agentic workers:** Use `superpowers:executing-plans` in this session. Steps use checkbox syntax.

**Goal:** Ganti dropdown grup/subkategori di POS dengan dua rel pill yang tetap jelas di layar kecil dan tambahkan subkategori CETAK serta SPANDUK ke PERCETAKAN.

**Architecture:** Tambahkan mode tampilan pill pada `CatalogClassificationFilter`, dengan mode dropdown sebagai default agar Produk dan inventaris tidak berubah. POS memilih mode pill; filter tetap memakai query katalog dan callback yang sama. Pratinjau Bantuan menampilkan pola pill yang sama.

**Tech Stack:** Next.js, React, TypeScript, Tailwind, React Query, Vitest, Prisma, PostgreSQL.

**Spec:** `markdown-files/pos-catalog-pill-filter-ux-design-2026-11-16.md`

## Global Constraints

- Semua label baru memakai Bahasa Indonesia.
- Pill grup: `Semua kategori`, `ATK`, `PERCETAKAN`; POS tidak menampilkan `Belum diatur`.
- Rel subkategori selalu terlihat dan memakai petunjuk nonaktif `Pilih kategori dahulu` sebelum grup dipilih.
- Subkategori PERCETAKAN memuat `PLAT`, `PRINT`, `STEMPEL`, `CETAK`, dan `SPANDUK`; seed dan migrasi database menambahkan dua subkategori baru secara idempoten.
- Data produk lama dan relasi klasifikasinya tidak diubah.
- Perubahan grup mengosongkan subkategori; perubahan grup atau subkategori mengembalikan halaman ke 1.
- Mode dropdown tetap menjadi default untuk Produk dan inventaris.
- Gunakan data daring/offline dan izin yang sudah ada; jangan mengubah API, query katalog, stok, maupun logika jumlah, harga, dan pemilihan satuan keranjang. Pastikan label satuan aktif dan aksi untuk menggantinya tetap jelas.
- Sebelum kode, periksa worktree dan kesegaran indeks GitNexus; jika indeks tertinggal dari `origin/dev`, jalankan `gitnexus analyze`.
- Sebelum mengubah setiap fungsi/komponen, jalankan GitNexus impact upstream pada simbol dan file tersebut. Laporkan risiko HIGH/CRITICAL sebelum mengeditnya. Sebelum commit, jalankan `gitnexus detect-changes`.
- Jangan mulai atau menghentikan server dev. Jangan menjalankan `pnpm build`.

## Review Focus

- Grup kosong: rel subkategori tampak, nonaktif, dan tidak mengirim filter — tes komponen membuktikan placeholder nonaktif.
- Grup ATK/PERCETAKAN: hanya subkategori grup terpilih muncul — tes komponen memeriksa pilihan silang.
- Perubahan grup: subkategori lama dibersihkan dan halaman kembali ke 1 — tes POS yang sudah ada tetap lulus.
- POS vs pemanggil lain: POS memakai pill tanpa `Belum diatur`, pemanggil default tetap memakai dropdown dengan opsi itu — tes komponen dan POS memeriksa kedua mode.
- Panduan visual: filter POS memakai pill yang sama dan tidak menggambar `<select>` — tes visual panduan memeriksanya.

---

### Task 1: Tambahkan mode pill pada filter katalog

**Files:**
- Modify: `apps/web/features/product-classification/components/CatalogClassificationFilter.tsx`
- Test: `apps/web/features/product-classification/components/__tests__/catalog-filter.test.tsx`

**Interface:** Tambahkan prop opsional `presentation?: "select" | "pills"`, default `"select"`. Pertahankan prop `includeUnclassified` dan sumber data yang sekarang.

- [ ] **Step 1: Jalankan `gitnexus impact CatalogClassificationFilter -f apps/web/features/product-classification/components/CatalogClassificationFilter.tsx -r 'C:\Projects\pos-system-monorepo\.worktrees\pos-catalog-unit-ux-publish' --include-tests`** dan catat pemanggil serta risikonya.
- [ ] **Step 2: Tulis tes merah untuk dua rel pill.** Tambahkan tes yang merender mode `pills` dengan grup `ATK`, data subkategori `Kertas` dan `PRINT`, serta `includeUnclassified={false}`. Pastikan markup memuat label kedua rel, `ATK`, `PERCETAKAN`, `Kertas`, tombol terpilih dengan `aria-pressed="true"`, tanpa `<select>`, tanpa `PRINT`, dan tanpa `Belum diatur`.
- [ ] **Step 3: Tulis tes merah untuk grup yang belum dipilih.** Pastikan mode pill tetap menampilkan rel kedua dengan `Pilih kategori dahulu` nonaktif.
- [ ] **Step 4: Jalankan tes komponen dan konfirmasi keduanya gagal pada mode tampilan yang belum tersedia.** Jalankan `pnpm --dir apps/web exec vitest run features/product-classification/components/__tests__/catalog-filter.test.tsx`.
- [ ] **Step 5: Implementasikan mode `pills`.** Gunakan `HorizontalScroll` untuk rel pilihan, tombol dengan `aria-pressed`, warna aktif brand dan pilihan netral. Baris grup memanggil `onChange(group, "")`; baris subkategori memanggil `onChange(group, subcategoryId)`. Baris nonaktif memakai tombol disabled. Mode `select` tetap menjadi tampilan default.
- [ ] **Step 6: Jalankan tes komponen.** Perintah yang sama harus lulus, termasuk tes dropdown default, opsi `Belum diatur`, pilihan subkategori, offline, dan akses ditolak.
- [ ] **Step 7: Commit perubahan komponen dan tes.**

### Task 2: Aktifkan pill khusus di POS

**Files:**
- Modify: `apps/web/app/(main)/pos/POSClientPage.tsx`
- Test: `apps/web/app/(main)/pos/__tests__/pos-pricing-render.test.tsx`
- Test: `apps/web/features/pos-search/__tests__/product-selection-cart-render.test.tsx`

- [ ] **Step 1: Jalankan `gitnexus impact POSClientPage -f apps/web/app/(main)/pos/POSClientPage.tsx -r 'C:\Projects\pos-system-monorepo\.worktrees\pos-catalog-unit-ux-publish' --include-tests`** dan tinjau caller serta risikonya.
- [ ] **Step 2: Tambahkan assertion merah** bahwa `CatalogClassificationFilter` di POS menerima `presentation: "pills"` dan `includeUnclassified: false`.
- [ ] **Step 3: Jalankan tes POS** dan pastikan assertion tampilan gagal sebelum wiring.
- [ ] **Step 4: Atur POS memakai mode pill.** Teruskan `presentation="pills"`; pertahankan handler yang membersihkan subkategori, mengirim filter ke query, serta mereset halaman.
- [ ] **Step 5: Ganti tes lama yang menyatakan chip lama dihapus** dengan assertion bahwa POS menggunakan mode pill. Jalankan `pnpm --dir apps/web exec vitest run "app/(main)/pos/__tests__/pos-pricing-render.test.tsx"` dan pastikan tes filter/pagination lulus.
- [ ] **Step 6: Tegaskan label satuan aktif di keranjang** dengan assertion aksesibel `Satuan dipilih: <nama satuan>` dan aksi `Ubah satuan`; pastikan jumlah serta harga mengikuti perilaku yang sudah ada.
- [ ] **Step 7: Commit integrasi POS dan tesnya.**

### Task 3: Selaraskan pratinjau Bantuan dan dokumentasi

**Files:**
- Modify: `apps/web/features/help-documentation/components/app-shell-preview/pages/PosPreview.tsx`
- Test: `apps/web/features/help-documentation/__tests__/help-visual-guide.test.tsx`
- Modify: `apps/web/features/help-documentation/components/HelpContent.tsx`
- Modify: `apps/web/features/changelog/data/changelog.ts`
- Modify: `apps/web/features/changelog/types.ts`
- Modify: `apps/web/features/changelog/components/ChangeIllustration.tsx`
- Test: `apps/web/features/changelog/__tests__/changelog.test.tsx`
- Update: `markdown-files/pos-product-catalog-filter-unit-ux-implementation-2026-11-17.md`

- [ ] **Step 1: Jalankan `gitnexus impact PosPreview -f apps/web/features/help-documentation/components/app-shell-preview/pages/PosPreview.tsx -r 'C:\Projects\pos-system-monorepo\.worktrees\pos-catalog-unit-ux-publish' --include-tests`** dan tinjau caller serta risikonya.
- [ ] **Step 2: Ubah tes panduan menjadi merah** dengan memeriksa bahwa target `pos-catalog-filter` tidak merender `<select>` dan tetap memperlihatkan dua label serta petunjuk subkategori nonaktif.
- [ ] **Step 3: Jalankan tes target panduan** dan konfirmasi gagal karena pratinjau saat ini masih berupa dropdown.
- [ ] **Step 4: Ganti kontrol statis pada `PosPreview`** dengan pill grup, pill subkategori, dan petunjuk nonaktif yang mencerminkan layar POS.
- [ ] **Step 5: Perbarui Bantuan** agar menjelaskan pilihan pill grup, pill subkategori, serta contoh CETAK dan SPANDUK.
- [ ] **Step 6: Catat peningkatan ini di changelog** dengan tanggal WIB `2026-11-17`, rute POS, highlight singkat, dan tepat tiga langkah penggunaan yang sesuai implementasi.
- [ ] **Step 7: Tambahkan ilustrasi changelog POS** yang menunjukkan hierarki pill PERCETAKAN, CETAK/SPANDUK, dan penanda satuan; pastikan labelnya sesuai implementasi.
- [ ] **Step 8: Perbarui dokumentasi implementasi** agar menjelaskan dua rel pill, subkategori baru, dan migrasi katalog.
- [ ] **Step 9: Jalankan tes panduan visual, Bantuan, dan ilustrasi changelog** lalu pastikan lulus.
- [ ] **Step 10: Commit pratinjau, Bantuan, changelog, ilustrasi, tes, dan dokumentasi.** Workflow AI tidak berubah karena tidak ada alur terpandu yang ditambah atau diubah.

### Task 4: Tambahkan CETAK dan SPANDUK ke katalog PERCETAKAN

**Files:**
- Modify: `packages/db/src/catalog-seed.ts`
- Modify: `apps/web/features/product-classification/helpers/classification.ts`
- Modify: `apps/web/features/product-classification/components/ProductClassificationPanel.tsx`
- Modify: `apps/web/features/product-classification/components/ClassificationSubcategoryManager.tsx`
- Modify: `apps/web/features/help-documentation/components/HelpContent.tsx`
- Modify: `apps/web/features/ai-assistant/workflows/workflow-catalog.ts`
- Modify: `apps/web/features/ai-assistant/docs/help/faq.md`
- Test: `apps/web/features/product-classification/helpers/__tests__/catalog-seed.test.ts`
- Test: `apps/web/features/product-classification/helpers/__tests__/classification.test.ts`
- Test: `apps/web/features/product-classification/components/__tests__/classification-panel.browser.test.mjs`
- Test: `apps/web/features/product-classification/server/__tests__/classification-migration.integration.test.ts`
- Test: `apps/web/features/help-documentation/__tests__/product-categories-help.test.ts`
- Test: `apps/web/app/api/product-classification/__tests__/route.test.ts`
- Test: `apps/web/features/product-classification/server/__tests__/classification-move.test.ts`
- Create: `packages/db/prisma/migrations/20261117010000_add_printing_subcategories/migration.sql`

- [ ] **Step 1: Jalankan GitNexus impact upstream pada `planCatalogSeed`** di `packages/db/src/catalog-seed.ts`; catat pemanggil, proses terdampak, dan risikonya.
- [ ] **Step 2: Tambahkan tes merah** bahwa seed menambahkan `CETAK` dan `SPANDUK` untuk `PERCETAKAN`, tidak menduplikasi nama yang sudah ada, dan tidak mengubah subkategori lain.
- [ ] **Step 3: Jalankan tes seed katalog** dan pastikan gagal karena dua default baru belum tersedia.
- [ ] **Step 4: Tambahkan dua default stabil** (`catalog_printing_cetak` dan `catalog_printing_spanduk`) pada `planCatalogSeed`, dengan nama uppercase mengikuti data katalog saat ini.
- [ ] **Step 5: Buat migrasi idempoten** yang menambahkan dua baris ke grup `PERCETAKAN` hanya jika nama yang sama belum ada setelah normalisasi spasi dan kapitalisasi.
- [ ] **Step 6: Perluas allowlist klasifikasi percetakan** agar daftar katalog, validasi API, dan pemindahan produk mendukung kelima subkategori. Pertahankan penolakan untuk nama percetakan lain.
- [ ] **Step 7: Uji helper dan API dengan lima pilihan yang didukung** serta pastikan nama yang tidak diizinkan tetap ditolak.
- [ ] **Step 8: Perbarui allowlist panel pemindahan produk, tes migrasi idempoten, Bantuan, dan panduan AI** agar kelima pilihan PERCETAKAN tampil konsisten.
- [ ] **Step 9: Jalankan tes panel, klasifikasi/seed, Bantuan, workflow AI, dan validasi Prisma.** Review independen menemukan nama baru terfilter oleh allowlist POS dan pemindahan produk; tambahkan kasus red-green untuk API, UI, dan pemindahan.
- [ ] **Step 10: Commit seed, allowlist, panel pemindahan, bantuan, tes, dan migrasi.**

### Final verification and release

- [ ] Jalankan tes terarah filter, POS, panduan, dan seed katalog, lalu `pnpm --dir apps/web exec tsc --noEmit --pretty false` serta Prisma validation.
- [ ] Periksa `git diff --check`, jalankan `gitnexus detect-changes`, dan tinjau seluruh diff.
- [ ] Push ke `dev` memakai hook pre-push normal; jangan melewati suite penuh.
- [ ] Pantau `POS CI` dan `POS Deploy` melalui GitHub, lalu verifikasi `posdev-web` dan `posdev-import-worker` aktif pada release baru melalui SSH `pos-vps`.
