# Mengubah produk pada transaksi

Di Riwayat, pengguna dengan izin mengubah transaksi dapat membuka **Ubah** untuk invoice reguler. Setiap baris produk menampilkan foto atau gambar kategori bawaan. Buka **Harga, diskon & satuan** untuk mengatur harga per satuan yang berlaku pada transaksi ini, diskon item dalam rupiah atau persen, dan satuan lain yang aktif dalam grup stok yang sama.

Harga awal satuan yang dipilih memakai harga jual produk dan aturan pembulatan toko. Harga tersebut dapat diganti tanpa mengubah harga master. Diskon dipotong sekali dari total baris (harga dikali jumlah). Diskon rupiah dibatasi sampai total baris; diskon persen mengikuti perubahan jumlah dan harga selama formulir masih terbuka. Nilai diskon rupiah akhirnya disimpan pada item.

Untuk transaksi menunggu persetujuan atau sementara, harga produk dihitung ulang saat persetujuan. Harga yang diubah di formulir ini dapat digantikan oleh harga hasil perhitungan tersebut; periksa harga dan total pada layar persetujuan sebelum melanjutkan.

Total produk dihitung ulang sebelum penyimpanan. Server memeriksa identitas baris dan hubungan grup stok saat satuan berubah, menghitung subtotal dan pajak, serta menyesuaikan stok dan mencatat koreksinya untuk transaksi yang sudah mengurangi stok. Transaksi pending atau draft belum mengurangi stok. Nama pada dokumen dan rincian item yang masih berlaku dipertahankan. Status dan saldo pembayaran mengikuti total baru; transaksi tanpa pelanggan terdaftar tidak dapat dinaikkan hingga menyisakan tagihan.

Baris pada Surat Jalan tidak dapat dihapus atau diubah jumlah dan satuannya, tetapi harga dan diskonnya tetap dapat disesuaikan. Jika riwayat stok lama tidak dapat dibuktikan atau stok dikelola oleh Surat Jalan, perubahan jumlah dan satuan ditolak sampai riwayat diperiksa.

Fitur ini menggunakan izin edit transaksi dan tidak menggantikan alur koreksi nota Percetakan yang sudah diproses. Setelah selesai, periksa total lalu pilih **Simpan**.
