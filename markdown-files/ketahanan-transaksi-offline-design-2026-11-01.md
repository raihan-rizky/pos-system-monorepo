# Desain ketahanan transaksi offline

Tanggal: 2026-11-01 (WIB)

## Tujuan

Kasir dapat menyiapkan perangkat saat online, membuka kembali POS saat offline, mencatat transaksi dan shift secara lokal, lalu menyinkronkannya tanpa duplikasi atau kehilangan informasi pembayaran. Server tetap menjadi penentu izin dan hasil rekonsiliasi.

## Keputusan yang disetujui

- Satu ID transaksi dibuat sebelum pengiriman pertama dan dipakai kembali pada checkout online maupun sinkronisasi offline.
- Aturan otorisasi, harga, stok, dan pembayaran saat sinkronisasi mengikuti aturan checkout biasa. Selisih atau konflik yang tidak dapat diputuskan otomatis harus dapat diperiksa, bukan diam-diam dihapus.
- Antrean lokal menyimpan status, identitas kasir dan toko, detail pembayaran, serta kegagalan. Pemrosesan dapat dilanjutkan setelah halaman ditutup, dan data yang belum tersimpan di server tidak ikut terhapus saat riwayat sinkron dibersihkan.
- Metode tunai, pembayaran gabungan, DP, dan Tempo mempertahankan jumlah dibayar dan kembalian. Transaksi yang membutuhkan approval tetap menunggu approval.
- Shift lokal menyimpan identitas dan operasi buka/tutup; operasi dikirim dalam urutan yang sesuai dan konflik ditampilkan untuk penyelesaian.
- Perangkat disiapkan saat online dengan katalog lengkap dan shell offline. Data perangkat terikat kepada kasir dan toko serta dibuka menggunakan PIN lokal; hak akses divalidasi kembali setelah terhubung.
- Perubahan diikuti pengujian kegagalan jaringan, proses terhenti, pembayaran, izin, shift, dan pembukaan ulang offline. Dokumentasi, Bantuan, workflow assistant, dan catatan perubahan diperbarui sesuai perilaku yang benar-benar tersedia.

## Batasan keamanan

Saat benar-benar offline server tidak dapat segera mencabut izin perangkat. Akses lokal memakai identitas dan izin yang terakhir diverifikasi; operasi tetap harus melewati pemeriksaan server saat sinkronisasi. Shell offline tidak boleh menyimpan respons SSR terautentikasi dalam cache publik.

## Keandalan dan migrasi

Entri antrean lama tanpa identitas tidak boleh dikaitkan otomatis dengan kasir yang berbeda atau dihapus. Versi penyimpanan baru harus mempertahankan entri lama dan menyediakan jalur pemeriksaan. Perangkat yang belum berhasil disiapkan harus menampilkan status tidak siap, bukan menyatakan siap offline.
