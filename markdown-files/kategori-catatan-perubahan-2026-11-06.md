# Kategori Catatan Perubahan — 6 November 2026

## Tujuan

Popup Apa yang baru dan halaman Catatan Perubahan membantu pengguna mengenali ukuran serta jenis pembaruan sebelum membuka rinciannya. Pembaruan besar mendapat penekanan visual, sementara setiap label juga dapat dibaca tanpa mengandalkan warna.

## Data dan tampilan

- `kind` menjelaskan jenis perubahan: `feature` untuk fitur baru, `improvement` untuk peningkatan, dan `fix` untuk perbaikan bug.
- `impact` menjelaskan ukuran dampak secara terpisah: `major` untuk pembaruan besar dan `minor` untuk pembaruan kecil. Catatan lama tanpa `impact` ditampilkan sebagai pembaruan kecil; tetapkan `major` secara sengaja untuk perubahan yang memperkenalkan kemampuan atau alur yang luas.
- Perbaikan bug dapat berdampak besar maupun kecil. Jangan menyimpulkan ukuran semata-mata dari `kind`.
- Kedua tampilan menggunakan label yang sama. Popup mempertahankan urutan tanggal, menampilkan tautan fitur hanya ketika pengguna memiliki akses, dan tetap menyediakan tautan ke arsip lengkap.
- Catatan rilis menggunakan tangkapan layar popup yang dipotong dan dibuat dari pratinjau lokal tanpa data pelanggan.
- Catatan baru harus memakai tanggal rilis WIB yang sebenarnya, `id` stabil, revisi, ringkasan singkat, dan tepat tiga langkah penggunaan. Naikkan revisi hanya ketika pengumuman perlu ditampilkan lagi.

## Alur pengguna

1. Buka popup Apa yang baru atau pilih **Sorotan 7 hari** pada halaman Catatan Perubahan.
2. Baca label ukuran dan jenis untuk menemukan pembaruan yang relevan.
3. Pilih baris yang tersedia atau **Lihat semua catatan** untuk melihat informasi selengkapnya.

Pemilihan rentang tanggal, status sudah dilihat, izin akses, gambar, dan langkah pada arsip mengikuti mekanisme yang sudah ada.
