# Rancangan: Badge dan pengunci Harga Khusus

Tanggal: 2026-11-04 (WIB)

## Tujuan

Membedakan harga Agen/Dinas yang diatur manual pada produk dari harga yang berasal dari aturan otomatis, serta menjelaskan bahwa aturan tidak dapat dikelola ketika fitur Harga Khusus toko nonaktif.

## Pendekatan

- **Dipilih:** tampilkan daftar aturan di belakang lapisan buram dan terkunci. Lapisan menjelaskan bahwa fitur nonaktif dan menyediakan tombol menuju pengaturan bagi Owner. Pengguna lain diberi petunjuk untuk meminta Owner mengaktifkannya.
- Alternatif: tampilkan lapisan dan pesan tanpa tombol. Pendekatan ini membutuhkan lebih banyak langkah untuk menemukan pengaturan.

## Perilaku

- Bedakan badge **Harga manual** untuk harga Agen/Dinas yang tersimpan pada produk dan **Harga Khusus** untuk harga dari aturan otomatis. Perbedaan terlihat dan dapat dibaca oleh teknologi bantu di halaman Produk, POS, keranjang, pembayaran, pilihan satuan, dan formulir harga yang relevan.
- Badge **Harga custom** untuk satu nota tetap memiliki arti dan tampilan tersendiri.
- Saat fitur nonaktif, bagian aturan pada Produk > Harga Khusus tetap terlihat buram dan tidak dapat digunakan dengan mouse maupun keyboard. Pesan menyatakan: “Fitur Harga Khusus dinonaktifkan. Silakan aktifkan kembali di Pengaturan untuk menggunakannya.”
- Owner dapat membuka langsung tab Harga Khusus di Pengaturan. Pengguna yang tidak dapat mengubah pengaturan diminta menghubungi Owner.
- Selama status pengaturan dimuat atau gagal dimuat, tindakan terhadap aturan tetap terkunci dan tersedia keterangan yang sesuai. Setelah status aktif berhasil dimuat, aturan dapat digunakan seperti sebelumnya.
- Data aturan dan harga yang sudah tersimpan tetap dipertahankan. Perubahan ini tidak mengubah perhitungan harga atau izin transaksi.
- Tab Harga Khusus dapat dibuka oleh pengguna selain Owner untuk melihat petunjuk. Daftar dan tindakan pengelolaan aturan tetap hanya tersedia untuk Owner.
- Input **Harga Khusus pembayaran** bagi pelanggan Industri/Pemerintah mengikuti sakelar fitur. **Ubah Harga Nota** di keranjang adalah jalur harga custom tersendiri yang tetap tersedia sesuai izin saat fitur nonaktif.
- Referensi Agen/Dinas di keranjang diberi label manual. Jika belum diatur dan aturan aktif, harga jual ditampilkan sebagai acuan, bukan sebagai janji harga efektif.

## Penyesuaian pendukung

Perbarui Bantuan dan katalog alur AI agar menjelaskan badge serta cara membuka pengaturan. Tambahkan catatan perubahan singkat. Verifikasi status aktif, nonaktif, memuat, dan gagal; perbedaan badge; navigasi keyboard; dan tampilan seluler.

## Batasan

Tidak mengaktifkan fitur atau mengubah data toko secara langsung. Pengaturan server dan pemeriksaan izin yang sudah ada tetap berlaku.

## Catatan pelaksanaan

Pengujian terarah memeriksa sumber badge, akses pengaturan, status blocker, dialog, referensi harga, serta tampilan seluler dan navigasi keyboard. Perilaku juga diperiksa dengan browser menggunakan data contoh. Headroom MCP dapat memberikan statistik, tetapi proxy kompresinya tidak terhubung; keluaran pemeriksaan dibatasi agar tetap terbaca.
