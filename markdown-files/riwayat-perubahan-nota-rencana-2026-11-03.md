# Rencana implementasi riwayat perubahan nota

**Tujuan:** Mencatat setiap perubahan nyata oleh Sales pada transaksi yang telah diproses dan memberi Owner akses ke perbandingan versi.

**Rancangan:** [riwayat-perubahan-nota-design-2026-11-03.md](riwayat-perubahan-nota-design-2026-11-03.md)

**Teknologi:** Next.js, TypeScript, Prisma, PostgreSQL, dan inbox notifikasi yang sudah ada.

## Batasan

- Pemicu: peran `SALES`, status awal `COMPLETED` atau `DP`, dan isi nota benar-benar berubah.
- Satu transaksi database menyimpan perubahan, snapshot sebelum/sesudah, dan notifikasi Owner untuk toko yang sesuai.
- Gunakan penguncian dan pemeriksaan konflik yang sudah ada. Kegagalan penyimpanan membatalkan seluruh bagiannya.
- Pemilik hanya dapat membaca riwayat untuk tokonya sendiri. Versi sebelum perubahan pertama merupakan nota asli.
- Tidak menjalankan production build atau mengubah siklus hidup development server.

## Langkah

1. Tambahkan model dan migrasi riwayat perubahan dengan identitas transaksi, toko, pelaku, waktu, dan dua snapshot JSON. Tambahkan helper untuk mengambil isi nota yang stabil, membedakan isi yang berubah, serta menyimpan riwayat dan inbox Owner di dalam transaksi Prisma.
2. Hubungkan helper ke penyimpanan item, rincian, dan pajak transaksi biasa. Ambil snapshot di bawah kunci transaksi dan pertahankan respons, validasi, stok, piutang, serta perilaku penyimpanan parsial yang sudah ada.
3. Hubungkan helper ke penyimpanan nota Percetakan yang sudah diproses di dalam transaksi dan urutan kunci yang sudah ada. Simpan isi dokumen Percetakan dalam snapshot.
   Hubungkan juga pembayaran piutang dari nota dan profil pelanggan. Kunci pelanggan sebelum invoice, simpan rincian metode pembayaran, dan catat setiap invoice yang menerima alokasi pembayaran.
4. Tambahkan API baca khusus Owner yang membatasi toko dan mengembalikan riwayat berurutan beserta nota asli. Tambahkan halaman perbandingan yang dibuka melalui notifikasi dan dapat dijangkau kembali dari Riwayat Transaksi.
5. Perbarui Bantuan, katalog alur AI, Catatan Perubahan, dan dokumentasi operasional sesuai implementasi. Jalankan pemeriksaan statis yang tersedia tanpa production build atau mengelola server.

## Hal yang perlu diperhatikan saat implementasi

- Penyimpanan item dan rincian dari layar yang sama adalah dua permintaan terpisah; riwayat harus tetap akurat bila hanya salah satunya berhasil.
- Perubahan tanpa perbedaan isi tidak boleh menghasilkan notifikasi.
- Penambahan, penghapusan, dan perubahan jumlah/harga item harus dapat dipahami pada perbandingan, termasuk item dengan nama sama.
- Perubahan pajak atau total dapat mengubah status antara lunas dan DP; status yang menentukan pemicu adalah status sebelum penyimpanan.
- Snapshot nota Percetakan harus mencakup teks dokumen dan item, bukan hanya total transaksi.
- Notifikasi harus tetap menunjuk ke perubahan tertentu walaupun ada perubahan berikutnya.
- Riwayat lama yang tidak tersimpan sebelum fitur ini tidak dapat ditampilkan kembali.
