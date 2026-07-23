# Approval Daftar Belanja Tanpa Perubahan Stok

Tanggal: 23 Juli 2026

## Ringkasan

Daftar Belanja pada halaman Supplier sekarang hanya dipakai untuk mencatat kebutuhan, keputusan approval, dan estimasi pengeluaran. Pembuatan, edit, approval per item, maupun approval massal tidak mengubah stok produk atau grup stok serta tidak membuat Pengeluaran.

Ibaratnya, approval Daftar Belanja adalah persetujuan budget: dokumennya disetujui, tetapi transaksi pembelian aktual dan barang masuk belum terjadi.

## Perubahan Perilaku

- Pilihan **Stok Bersama** dan **Stok Produk Ini** dihapus dari modal buat, edit, dan approval.
- Live preview perubahan stok dihapus karena approval tidak memiliki dampak stok.
- Modal approval menampilkan **Estimasi pengeluaran** berdasarkan `Jumlah yang Di-ACC × harga modal`.
- Produk tanpa harga modal tetap dihitung Rp0 dan ditampilkan dalam peringatan.
- Approval tetap menyimpan keputusan item, approver, waktu keputusan, dan snapshot harga modal.
- Setelah semua item selesai, Daftar Belanja dapat dipilih di tab **Pembelian Barang**. Pengeluaran baru dibuat ketika seluruh produk Pembelian Barang disetujui.
- Approval tidak lagi:
  - menambah `Product.stock`;
  - menambah `ProductStockGroup.baseStock`;
  - membuat `InventoryLog` bertipe restock;
  - mengisi `stockAppliedAt`.

## Alur Pengguna

1. Pilih supplier dan produk, lalu isi jumlah kebutuhan.
2. Simpan Daftar Belanja. Stok tidak berubah.
3. Isi `Jumlah yang Di-ACC`.
4. Periksa Estimasi pengeluaran.
5. Setujui item satu per satu atau sekaligus.
6. Setelah semua item diproses, lanjutkan ke tab **Pembelian Barang** untuk mencatat harga dan pembelian aktual.
7. Pengeluaran dibuat saat Pembelian Barang disetujui penuh. Stok tetap tidak berubah.
8. Catat barang yang benar-benar masuk melalui proses inventaris atau penerimaan barang yang terpisah.

## Kompatibilitas

Kolom database `stockMode` dan `stockAppliedAt` tetap dipertahankan agar data lama dan skema produksi tetap kompatibel. Request API lama yang masih mengirim `stockMode` tetap diterima, tetapi nilai tersebut tidak dipakai untuk mengubah stok.

## Verifikasi

- Regression test memastikan approval quantity positif tidak memanggil update stok produk atau grup stok.
- Regression test memastikan approval tidak membuat inventory log restock.
- UI test memastikan modal buat, edit, dan approval tidak lagi memuat stock mode atau live stock preview.
- UI test memastikan Estimasi pengeluaran tetap tampil.
- Cache test memastikan approval hanya me-refresh data operasional/keuangan yang relevan, bukan cache stok.
