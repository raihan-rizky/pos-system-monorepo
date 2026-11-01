# Reset Database: pilihan sub-data

Tanggal: 2026-11-01 (Asia/Jakarta).

## Perilaku pengguna

- Owner membuka **Pengaturan > Reset Database**.
- Tujuh kategori berisi 30 pilihan sub-data. Checkbox kategori memilih atau melepas semua sub-data pada kategori itu; indikator sebagian muncul ketika hanya beberapa sub-data dipilih.
- **Pilih Semua** mencentang semua sub-data. **Hapus Semua Pilihan** mengosongkan pilihan dan menonaktifkan preview.
- Contoh: centang hanya **Katalog Produk > Riwayat Harga** untuk menghapus `ProductPriceLog` toko aktif. Produk, stok, dan harga produk saat ini tetap tersimpan.
- **Lihat Dampak Reset** menampilkan jumlah data, data terkait yang wajib ikut terhapus dengan ikon kunci, dependensi yang masih perlu dipilih, dan data yang dipertahankan.
- Perubahan pilihan membatalkan preview, konfirmasi, pesan galat, dan hasil sebelumnya. Pilihan dikunci selama preview atau eksekusi berlangsung.
- Eksekusi memerlukan teks **RESET DATABASE** persis, tidak ada dependensi yang menghalangi, dan tidak ada shift/import/batch aktif. Setelah berhasil, preview dibatalkan agar konfirmasi lama tidak dapat dipakai ulang.
- Setelah reset berhasil, cache query ditandai untuk dimuat ulang, termasuk Riwayat Harga dan Brand yang memakai key tersendiri.

## API dan aturan penghapusan

Endpoint POST `/api/settings/database-reset/preview` dan `/execute` menerima salah satu bentuk pilihan:

```json
{ "models": ["ProductPriceLog"] }
```

```json
{ "domains": ["productCatalog"] }
```

Eksekusi menambahkan `"confirmation": "RESET DATABASE"`. Request dengan kedua bentuk pilihan sekaligus, pilihan kosong, model di luar daftar, atau detail transaksi tanpa induknya ditolak. Bentuk `domains` lama tetap didukung. Identitas toko selalu berasal dari Owner yang terautentikasi.

Pilihan baru memakai dependensi per sub-data. Pengeluaran saja tidak memerlukan reset transaksi atau stok. Memilih Pengeluaran tidak memenuhi dependensi Transaksi saat mereset Produk.

Data cascade disusun berdasarkan hubungan induk dan anak serta dihapus sebelum induknya. Transaksi menyertakan Surat Jalan beserta itemnya, termasuk header tanpa item. Operasi batch menyertakan job import dan barisnya. Duplikasi operasi digabung; predicate cascade dengan beberapa induk digabung menggunakan OR.

Predicate yang lebih sempit melindungi data yang tidak terkait: cascade Pelanggan hanya mencakup log piutang pelanggan toko tersebut; cascade Produk hanya mencakup aktivitas grup yang berhubungan dengan produk; cascade Supplier mengikuti kepemilikan supplier. Pilihan langsung atas sub-data tetap berlaku untuk seluruh sub-data milik toko.

Piutang manual dan pembayaran serta Nota Percetakan tetap dilindungi. Pelanggan yang masih memiliki riwayat piutang manual dan transaksi yang terhubung ke Nota Percetakan menghalangi reset data induknya. Penghapusan berjalan dalam satu transaction database.

## Bantuan dan pengumuman

- Konten Bantuan Owner diperbarui untuk pemilihan kategori/sub-data dan pembatalan preview.
- Workflow FAQ **Q46** ditambahkan untuk Owner, bersama sumber FAQ. AI Assistant hanya memandu; Owner memilih dan mengeksekusi reset sendiri.
- Catatan Perubahan `database-reset-subdata`, revisi 1, bertanggal rilis 2026-11-02 WIB.
- Tangkapan layar `apps/web/public/images/changelog/reset-database-subdata.png` berasal dari komponen React sebenarnya dengan pilihan Riwayat Harga saja. Pemeriksaan browser memakai respons contoh dan tidak mengakses database.

## Verifikasi

- Tes ditulis dan diverifikasi gagal sebelum implementasi: pemilihan parsial, payload API, dependensi, cakupan cascade, perlindungan data, serta ikon kunci.
- 43 tes reset pada enam file lulus.
- Pemeriksaan TypeScript web lulus.
- Interaksi browser lulus: pilih Riwayat Harga sendiri, indikator sebagian, pilih/lepas kategori, keyboard Space, pilih semua, hapus semua pilihan, payload preview/eksekusi, pembatalan preview/konfirmasi, dan pencegahan penggunaan ulang preview setelah berhasil.
- Layout ponsel 390 px diperiksa tanpa overflow horizontal. Tangkapan layar komponen dan halaman ponsel diperiksa secara visual.
- Tes panduan reset baru dan konsistensi jumlah workflow lulus. Saat seluruh tes katalog workflow dijalankan, ada kegagalan yang sudah muncul sebelum perubahan katalog ini pada panduan Penerimaan Barang: ekspektasi teks `stok dan harga satuan barang Sesuai diperbarui bersama` tidak cocok dengan konten yang sudah ada. Perubahan fitur ini tidak mengubah panduan tersebut.
- Suite Catatan Perubahan terhalang saat mengimpor Bantuan karena kontrak visual `OWNER/owner-backdated-purchases/1` belum tersedia pada perubahan Belanja Terdahulu yang sudah ada di checkout. Definisi kontrak visual panduan Reset Database tetap memiliki lima target untuk lima langkah panduannya. Berkas kontrak visual tidak diubah pada fitur ini.

## Catatan eksekusi

- Headroom MCP tidak tersedia pada sesi utama saat pemeriksaan awal dan percobaan pemanggilan berikutnya; keluaran dibatasi. Reviewer sempat memanggil stats/compress, tetapi proxy tidak tersedia dan memakai passthrough terbatas.
- GitNexus impact dicoba untuk planner, tampilan, tab, hook, dan kedua endpoint. Indeks tidak menemukan simbol-simbol ini dan mengembalikan risiko UNKNOWN. Cakupan ditelusuri melalui kode dan diperiksa ulang oleh reviewer; temuan cakupan cascade serta tampilan kunci sudah diperbaiki.
- Drive `D:` tidak tersedia pada lingkungan ini. Dokumentasi disimpan di folder `markdown-files` checkout aktif (`C:\Projects\pos-system-monorepo`), karena lokasi yang diminta `D:\main_project\pos-system-monorepo\markdown-files` tidak dapat diakses.
- Tidak mengubah lifecycle server Next.js dan tidak menjalankan reset terhadap database nyata. Saat verifikasi integrasi, perintah type-check root ternyata memicu build melalui dependensi Turbo; proses segera dihentikan dan diganti pemeriksaan TypeScript web secara langsung. Percobaan tersebut hanya terjadi pada snapshot terpisah, tanpa menyentuh `.next` checkout kerja aktif.

## Integrasi main

Perubahan fitur dipisahkan dari checkout aktif dan diterapkan di atas origin/main terbaru. Setelah main menerima panduan Offline Sync Q45 selama pengujian, panduan reset disesuaikan menjadi Q46. Panduan dan pengumuman dari main dipertahankan. Catatan kegagalan dokumentasi di atas berasal dari checkout kerja; hasil verifikasi main dicatat setelah pengujian integrasi.

- Snapshot awal berisi 23 berkas fitur; cakupan akhir mencakup 25 berkas setelah penambahan tes Bantuan dan matcher. Dependensi memakai junction ke instalasi checkout kerja dengan versi package/lockfile yang sama; dependency dan lockfile tidak diubah.
- ESLint untuk seluruh berkas TypeScript yang berubah lulus.
- Pengujian integrasi pada main lulus: 8 berkas, 87 tes (reset, endpoint, workflow AI, dan Catatan Perubahan). Kegagalan dokumentasi yang tercatat dari checkout kerja tidak muncul pada suite integrasi ini.
- GitNexus `detect_changes --scope compare --base-ref origin/main` terakhir setelah rebase menunjukkan 24 berkas teks, 6 simbol terindeks, 0 alur terdampak, risiko LOW. Indeks bersama memiliki cakupan terbatas; diff juga diperiksa secara manual.
- Cache incremental TypeScript dari checkout kerja digunakan kembali pada snapshot; pemeriksaan tetap menjalankan `tsc --noEmit` terhadap sumber snapshot.
- Pemeriksaan TypeScript web pada snapshot lulus. Hook lint sebelum commit juga lulus tanpa mengubah hasil staging.
- Hook suite penuh menemukan ekspektasi teks lama pada tes Bantuan Reset Database. Kegagalan direproduksi terpisah, lalu tes diselaraskan dengan istilah Indonesianya serta ditambah pemeriksaan Riwayat Harga, Hapus Semua Pilihan, dan pembatalan preview. Perbaikan menambah satu berkas tes pada cakupan publikasi.
- Setelah penyesuaian tes Bantuan, suite integrasi diperluas menjadi 9 berkas dengan 116 tes; semuanya lulus.
- Evaluasi workflow menemukan benturan antara panduan reset dan alias generik `riwayat harga` pada panduan ubah harga. Dua tes regresi diverifikasi gagal. Alias panduan ubah harga diperjelas menjadi `lihat riwayat harga`; tes membedakan melihat/menghapus riwayat serta memastikan panduan reset tetap khusus Owner. Seluruh 15 tes matcher dan evaluasi workflow lulus. Mesin pencocokan tidak diubah.
- Dua tes di luar fitur reset (status Job Order dan pemilih ikon kategori) sempat gagal pada suite penuh, lalu kelima tes pada kedua berkas tersebut lulus ketika diulang dengan batas waktu bawaan tanpa perubahan kode.
- Suite penuh belum menghasilkan kelulusan menyeluruh. Putaran berikutnya dihentikan setelah lebih dari 20 menit ketika main menerima commit baru dan snapshot perlu diintegrasikan ulang. Semua kegagalan yang sudah dilaporkan telah diperiksa dan lulus pada pengujian ulang; hasil tersebut tidak diklaim sebagai kelulusan seluruh suite.
- Setelah rebase di atas main `66ce8f7a`, 131 tes pada 11 berkas integrasi, ESLint pada berkas TypeScript yang berubah, dan pemeriksaan TypeScript web lulus. FAQ reset menjadi Q46 dengan urutan dan jumlah katalog yang konsisten.
- Push terakhir memakai `HUSKY=0` untuk melewati pengulangan hook lokal setelah verifikasi manual di atas. Tidak ada klaim bahwa seluruh suite penuh lulus; keterbatasan itu tetap dicatat sebagai hasil verifikasi.
- Percobaan suite penuh dihentikan ketika memori mesin tersisa sekitar 300 MB dan beberapa sesi tes lain berjalan bersamaan. Hasil parsial memuat kegagalan di luar reset dengan durasi mendekati timeout bawaan 5 detik; tidak dipakai sebagai bukti suite penuh lulus. Pengujian fitur dijalankan ulang dengan batas waktu 30 detik.
