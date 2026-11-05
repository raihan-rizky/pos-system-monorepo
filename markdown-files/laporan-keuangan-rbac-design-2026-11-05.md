# Rancangan akses pemasukan harian

Disetujui pengguna pada 2026-11-05 (WIB), termasuk lokasi dokumentasi di repository C: karena drive D: tidak tersedia.

## Tujuan dan batas akses

Sales memilih satu tanggal WIB, hari ini atau sebelumnya, dan membaca penerimaan seluruh toko sesuai izin. Empat izin resource/read yang independen: `financial-report.daily-income`, `financial-report.daily-category`, `financial-report.daily-subcategory`, `financial-report.daily-payment-method`. Izin halaman `/financial-report` tetap diperlukan. Izin `financial-report.read` mengatur laporan lengkap; Owner selalu memiliki akses.

Migrasi mengaktifkan halaman dan empat izin baru SALES serta menonaktifkan izin laporan lengkap SALES. Role lain mempertahankan akses sebelumnya. Owner dapat mengubah izin sesudah migrasi. Bagian yang ditolak tidak dikirim API; izin rincian dapat bekerja tanpa izin total, meskipun jumlah dapat disimpulkan dengan menjumlah rincian.

## Perhitungan dan kategori

Pemasukan merupakan uang diterima pada tanggal pembayaran, termasuk DP, pelunasan nota lama dan pemasukan manual. Gunakan aturan neto kembalian/refund yang sudah digunakan laporan saat ini; koreksi terbaru dapat mengubah nilai tanggal lama. Ini bukan rekonstruksi ledger historis yang tidak berubah. Hindari duplikasi pembayaran dan keluarkan draft, void, batal, dan tagihan TEMPO yang belum dibayar.

Kategori utama hanya ATK dan Percetakan. Ikuti penanda kategori transaksi, hubungan nota percetakan, dan baris jasa percetakan yang sudah digunakan aplikasi. Subkategori ATK memakai kategori produk; Percetakan memakai jenis layanan SPANDUK/CETAK/PLAT/STEMPEL/PRINT. Data tanpa rincian memakai Belum ditentukan. Penerimaan dialokasikan proporsional menurut subtotal dengan pembulatan deterministik agar semua rincian berjumlah sama dengan total.

Pemasukan manual ATK berada pada ATK/Pemasukan manual, kategori manual lain pada Percetakan/jenisnya. Metode pembayaran manual belum tersimpan sehingga ditampilkan sebagai Belum dicatat. Tidak mengarang metode CASH.

## API dan tampilan

Endpoint harian terpisah memvalidasi pengguna, toko, halaman, tanggal tunggal dan empat izin. Hanya agregat yang diizinkan masuk respons, dengan Cache-Control private/no-store. Tidak memilih biaya produk, laba, pengeluaran, pelanggan atau informasi shift. Tampilan terbatas tidak meminta laporan lengkap, jurnal atau ekspor bulanan. Cache dipisahkan menurut toko, pengguna, fingerprint otorisasi dan tanggal.

Laporan lengkap mempertahankan metrik omzet yang berbeda dari uang diterima. Top Kategori berubah menjadi ATK/Percetakan dan Top Subkategori ditambahkan. Tidak merombak perhitungan laba, ekspor, atau lifecycle server.

## Pendekatan

Dipilih: empat izin terpisah, agar Owner dapat mengatur setiap bagian. Alternatif satu izin paket lebih sederhana tetapi tidak dapat membatasi tiap rincian.

## Verifikasi dan dokumentasi

TDD dengan bukti RED lalu GREEN untuk default/penolakan izin, pembatasan API, tanggal WIB, DP/pelunasan/multipayment, manual, klasifikasi lama, pembulatan dan tampilan. Jalankan tes, lint dan type-check tanpa pnpm build atau mengelola dev server. Perbarui Bantuan, workflow AI dan changelog tanggal WIB aktual. Jangan menimpa perubahan lain dalam workspace.
