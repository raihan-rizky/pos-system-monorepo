# Rencana Pengujian dan Kesiapan Main Percetakan

> Untuk pelaksana: gunakan alur TDD Superpowers untuk setiap perbaikan dan tinjauan kode sebelum menyiapkan commit integrasi.

Tanggal: 2026-10-20 (Asia/Jakarta).

## Tujuan dan batas

Tambahkan pengujian perilaku pada fitur nota yang sudah disetujui, perbaiki kegagalan yang ditemukan, lalu siapkan commit yang dapat diintegrasikan ke main terbaru. Jangan mencampurkan perubahan inventory pengguna, artefak output/tmp, atau menjalankan production build/server/database produksi. Publikasi remote memerlukan instruksi push yang jelas; permintaan saat ini adalah kesiapan push.

Spesifikasi tetap mengikuti `percetakan-pos-design-2026-10-20.md`. Pakai Vitest untuk domain/API dan harness Playwright yang memuat workspace sebenarnya dengan layanan simulasi. Harapan tes memakai nilai literal, bukan hasil helper yang sedang diuji.

## 1. Batas domain dan antrean penyimpanan

- [x] Buat `apps/web/features/printing-receipts/__tests__/boundaries.test.ts`: pergantian tanggal WIB, tahun kabisat, batas teks dan jumlah baris, nomor kontrol/awalan terlarang, jumlah uang maksimum, dan baris kosong sebelum baris belum lengkap.
- [x] Perluas `autosave.test.ts`: flush bersih tidak menulis, identitas nota salah ditolak, edit terbaru dipertahankan setelah kegagalan, dan antrean disposed tidak memulai permintaan baru.
- [x] Amati regresi nomor baris validasi gagal sebelum mengubah domain. Lakukan impact dan perbaiki pemetaan nomor asli.

```ts
expect(() => getPrintingReceiptCheckoutLines(documentWithBlankFirstRow))
  .toThrow("baris 2");
```

## 2. API, transaksi dan format

- [x] Perluas tes CRUD: lima subtab/prefix, JSON buruk, revisi hilang/tidak sah, batas pagination/pencarian, retry benturan nomor, dan delete yang kalah CAS.
- [x] Perluas tes History untuk kelima subkategori, pencarian nomor dan hasil kosong terisolasi toko.
- [x] Perluas tes layout pada batas halaman setiap subtab, termasuk satu baris melewati kapasitas; jumlah dan nomor baris harus tetap lengkap.
- [x] Tambahkan tes endpoint pajak untuk menolak perubahan snapshot Percetakan dan menjaga transaksi biasa tetap dapat diubah. Jalankan hingga gagal sebelum perbaikan.
- [x] Tambahkan regresi checkout dan persetujuan untuk batas total setelah pajak, diskon, pembayaran dan rincian metode, kontrol nilai maksimum yang sah, serta pemakaian bahan pecahan/berulang dan bahan yang dihapus.

```ts
expect(response.status).toBe(409);
expect(boundary.state.transaction.total).toBe(100000);
```

## 3. Respons lambat dan pergantian identitas

- [x] Perluas `workspace.browser.mjs` dengan respons GET dan POST yang ditahan, pergantian user/toko/otorisasi, kemudian pelepasan respons. Tidak boleh ada PATCH atau UI nota dari scope lama.
- [x] Amati kegagalan nyata pada browser terlebih dahulu, lakukan impact, lalu lindungi kelanjutan aksi asinkron dan pemuatan editor.
- [x] Jalankan ulang pada desktop dan ponsel, termasuk semua alur browser yang sudah ada.

```js
assert.equal(calls.filter(call => call.method === "PATCH").length, beforeSwitch);
assert.equal(await page.locator(".printing-receipt-sheet input").count(), 0);
```

## 4. Verifikasi dan commit siap main

- [x] Jalankan tes terarah, seluruh suite web melalui `pnpm --filter @pos/web test --run`, TypeScript langsung, ESLint berkas terkait, dan diff check. Jangan menjalankan Turbo dengan dependensi build.
- [x] Minta tinjauan independen atas hasil akhir dan tangani temuan penting.
- [x] Fetch origin/main; pisahkan perubahan fitur dari perubahan pengguna. Periksa hasil integrasi terhadap main tanpa menghapus/mengubah pekerjaan pengguna.
- [x] Jalankan GitNexus detect_changes sebelum commit, catat cakupan, dan siapkan commit dengan dokumentasi/panduan/changelog terkait.
- [x] Catat jumlah tes sebenarnya, hasil pemeriksaan, batas layanan simulasi, branch/commit, serta Headroom stats akhir.

## Cakupan tambahan

| Kelompok | Kasus Vitest tambahan |
| --- | ---: |
| Batas domain, tanggal dan nomor | 33 |
| Antrean autosave | 4 |
| Pagination cetak lima format | 20 |
| CRUD, revisi, nomor dan validasi API | 34 |
| Filter/pagination Riwayat dan isolasi toko | 6 |
| Imutabilitas pajak nota diproses | 8 |
| Checkout, stok dan kapasitas nominal | 8 |
| Persetujuan dan kapasitas pembayaran | 7 |
| **Total** | **120** |

Harness browser menambah 12 kombinasi respons tertunda: GET/POST × perubahan pengguna/toko/izin × desktop/ponsel. Semua memakai workspace sebenarnya dengan layanan simulasi; ini bukan uji jaringan database produksi.

## Regresi yang ditutup

- Baris kosong tidak lagi menggeser nomor baris pada pesan validasi pembayaran.
- Respons dari sesi pengguna/toko/izin lama tidak menghidupkan kembali editor atau antrean autosave.
- Endpoint pajak umum menolak perubahan nota diproses, termasuk bila relasinya berubah sebelum pembacaan terkunci.
- Checkout menolak total setelah pajak, diskon dan pembayaran di atas kapasitas Decimal(12,2) sebelum penulisan database.
- Persetujuan menolak pembayaran dan jumlah rincian metode di atas kapasitas; nilai maksimum yang sah tetap diterima. Toleransi pencocokan kurang dari satu sen tidak melewati batas penyimpanan.

Tinjauan independen terakhir: **GO**, tanpa temuan penting tersisa. Seluruh 50 tes checkout/persetujuan terarah lulus setelah kegagalan RED yang diamati.

## Kompatibilitas main dan pemeriksaan cakupan

- `origin/main` sudah diperbarui ke `8d66cc9`, satu commit di atas dasar fitur `9838c2a`. Perubahan main tersebut hanya menyentuh tampilan markup dan tes profit inventory.
- ProductTable dan tes profit di checkout memiliki blob yang sama dengan main. Dua tes katalog lama yang belum mengikuti perubahan main ditemukan gagal pada suite lengkap; ekspektasinya kini menguji Markup, rupiah negatif, persentase terhadap HPP, dan tanda — untuk HPP nol. **11/11 tes katalog/markup lulus**, tanpa mengubah implementasi inventory.
- Run suite awal dihentikan setelah regresi kompatibilitas tersebut diamati. Run akhir memakai `--maxWorkers=2 --fileParallelism` dengan isolasi Vitest; konfigurasi repository tetap sama.
- Manifest commit berisi 83 berkas: fitur/panduan/migrasi/artwork dan koreksi tes kompatibilitas main. ProductTable, ProductUnitFields, product-unit-browser dan tes profit pengguna tidak ditambahkan oleh sesi ini.
- GitNexus staged mendeteksi risiko gabungan **critical** (79 berkas teks sebelum koreksi tes katalog, 55 simbol, 24 alur). Pengguna sudah diberi tahu dan tinjauan independen memeriksa cakupan. Hasil **GO**: tidak ada perubahan tak terduga; dependensi RBAC yang ditunjuk adalah alur yang sudah ada, tanpa perubahan implementasi RBAC.
- Headroom stats tersedia; proxy tidak dapat dihubungi. Penolakan automatic approval review sebelumnya atas ekspor isi privat tetap dihormati. Semua pembacaan dilakukan lokal dan dibatasi; tidak ada pengiriman isi repository melalui jalur pengganti.

## Pemeriksaan terarah yang selesai

| Pemeriksaan | Hasil |
| --- | --- |
| Checkout dan persetujuan setelah batas nominal | 50 tes lulus |
| Katalog dan markup yang sudah ada di main | 11 tes lulus |
| Workspace browser dengan kasus respons tertunda | PASS 1280 / PASS 390 |
| ESLint berkas kode/tes terkait | 72 berkas, exit 0, tanpa error/warning |
| Suite web lengkap | 506 berkas lulus, 2 berkas dilewati; 3.599 tes lulus, 10 dilewati; exit 0 |
| TypeScript web langsung | `pnpm --filter @pos/web type-check`, exit 0 |
| Whitespace Git | Diff fitur dan integrasi bersih; satu baris kosong berlebih di EOF dirapikan |

Log diagnostik disimpan lokal di `tmp/` dan tidak masuk commit. Bukti RED mencakup nomor baris, respons sesi lama, pajak snapshot, batas total setelah pajak, diskon/pembayaran, serta persetujuan.

Perintah suite lengkap: `pnpm --filter @pos/web test --run --testTimeout=30000 --hookTimeout=60000 --maxWorkers=2 --fileParallelism`. Run selesai dalam 517,51 detik. Sepuluh tes yang dilewati adalah empat tes skill opsional dan enam tes PostgreSQL yang memerlukan opt-in; sesi ini tidak mengaktifkan integrasi database tersebut. Peringatan Browserslist tentang umur dataset tidak mengubah hasil tes dan tidak memicu perubahan dependensi.

## Hasil persiapan main

- Commit fitur: `ab70cb2a34f194ffa24d8590be480a6a2b298bc6`, `feat(pos): add inline printing receipts with regression coverage`.
- Basis main yang di-fetch terakhir: `8d66cc9ba47ca0d523602876aaded32162d5bb57`. Pohon integrasi menggabungkan commit tersebut tanpa konflik; kedua berkas main yang masuk memang ProductTable dan tes profit, dengan isi yang sudah sama dengan checkout saat tes dijalankan.
- Integrasi dilakukan melalui pohon dan index Git agar file kerja pengguna tidak ditulis ulang. `main` lokal disiapkan dengan hasil integrasi; branch `codex/percetakan-nota` tetap tersedia. Main remote tidak diubah.
- Deteksi staged terakhir fitur: **80 berkas teks, 55 simbol, 24 alur, critical**. Peringatan sudah disampaikan dan cakupan ditinjau GO. Perubahan akhir terhadap origin/main hanya 83 berkas yang ada pada manifest fitur/tes/dokumentasi, tanpa perubahan implementasi inventory pengguna atau output/tmp.
- Isi empat berkas inventory diperiksa dengan SHA-256 dan tetap sama. ProductTable dan tes profit kini diwarisi dari main; ProductUnitFields serta product-unit-browser tetap menjadi perubahan lokal pengguna di luar commit.
- Hook pre-commit `lint-staged` juga selesai sukses. Headroom stats dipanggil pada awal/akhir tahap; keterbatasan proxy dan larangan ekspor tetap dicatat di atas.

**Status: siap push dari main lokal; belum melakukan push.** Migrasi development sudah diterapkan pada tahap implementasi sebelumnya. Migrasi lingkungan deployment tetap mengikuti prosedur deployment; sesi ini tidak mengubah database produksi.
