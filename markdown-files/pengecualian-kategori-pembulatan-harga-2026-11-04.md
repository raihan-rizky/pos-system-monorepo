# Pengecualian kategori pada pembulatan harga

Tanggal: 2026-11-04 (WIB)

## Penggunaan

Di **Pengaturan > Pembulatan Harga**, cari dan centang satu atau beberapa kategori pada bagian **Kategori yang dikecualikan**, lalu pilih **Simpan pengaturan**. Kosongkan pilihan agar semua kategori mengikuti aturan toko. Pengguna dengan izin lihat dapat mencari dan memeriksa pilihan; perubahan memerlukan izin ubah pembulatan.

Produk dalam kategori yang dipilih melewati pembulatan untuk harga normal, Agen/Dinas, hasil rumus harga khusus, dan harga khusus untuk satu nota. Harga asal dan HPP tetap tersimpan. Kategori lain mengikuti kelipatan dan ambang yang aktif. Pratinjau contoh pada halaman pengaturan menggambarkan kategori yang tidak dikecualikan. Transaksi yang sudah final tidak dihitung ulang.

## Penyimpanan dan sinkronisasi

Pilihan disimpan sebagai relasi kategori pada `StoreSettings` dan dikirim bersama pengaturan pembulatan. API memeriksa apakah kategori masih ada dan mempertahankan pilihan saat klien lama menyimpan pengaturan tanpa menyertakan daftar kategori. Menghapus kategori juga menghapus relasi pengecualiannya. Endpoint daftar kategori untuk halaman ini menerima izin lihat atau ubah pembulatan.

Kasir menyertakan snapshot kebijakan dan kategori produk saat checkout atau menyimpan faktur sementara. Jika kebijakan atau kategori telah berubah, server meminta kasir memuat ulang harga. Sinkronisasi offline menghitung ulang dengan data produk yang berlaku dan menahan transaksi untuk persetujuan jika harga, kategori, atau snapshot kebijakan berubah. Harga semula disimpan untuk pemeriksaan. Harga khusus pelanggan yang diedit pada pembayaran membawa nilai mentah dan penanda tersendiri, termasuk nilai nol; aturan izin Harga Khusus tetap diperiksa secara terpisah dari izin mengubah harga nota. Saat menyetujui draft, harga manual yang masih diizinkan dihitung kembali dari nilai asal sebelum pembulatan. Editor pengaturan menunggu kebijakan terbaru dari server sebelum mengizinkan perubahan.

## Penerapan basis data

Jalankan migrasi Prisma `20261104010000_price_rounding_category_exceptions` pada basis data yang dituju sebelum menjalankan versi aplikasi ini. Migrasi membuat tabel relasi `_PriceRoundingExcludedCategories` dengan foreign key yang menghapus relasi saat kategori atau pengaturan dihapus. Migrasi tidak diterapkan otomatis oleh pengerjaan fitur ini.

## Pemeriksaan

Pengujian mencakup penyimpanan dan validasi pilihan, pembulatan untuk beragam harga, checkout, draf, persetujuan, sinkronisasi offline, izin, serta tampilan harga. Interaksi daftar diperiksa dengan pencarian, pilihan ganda, tombol keyboard, penyimpanan, dan tata letak desktop maupun ponsel menggunakan data contoh.
