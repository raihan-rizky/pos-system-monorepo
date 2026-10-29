# Harga per satuan pada Penerimaan Barang

Tanggal: 2026-10-29 (WIB)

## Alur

1. Buka Penerimaan Barang dan pilih Pembelian Barang yang telah disetujui.
2. Untuk setiap barang, pilih kesesuaian dan isi jumlah diterima. Jika jumlah berbeda dari sisa pesanan, isi catatan.
3. Untuk barang **Sesuai**, pilih satuan dan isi **HPP Unit**, **Harga Jual**, **Harga Jual Agen**, dan **Harga Jual Dinas**. Pada barang **Tidak Sesuai**, satuan dan harga boleh dikosongkan.
4. Ajukan ke Owner. Petugas yang berwenang dapat meninjau atau mengubah satuan dan harga sebelum menyetujui setiap barang.
5. Ketika seluruh barang disetujui, stok dan harga produk untuk satuan pada barang Sesuai diperbarui dalam transaksi yang sama. Barang Tidak Sesuai tidak mengubah harga produk.

## Satuan dan riwayat

- Jumlah penerimaan tetap memakai satuan Pembelian Barang. HPP pada Log Stok dikonversi dari satuan harga yang dipilih ke satuan Pembelian Barang.
- Untuk satuan pengikut dengan HPP otomatis, sistem menyesuaikan HPP acuan dan menghitung ulang satuan lain sesuai aturan grup. Jika HPP yang dimasukkan tidak dapat diwakili tepat setelah pembulatan acuan, penerimaan tidak difinalisasi sampai nilainya diperbaiki.
- Satuan harga yang sama hanya dapat dipilih sekali untuk barang Sesuai pada satu dokumen. Nilai HPP dari beberapa satuan otomatis dalam satu grup harus menghasilkan HPP acuan yang sama.
- Harga dan satuan disimpan sebagai snapshot untuk pemeriksaan. Perubahan harga produk dicatat di riwayat harga bersama nama petugas persetujuan.
- Dokumen lama tanpa snapshot harga tetap diproses memakai perilaku sebelumnya dan tidak mengubah harga produk melalui alur baru.

## Penerapan basis data

Migrasi `20261029130000_inbound_receipt_pricing` menambahkan kolom snapshot harga. Terapkan migrasi pada lingkungan yang dituju sebelum menggunakan formulir baru.
