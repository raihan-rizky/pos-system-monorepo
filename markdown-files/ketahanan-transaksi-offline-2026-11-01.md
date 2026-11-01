# Ketahanan transaksi offline

Tanggal: 2026-11-01 (WIB)

## Yang tersedia

- POS menyimpan permintaan checkout di perangkat sebelum pengiriman dan memakai ID yang sama untuk percobaan online dan sinkronisasi ulang. Server memeriksa identitas kasir, toko, dan izin auto-approval.
- Antrean dapat melanjutkan transaksi setelah proses terhenti. Hanya transaksi yang sudah tersimpan di server yang ikut dibersihkan; transaksi gagal tetap dapat diperiksa dan dicoba lagi.
- Rincian pembayaran tunai, gabungan, DP, dan Tempo disertakan dalam sinkronisasi. Daftar antrean menampilkan nominal dan rincian pembayaran yang tersimpan.
- Shift lokal menyimpan kasir dan toko asal. Pembukaan, transaksi, dan penutupan dikirim berurutan. Penutupan menunggu transaksi yang memerlukan approval; transaksi yang terlambat setelah shift tertutup disimpan untuk pemeriksaan.
- Katalog lengkap dapat disiapkan saat online untuk kasir dan toko yang sama. Stok produk dengan beberapa satuan dihitung dari stok dasar bersama saat sinkronisasi.
- Katalog kasir yang belum disiapkan tidak diganti diam-diam dengan sebagian katalog lama. Jika harga item berubah saat rekonsiliasi, transaksi menunggu approval meskipun totalnya tidak berubah; halaman approval menampilkan harga yang dicatat saat offline.
- Offline Sync membatasi rincian dan pembersihan riwayat berdasarkan toko. Entri lama tanpa identitas toko tetap tersimpan dan tidak ditampilkan sebagai milik toko saat ini.
- Ringkasan pada banner hanya menghitung antrean milik kasir dan toko yang sedang masuk.
- Service worker hanya menyimpan aset publik yang dipilih secara khusus. Respons navigasi dan data React Server Component tidak masuk ke cache bersama.
- Halaman POS disimpan terenkripsi per kasir dan toko dengan PIN 6–12 angka. Saat offline halaman pembuka membaca PIN dan membuka salinan pada tab yang sama; persiapan berlaku tujuh hari. Persiapan memeriksa identitas sesi sebelum dan sesudah mengunduh aset, dan tidak mengganti salinan lama jika langkah tersebut gagal.
- Owner dapat memeriksa dan mengunduh JSON transaksi yang belum tersimpan di server, termasuk transaksi lama tanpa identitas serta transaksi dengan shift yang telah ditutup atau tidak ditemukan. Tidak ada identitas atau shift yang ditetapkan secara otomatis.
- Tanggal invoice pilihan Owner/Admin disertakan dalam antrean dan tetap melewati pemeriksaan server.

## Batasan saat ini

- PIN mengenkripsi salinan halaman POS, bukan katalog atau antrean transaksi IndexedDB. PIN dapat ditebak secara offline oleh pihak yang menguasai data perangkat; amankan perangkat dan gunakan PIN yang sulit ditebak.
- Katalog disiapkan untuk maksimum 5.000 produk. Pilihan pelanggan, aturan harga, dan pengaturan lain belum dijamin tersedia setelah koneksi terputus; Tempo memerlukan pelanggan yang sudah dapat dipilih. Pelanggan baru harus disimpan saat online.
- Transaksi layanan cetak yang tertunda memakai pengiriman ulang permintaan online setelah koneksi kembali; transaksi produk memakai rekonsiliasi offline.
- Data di perangkat masih bergantung pada penyimpanan browser. Jangan menghapus data situs sebelum antrean tersimpan di server.
- Ekspor membantu pemeriksaan manual; pencatatan hasil rekonsiliasi dan perubahan pada shift tertutup tidak dilakukan otomatis.
- Verifikasi menyeluruh dalam browser pada build produksi masih diperlukan, termasuk putus koneksi, menutup tab, beberapa akun, pembayaran, shift, dan pembaruan service worker. Fitur ini belum boleh dinyatakan siap produksi hanya berdasarkan uji unit.
- Pemeriksaan Chromium dengan server fixture telah memverifikasi antrean IndexedDB, penyiapan dan pembukaan halaman terenkripsi, kegagalan atau tipe konten aset yang salah, serta fallback navigasi.
- Pemeriksaan Chromium terisolasi pada halaman Next.js sebenarnya telah membuka POS dengan PIN saat offline, membuka shift lokal, mencari produk dari katalog contoh, dan menyimpan transaksi tunai beserta identitas kasir/toko dan nominal di IndexedDB. Pemeriksaan menggunakan mode development, API dan katalog contoh yang disimulasikan, sehingga belum membuktikan build produksi atau rekonsiliasi dengan database sebenarnya.

## Pemeriksaan kasir

1. Saat online, masuk sebagai kasir asal, buka **Kasir → Offline Sync**, buat dan ulangi PIN, lalu pilih **Siapkan POS offline**. Siapkan kembali setelah pembaruan aplikasi dan sedikitnya setiap tujuh hari.
2. Saat offline, buka alamat POS, pilih akun dan masukkan PIN. Periksa bahwa transaksi berhasil tersimpan di perangkat.
3. Setelah online, masuk dengan kasir asal dan periksa status serta alasan kegagalan di **Offline Sync**. Coba lagi jika tersedia dan selesaikan approval yang diperlukan.
