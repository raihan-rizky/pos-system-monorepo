# Nama otomatis dan PDF nota percetakan

Tanggal rancangan: 2026-11-12 (WIB)

## Tujuan dan cakupan

Kurangi pengetikan nama pada nota percetakan dan cegah pembuatan PDF sebelum nota diproses. Berlaku untuk Spanduk, Percetakan, Plat, Stempel, dan Print/FC. Alur ini memakai data yang dipilih pada modal pembayaran; tidak ada perubahan skema basis data atau izin baru.

## Nama pada nota

- Saat pembayaran dikonfirmasi, salin nama pelanggan yang dipilih ke bagian Yth. Pada Spanduk, salin juga nama pelanggan ke bagian Penerima.
- Salin nama sales yang dipilih ke bagian Hormat Kami untuk semua jenis nota. Jika tidak ada sales yang dipilih, pertahankan nama Hormat Kami yang telah diisi manual.
- Nama pilihan disimpan pada dokumen nota di dalam transaksi database yang sama dengan pembayaran. Checkout memakai izin membuat transaksi dan tidak memerlukan izin mengubah draft hanya untuk menyimpan nama. Jika pembayaran gagal, nama draft tetap seperti semula; jika respons transaksi hilang, percobaan ulang mengambil transaksi dan nama yang sudah tersimpan.
- Pratinjau, PDF, dan cetak ulang menggunakan isi yang sama. Koreksi nota yang sudah diproses tetap mengikuti kemampuan edit dan izin yang berlaku.
- Pilihan pelanggan umum mengikuti nama pelanggan yang dikembalikan modal pembayaran. Nota lama tidak diperbarui secara massal.

## Pembatasan PDF untuk draft

- Nota yang masih draft tetap bisa dibuka dalam pratinjau, tetapi tindakan Unduh PDF dan Cetak dinonaktifkan dengan penjelasan bahwa nota harus diproses terlebih dahulu.
- Fungsi pembuatan PDF menolak nota draft juga, agar pembatasan tetap berlaku jika dipanggil dari jalur lain. Nota yang sudah diproses tetap mengikuti perilaku dan penanda status yang ada, termasuk menunggu persetujuan, dibatalkan, atau direfund.

## Pemeriksaan

- Uji nama pelanggan dan sales untuk kelima jenis nota, pelanggan umum, sales kosong, serta penyimpanan dan cetak ulang.
- Uji draft tidak dapat diunduh atau dicetak melalui antarmuka maupun fungsi PDF, sementara pratinjau tetap tersedia dan nota yang sudah diproses tetap dapat menghasilkan PDF.
- Uji izin create tanpa update, pelanggan dari toko lain, pembayaran yang gagal lalu modal dibuka kembali, dan respons transaksi yang hilang lalu dicoba ulang.
- Perbarui Bantuan, katalog alur AI Assistant, dan catatan perubahan sesuai alur yang benar-benar diterapkan.

## Catatan implementasi — 2026-11-13 (WIB)

- Pilihan pelanggan yang terbentuk saat pembayaran disimpan sementara per nota dan per sesi toko/pengguna. Pilihan dipakai lagi jika pembayaran gagal dan modal ditutup, tetapi dilepas saat isi pelanggan pada draft berubah.
- Checkout yang membuat transaksi (HTTP 201) dapat membuka pratinjau dari snapshot draft dan data transaksi yang baru disimpan apabila pembacaan ulang nota gagal. Tanggal transaksi dibaca sebagai tanggal WIB; nama sales hanya mengganti Hormat Kami jika transaksi memiliki salesperson.
- Checkout ulang atau transaksi yang sudah diproses (HTTP 200) tetap membutuhkan pembacaan ulang nota. Jika pembacaan ulang gagal, editor dikosongkan dan aplikasi memberi tahu bahwa pembayaran tercatat tetapi nota belum dapat dimuat.
- Draft tetap bisa dipratinjau; tombol cetak dan unduh PDF dinonaktifkan, dan jalur pembuatan PDF menolak draft.
