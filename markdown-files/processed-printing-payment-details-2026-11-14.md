# Koreksi metode pembayaran dan sales pada nota Percetakan diproses

Tanggal: 2026-11-14 (WIB)

## Tujuan

Pengguna dengan izin `printing_receipt.processed:update` dapat memperbaiki metode pembayaran awal dan atribusi sales dari **Edit nota diproses**. Koreksi disimpan bersama nota dan transaksi setelah pengguna memeriksa satu ringkasan perubahan.

## Cara menggunakan

1. Buka transaksi Percetakan dari Riwayat atau nota tersimpan di Kasir > Percetakan, lalu pilih **Edit nota diproses**.
2. Baca peringatan dan pilih **Tetap edit nota**. Di bagian **Data transaksi**, perbarui metode untuk setiap pembayaran awal dan pilih **Sales transaksi**. Nominal pembayaran tetap.
3. Pilih **Tinjau perubahan**, periksa metode, sales, total, piutang, dan pemakaian bahan, lalu pilih **Simpan dan perbarui transaksi**.

## Data yang dipertahankan

- Nominal dan waktu setiap pembayaran awal tidak berubah; hanya metodenya yang dapat dikoreksi.
- Pembayaran lanjutan dan catatan cicilan tetap utuh.
- Identitas pelanggan dan status siklus transaksi tetap mengikuti aturan koreksi nota yang ada.
- Penanda tangan yang tercetak pada nota tetap terpisah dari sales transaksi.
- Ringkasan metode transaksi mengikuti metode pembayaran awal dengan nominal terbesar. Untuk transaksi Tempo, ringkasan tetap Tempo.
- Riwayat pembayaran, tampilan transaksi, dan laporan mengikuti metode serta sales yang tersimpan.

Perubahan tetap lokal sampai tahap tinjauan selesai dan pengguna menyimpan. Koreksi yang juga mengubah total mengikuti izin piutang dan pemeriksaan penerimaan yang sudah berlaku. Penyimpanan nota, transaksi, pembayaran awal, atribusi sales, penyesuaian stok, piutang, dan audit berjalan dalam satu transaksi basis data.
