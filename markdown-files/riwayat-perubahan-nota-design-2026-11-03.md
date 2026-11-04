# Rancangan riwayat perubahan nota oleh Sales

Tanggal: 2026-11-03 (WIB)

## Tujuan

Owner dapat mengetahui saat akun Sales mengubah nota transaksi yang sudah diproses, melihat nota sebelum perubahan pertama, dan membandingkan setiap perubahan yang berhasil disimpan.

## Cakupan yang disepakati

- Catat perubahan oleh akun dengan peran `SALES` pada transaksi berstatus `COMPLETED` atau `DP` sebelum perubahan disimpan. Nota sementara dan transaksi yang masih menunggu persetujuan tidak memicu pemberitahuan ini.
- Simpan setiap versi perubahan yang benar-benar berbeda. Perubahan pada penyimpanan terpisah menghasilkan riwayat terpisah, termasuk bila sebagian penyimpanan berhasil dan bagian lain gagal.
- Cakup perubahan item, rincian transaksi, dan pajak pada nota biasa, serta editor nota Percetakan yang sudah diproses apabila Sales diberi izin untuk memakainya.
- Cakup pembayaran piutang dari nota maupun profil pelanggan; alokasi satu pembayaran ke beberapa nota menghasilkan riwayat untuk masing-masing nota yang berubah.
- Simpan versi sebelum perubahan pertama sebagai nota asli, dan simpan versi sebelum dan sesudah setiap perubahan berikutnya. Riwayat dimulai saat fitur diterapkan; versi lama yang belum pernah dicatat tidak dapat direkonstruksi.
- Nota asli berarti rincian transaksi yang tersimpan untuk dibandingkan, bukan reproduksi cetak dengan tata letak dan identitas toko pada saat penerbitan.

## Pendekatan

Menyimpan hanya nota asli dan versi terbaru lebih sederhana, tetapi menghilangkan perubahan antara keduanya. Pendekatan yang dipilih adalah menyimpan setiap versi karena Owner ingin memeriksa setiap perubahan.

Gunakan penyimpanan riwayat khusus yang mencatat toko, transaksi, identitas dan nama pelaku, waktu, serta snapshot sebelum dan sesudah. Simpan riwayat dan pemberitahuan inbox untuk Owner dalam transaksi database yang sama dengan perubahan nota. Pertahankan urutan penguncian data dan pemeriksaan konflik yang sudah ada. Perubahan tanpa perbedaan isi tidak membuat catatan atau pemberitahuan.

Pemberitahuan membuka halaman perbandingan khusus Owner. Halaman memperlihatkan nota asli, versi sebelum dan sesudah perubahan yang dipilih, informasi pelaku dan waktu, serta rincian yang berubah. Riwayat juga dapat diakses kembali dari transaksi terkait. Hak akses dan toko diperiksa di server; isi snapshot tidak tersedia untuk pengguna lain.

## Batasan dan keputusan pelaksanaan

- Gunakan inbox notifikasi aplikasi yang sudah ada; pengiriman push browser tambahan mengikuti kemampuan sistem yang tersedia.
- Pertahankan perilaku stok, piutang, pembayaran, dan hak akses yang sudah berlaku. Perubahan yang gagal tidak boleh meninggalkan riwayat atau notifikasi seolah berhasil.
- Snapshot mencakup informasi yang relevan pada nota, termasuk item, harga, diskon, pajak, total, pelanggan, metode pembayaran, dan dokumen Percetakan bila ada.
- Tampilan menggunakan bahasa Indonesia dan dapat dibaca pada layar kecil maupun dengan keyboard.
- Dokumentasi operasional, Bantuan, katalog alur AI, dan Catatan Perubahan diperbarui sesuai perilaku akhir.
- Lokasi dokumentasi yang ditentukan di drive `D:` tidak tersedia pada lingkungan ini; dokumen sementara disimpan di folder `markdown-files` pada checkout aktif di drive `C:`.
