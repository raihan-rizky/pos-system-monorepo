# Pemasukan manual dan belanja transfer

Tanggal: 2026-11-03 (Asia/Jakarta)

## Penggunaan

Di **Keuangan**, klik **Tambah Pemasukan** pada bagian Pemasukan tanpa transaksi. Isi tanggal, keterangan / sumber, nominal, dan kategori RC: ATK, Cetak, Spanduk, Print, atau Stempel. Catatan disimpan tanpa transaksi penjualan dan masuk ringkasan, grafik, arus kas serta RC pada Excel bulanan.

Klik **Tambah Belanja Transfer** pada bagian Pengeluaran. Isi tanggal transfer, penerima / supplier, keterangan, dan nominal. Lampiran bukti bersifat opsional. Fitur ini mencatat keuangan tanpa mutasi stok. Catatan berbadge Belanja Transfer Manual dapat diubah dan dihapus sesuai izin.

**Unduh ulang Excel** setelah penambahan atau koreksi. Pemasukan masuk kategori RC yang dipilih. Belanja transfer masuk PENGELUARAN BELANJA pada VIA TRANSFER serta RP; total pengeluaran menghitungnya satu kali.

## Penyimpanan dan API

- Model `ManualIncome` (`pos_manual_incomes`): identitas toko dan pencatat dari sesi, tanggal WIB, keterangan, kategori enum, Decimal(12,2), timestamps, serta `deletedAt`.
- `GET/POST /api/finance/income` dan `PATCH/DELETE /api/finance/income/[id]`: autentikasi, izin `income`, isolasi toko, pagination, validasi 422, catatan tidak tersedia 404, dan soft delete.
- Belanja manual disimpan sebagai satu `Expense` dengan `manualPurchasePaymentMethod=TRANSFER`, kategori SUPPLIES, kembalian nol, dan tanpa relasi transaksi atau pengadaan. Penanda dipertahankan saat koreksi.
- API pengeluaran dan laporan bulanan membaca penanda tersebut sebagai sumber `MANUAL_TRANSFER_PURCHASE`. Query manual selalu dibatasi toko, periode, dan catatan aktif.
- Nominal positif maksimal Rp9.999.999.999,99 dengan dua desimal. Tanggal kalender valid dalam lima tahun terakhir sampai hari ini WIB.
- Default create/update: Owner/Admin/Cashier. Default hapus: Owner/Admin. Pengaturan RBAC tetap menentukan izin aktual.
- Reset domain `salesFinance` mencakup ManualIncome milik toko.

## Migrasi

Migrasi additive: `packages/db/prisma/migrations/20261102090000_manual_finance/migration.sql`. Migrasi membuat enum/tabel/indeks pemasukan, mengaktifkan RLS tanpa akses publik, dan menambah kolom serta CHECK constraint pengeluaran transfer. Akses aplikasi dilakukan melalui Prisma pada route server yang sudah diautentikasi.

Prisma client sudah dihasilkan melalui `pnpm db:generate`. Migrasi `20261102090000_manual_finance` sudah diterapkan dan diverifikasi pada database development serta production; kedua database melaporkan schema up to date.

## Pengujian

Tes domain dan API mencakup lima kategori, tanggal WIB, nominal tidak sah, izin, isolasi toko, pagination, edit, soft delete, marker transfer, ringkasan serta jumlah transaksi yang tetap terpisah dari catatan manual. Tes laporan mencakup pemetaan kolom, filter periode, penghapusan, duplikasi, dan contoh pemasukan Rp100.000 dikurangi belanja Rp25.000 menghasilkan Rp75.000.

Tes browser memakai halaman Keuangan dan komponen asli dengan data sintetis serta respons API terkontrol, tanpa server aplikasi. Cakupan: create, kegagalan simpan dan retry, pencegahan submit ganda, edit/hapus kedua catatan, keyboard, dan viewport 320/390/1280 px.

Hasil final:

- Vitest: **305 tes pada 29 berkas lulus** untuk Keuangan/API, Excel, RBAC/reset, Bantuan, panduan AI, dan catatan rilis.
- Browser Chrome: lulus pada viewport 320, 390, dan 1280 px; tidak ada request perubahan stok atau transaksi.
- TypeScript `tsc --noEmit --incremental false --pretty false --diagnostics`: exit 0, tanpa diagnostik error.
- ESLint pada file sumber fitur: exit 0.
- Prisma generate dan schema validate: lulus. Validasi schema memakai URL dummy lokal dan tidak membuka koneksi database.
- Pemeriksaan SQL pada schema sementara: lulus melalui Prisma schema validation.
- Status migrasi development dan production: lulus; `20261102090000_manual_finance` sudah diterapkan dan kedua database melaporkan schema up to date.
- Screenshot nyata formulir dengan data contoh: `apps/web/public/images/changelog/pemasukan-manual-keuangan.png`.

## Catatan lingkungan

Perubahan dibuat pada repo aktif sesuai persetujuan pengguna. Dokumentasi disimpan pada folder markdown-files di C: sesuai persetujuan pengganti path D:. Headroom dipanggil; proxy lokal dilaporkan tidak terhubung, sehingga keluaran pemeriksaan dibatasi. GitNexus lokal digunakan untuk analisis dampak karena MCP GitNexus tidak tersedia; indeks belum dapat diperbarui pada lingkungan ini.

GitNexus impact untuk simbol yang diedit melaporkan LOW. Pemeriksaan detect_changes pada checkout publikasi digunakan untuk memastikan scope sebelum commit; checkout aktif yang berisi pekerjaan lain tetap tidak disentuh. Review fitur memakai snapshot awal pada `output/manual-finance-20261102/baseline`; patch pembanding dan hasil analisis tersedia di folder output tersebut.
