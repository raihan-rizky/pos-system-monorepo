# Pemulihan transaksi void

Tanggal: 2026-11-21

Owner dapat membuka transaksi berstatus Void di Riwayat, memilih **Pulihkan transaksi**, dan memeriksa status, stok, surat jalan, serta perhitungan pelanggan sebelum mengonfirmasi. Server hanya mengizinkan Owner dan memeriksa kembali pratinjau saat konfirmasi.

Pemulihan mengurangi kembali stok berdasarkan audit void, mengembalikan status transaksi dan surat jalan yang dibatalkan oleh void, serta mengembalikan perhitungan pelanggan yang sebelumnya dibalik. Surat jalan yang sudah dibatalkan sebelum void tetap dibatalkan. Stok kelompok ditampilkan dalam satuan dasarnya; jurnal pemulihan mempertahankan jumlah dalam satuan produk dan mencatat alasan asal pada keterangan. Jurnal khusus pemulihan tidak dihitung sebagai pemakaian stok kedua dalam laporan.

Pemulihan ditolak tanpa perubahan jika audit tidak lengkap, bukti stok atau isi transaksi berubah, relasi atau satuan stok tidak dapat dibuktikan, stok tidak cukup, atau surat jalan berubah setelah void. Untuk surat jalan lama, isi dokumen dibandingkan dengan audit dan selisih cap waktu pembatalan yang kecil ditoleransi; kondisi lain memerlukan pemeriksaan. Transaksi yang telah dihapus tidak dapat dipulihkan.

Operasi memakai lock transaksi dan stok, memvalidasi ulang token pratinjau, serta menyimpan perubahan dan audit dalam satu transaksi database. Nomor urut audit mengurutkan siklus void dan pemulihan secara konsisten saat permintaan bersamaan. Migrasi menambah urutan audit dan alasan jurnal pemulihan sambil mempertahankan catatan sebelumnya.

Pengujian PostgreSQL terisolasi mencakup nota legacy, surat jalan lama, void ulang, dua permintaan pemulihan bersamaan, dan bahan cetak dengan stok kelompok. Pengujian tambahan memeriksa izin, pratinjau, riwayat stok, laporan, dan kondisi gagal aman.

## Migrasi dan rollback produksi

Migrasi `20261120010000_transaction_unvoid_audit` diterapkan sebelum memublikasikan fitur ke `main`. Salinan PostgreSQL produksi digunakan untuk menguji pemulihan backup, perubahan dari 114 ke 115 catatan migrasi, dan eksekusi ulang Prisma tanpa perubahan tambahan. Salinan backup yang dibuat setelah fence penulis aktif juga berhasil dipulihkan dengan 114 catatan migrasi yang sama.

Rilis bridge memakai schema yang sama dengan fitur penuh dan menjadi kandidat rollback aplikasi. Jika diperlukan, rollback mengaktifkan kembali rilis bridge dengan data dan audit pemulihan yang sudah tersimpan. Rilis sebelum migrasi memiliki fingerprint database berbeda. Verifikasi kecocokan schema dan fingerprint serta jalankan canary sebelum memilih rilis rollback.
