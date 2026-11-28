# Edit dan pembatalan Pemakaian Internal

Buka **Inventaris → Riwayat → Log Stok**. Tindakan berlaku untuk setiap barang yang dicatat lewat Stock Out Internal.

1. Saat permintaan **Menunggu persetujuan**, pemohon dapat memilih **Edit** untuk mengganti produk, jumlah, atau alasan. **Batalkan** menarik permintaan dari antrean. Stok baru berubah setelah persetujuan.
2. Untuk entri **Disetujui**, Owner dapat memilih **Koreksi** atau **Batalkan** dan mengisi alasan. Aksi tersedia selama pencocokan stok belum dikirim dan hari stok belum check-out. Permintaan koreksi yang sedang menunggu keputusan perlu diselesaikan terlebih dahulu.
3. Periksa status **Dikoreksi** atau **Dibatalkan** di Log Stok. **Input awal** menampilkan produk, jumlah, dan alasan awal. Rekap Pemakaian Internal dan PDF menghitung pemakaian yang masih berlaku.

Koreksi mencatat selisih stok. Jika pemakaian 10 rim dikoreksi menjadi 7 rim, stok bertambah 3 rim. Membatalkan hasil koreksi mengembalikan 7 rim sisanya. Bila produk diganti, stok produk sebelumnya dikembalikan dan stok produk pengganti dikurangi.

### Izin dan pencatatan

- **Edit permintaan sendiri** menggunakan `resource / inventory.internal_use / update` bersama izin mengubah data gudang. Owner, Admin, dan Inventaris mendapat izin bawaan. Pengaturan toko yang sudah ada mengikuti izin inventaris sampai izin baru disimpan secara khusus.
- Owner menggunakan izin persetujuan stok untuk tindakan pada entri yang sudah disetujui. Jurnal mencatat alasan, pelaku, serta penyesuaian stok dan mempertahankan log sumber.
- Perubahan produk, jumlah, dan alasan yang masih menunggu persetujuan diperiksa kembali saat persetujuan diterima. Koreksi atas entri yang sudah disetujui juga memeriksa hasil koreksi terakhir agar pembatalan berulang tidak mengembalikan stok dua kali.
