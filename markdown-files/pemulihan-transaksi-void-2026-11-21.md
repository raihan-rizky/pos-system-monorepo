# Pemulihan transaksi void

Tanggal: 2026-11-21

Owner dapat membuka transaksi berstatus Void di Riwayat, memilih **Pulihkan transaksi**, dan memeriksa status, stok, surat jalan, serta perhitungan pelanggan sebelum mengonfirmasi. Server hanya mengizinkan Owner dan memeriksa kembali pratinjau saat konfirmasi.

Pemulihan mengurangi kembali stok berdasarkan audit void, mengembalikan status transaksi dan surat jalan yang dibatalkan oleh void, serta mengembalikan perhitungan pelanggan yang sebelumnya dibalik. Surat jalan yang sudah dibatalkan sebelum void tetap dibatalkan. Stok kelompok ditampilkan dalam satuan dasarnya; jurnal pemulihan mempertahankan jumlah dalam satuan produk dan mencatat alasan asal pada keterangan. Jurnal khusus pemulihan tidak dihitung sebagai pemakaian stok kedua dalam laporan.

Pemulihan ditolak tanpa perubahan jika audit tidak lengkap, bukti stok atau isi transaksi berubah, relasi atau satuan stok tidak dapat dibuktikan, stok tidak cukup, atau surat jalan berubah setelah void. Untuk surat jalan lama, isi dokumen dibandingkan dengan audit dan selisih cap waktu pembatalan yang kecil ditoleransi; kondisi lain memerlukan pemeriksaan. Transaksi yang telah dihapus tidak dapat dipulihkan.

Operasi memakai lock transaksi dan stok, memvalidasi ulang token pratinjau, serta menyimpan perubahan dan audit dalam satu transaksi database. Nomor urut audit mengurutkan siklus void dan pemulihan secara konsisten saat permintaan bersamaan. Migrasi menambah urutan audit dan alasan jurnal pemulihan sambil mempertahankan catatan sebelumnya.

Pengujian PostgreSQL terisolasi mencakup nota legacy, surat jalan lama, void ulang, dua permintaan pemulihan bersamaan, dan bahan cetak dengan stok kelompok. Pengujian tambahan memeriksa izin, pratinjau, riwayat stok, laporan, dan kondisi gagal aman.
