# Perbaikan akses POS offline — 7 November 2026

POS yang sudah disiapkan dapat dibuka dengan PIN dan menyimpan transaksi produk di antrean saat koneksi terputus. Setelah pembaruan ini, setiap kasir perlu menyiapkan ulang PIN offline pada setiap perangkat ketika masih online; salinan offline versi sebelumnya tidak dapat digunakan kembali.

Persiapan memeriksa identitas, peran, izin POS, dan aset yang dibutuhkan. Salinan halaman dienkripsi dengan PIN, sedangkan katalog dan antrean transaksi belum dienkripsi. Akses offline berlaku paling lama tujuh hari dan dibatasi pada POS serta tindakan yang diizinkan. Layanan cetak, harga khusus, nota penawaran, dan draft menunggu koneksi kembali.

Saat koneksi kembali, aplikasi memeriksa izin lagi sebelum membuka akses. Pencabutan izin atau logout mencabut salinan offline tanpa menghapus antrean transaksi. Setelah terhubung, kasir asal memeriksa hasil pengiriman di Kasir > Offline Sync; server tetap memeriksa izin dan data transaksi sebelum menyimpannya.

Pemeriksaan mencakup pembukaan POS melalui PIN, pembukaan shift, pembayaran produk yang diantrikan, pemulihan koneksi, penolakan izin, pencabutan lintas tab, serta kegagalan penyimpanan penanda pencabutan.
