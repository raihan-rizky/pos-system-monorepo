# Hapus Daftar Belanja

Tanggal: 2026-11-04 (WIB)

Pengguna dengan izin `supplier.shopping_request.delete:delete` dapat memilih **Tindakan lainnya > Hapus daftar** pada daftar belanja. Dialog meminta alasan dan menampilkan jumlah stok yang akan dikurangi sebelum konfirmasi. Izin tersebut tersedia bagi Owner secara bawaan; Owner dapat memberikannya ke role lain melalui pengaturan hak akses.

## Dampak penghapusan

- Daftar dan pembelian terkait dibatalkan. Pilih filter **Dibatalkan** untuk melihat daftar, pelaku, waktu, alasan, status sebelum pembatalan, dan dokumen terkait.
- Stok dikurangi berdasarkan penerimaan yang sudah disetujui dan dapat ditelusuri. Penerimaan yang belum selesai dibatalkan. Pembalikan beserta sumbernya dicatat; penerimaan asal tetap ada di riwayat.
- Jika stok tidak cukup, konversi berubah, atau riwayat stok tidak dapat dipastikan, proses ditolak tanpa perubahan dan perlu pemeriksaan manual.
- Pengeluaran dan pembayaran tetap tercatat dalam laporan dan riwayat giro. Pengembalian uang dan perubahan kewajiban giro memerlukan proses terpisah. HPP dan harga jual master tidak diubah secara otomatis.
- Data lama yang menerapkan stok langsung dan tidak memiliki jejak yang dapat dipastikan memerlukan pemeriksaan manual sebelum pembatalan.

## Penerapan teknis

Migrasi `20261103180000_shopping_request_deletion` menambahkan status pembelian yang dibatalkan dan catatan audit penghapusan. Migrasi perlu diterapkan pada database tujuan melalui proses deployment yang berlaku sebelum fitur digunakan. Penghapusan memeriksa izin dan toko di server, lalu mengunci dan memproses pembatalan serta pembalikan stok dalam satu transaksi.
