# Pengecualian kategori untuk pembulatan harga

Tanggal rancangan: 2026-11-04 (Asia/Jakarta). Status: disetujui oleh pengguna.

## Tujuan dan lingkup

Pengguna yang berwenang dapat memilih nol, satu, atau beberapa kategori produk yang sudah ada sebagai pengecualian pada Pengaturan > Pembulatan Harga. Produk dalam kategori yang dipilih memakai hasil perhitungan harga tanpa aturan pembulatan, termasuk harga reguler, agen, dinas, hasil rumus atau aturan harga khusus, dan harga khusus transaksi. Kategori lain tetap mengikuti pengaturan aktif, kelipatan, dan ambang yang sudah ada.

Pengecualian berlaku pada produk dan setiap satuan atau variannya berdasarkan kategori produk yang bersangkutan. Pengecualian tidak mengubah harga master, HPP, diskon, pajak, atau transaksi yang sudah selesai. Layanan yang bukan produk tetap mengikuti perilakunya saat ini. Bila tidak ada kategori yang dipilih, perilaku sama seperti sebelum fitur ini.

## Pilihan antarmuka

- **Daftar centang dengan pencarian, dipilih pengguna:** pilihan dan status centang dapat diperiksa sekaligus; daftar memerlukan ruang lebih banyak.
- **Dropdown dengan pencarian dan pilihan jamak:** lebih ringkas, tetapi pengguna perlu membuka daftar untuk memeriksa seluruh pilihan.

Di halaman pembulatan, tampilkan pencarian kategori dan daftar centang yang dapat digunakan dengan keyboard dan layar sentuh. Perlihatkan jumlah pilihan, keadaan daftar kosong, pemuatan, dan kegagalan memuat kategori. Simpan atau hapus beberapa pilihan bersama pengaturan lain dengan tombol yang sudah ada. Kegagalan memuat daftar tidak boleh diam-diam menghapus pilihan yang sudah tersimpan. Izin lihat dan ubah mengikuti izin pengaturan pembulatan yang ada.

## Aturan data dan perhitungan

- Simpan identitas kategori, bukan namanya, sebagai bagian dari kebijakan pembulatan. Validasi bahwa kategori yang disimpan memang ada; hindari duplikasi dan simpan perubahan secara atomik. Penghapusan atau penggabungan kategori harus meninggalkan pengaturan yang sah; produk yang berpindah mengikuti kategori barunya.
- Sediakan daftar kosong sebagai default untuk instalasi lama. Kompatibilitas data dan cache lama harus dijaga; permintaan versi lama yang tidak membawa daftar pengecualian tidak boleh tanpa sengaja menghapusnya.
- Terapkan pengecualian secara konsisten di pratinjau dan daftar harga produk, satuan, POS, keranjang, checkout, draft, persetujuan, serta sinkronisasi offline yang saat ini menggunakan aturan pembulatan. Server memakai kategori produk yang dipercaya dari data produk, bukan kategori yang dapat diklaim klien.
- Untuk kategori yang dikecualikan, harga akhir sebelum pembulatan diteruskan tanpa perubahan dan tidak ditandai sebagai hasil pembulatan. Saat pengguna mengubah kategori produk pada formulir, pratinjau mengikuti kategori yang dipilih; jika kategori belum tersedia, jangan tampilkan kepastian harga yang menyesatkan.
- Perubahan daftar pengecualian termasuk perubahan kebijakan harga. Pada transaksi yang masih dikerjakan atau direkam offline, ikuti mekanisme aplikasi yang sudah ada untuk kebijakan atau harga yang berubah, termasuk pemeriksaan ulang atau persetujuan apabila diperlukan. Jangan diam-diam menyelesaikan transaksi dengan total yang berbeda dari harga yang ditampilkan tanpa mengikuti penanganan konflik tersebut.

Pemilihan struktur penyimpanan dan komponen yang paling sesuai dengan kode yang sudah ada diserahkan kepada implementasi, dengan syarat konsistensi dan perilaku di atas terpenuhi.

## Verifikasi dan dokumentasi

- Gunakan TDD: uji gagal terlebih dahulu untuk kategori yang dipilih dan tidak dipilih, nol dan banyak pilihan, semua jenis harga, varian, serta kebijakan lama tanpa daftar pengecualian.
- Verifikasi penyimpanan, validasi kategori, izin, penghapusan atau pemindahan kategori, dan penanganan daftar kategori yang gagal dimuat. Periksa konsistensi harga antara klien dan server, termasuk draft, checkout, persetujuan, dan replay offline ketika kebijakan berubah.
- Verifikasi interaksi pencarian dan centang dengan keyboard dan layar kecil. Jalankan pemeriksaan terkait yang diwajibkan repo tanpa `pnpm build` dan tanpa memulai atau menghentikan server pengembangan.
- Perbarui halaman Bantuan, katalog workflow AI Assistant yang relevan, dokumentasi fitur, dan Catatan Perubahan sesuai perilaku yang benar-benar diterapkan serta tanggal rilis WIB yang sebenarnya.

## Kondisi workspace

Workspace memuat perubahan lokal yang sudah ada dan harus dipertahankan. Drive D: yang disebut pada instruksi repo tidak tersedia; pengguna menyetujui penggunaan folder `C:/Projects/pos-system-monorepo/markdown-files` sebagai lokasi dokumentasi. Indeks GitNexus terdeteksi kedaluwarsa dan analisis awal pada fungsi pembulatan melaporkan risiko CRITICAL, sehingga pemanggil aktual perlu diperiksa sebelum perubahan.
