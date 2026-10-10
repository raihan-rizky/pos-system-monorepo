# POS / Kasir

## Alur Transaksi Kasir (POS)
Proses melayani penjualan langsung dapat dilakukan dengan cepat menggunakan layar kasir. Langkah detail dari memilih produk, memasukkan ke keranjang, memproses metode pembayaran, hingga mencetak struk dibahas lengkap di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q6-bagaimana-alur-memproses-transaksi-penjualan-langsung-di-kasir-pos).

## Draft dan stok kosong

- Tombol **Faktur Sementara** menyimpan draft dari modal Pembayaran. Draft ini hanya tersedia untuk keranjang produk, bukan keranjang yang berisi layanan cetak.
- Keranjang yang berisi produk dengan stok 0 atau kurang otomatis memakai mode **Create Nota Penawaran**, bukan pembayaran langsung.
- Transaksi layanan cetak memerlukan koneksi agar pemakaian bahan dapat dicatat ke stok.

## Harga otomatis dan tanda Harga Khusus

Harga di kartu produk, pilihan satuan, keranjang, dan pembayaran mengikuti pelanggan serta satuan yang dipilih. Urutannya adalah **Harga Khusus yang dapat diterapkan → Harga Agen/Dinas yang sesuai → harga normal**. Kasir tidak memilih prioritas harga saat pembayaran.

Harga yang benar-benar berasal dari aturan ditandai **hijau** dan badge **Harga Khusus**, termasuk bila nominalnya sama dengan harga normal. Pada daftar pilihan satuan, keterangan Harga Khusus menandai satuan yang memakai aturan. Harga Agen/Dinas biasa tidak diberi badge ini.

Aturan **Modal + rupiah** atau **Modal + persen** memakai modal satuan terkecil terbaru secara langsung. Modal **Rp700/pcs + Rp4.000** untuk satuan **Rim** menghasilkan **Rp4.700/rim**, sehingga dua rim berjumlah **Rp9.400**; tambahan **10%** menghasilkan **Rp770/rim**. Modal tidak dikalikan isi rim. Aturan hanya berlaku untuk satuan dan tipe pelanggan yang ditentukan Owner. Jika sumber modal belum tersedia atau tidak valid, sistem memakai harga member atau normal.

Harga manual untuk transaksi tetap berlaku sampai override dihapus. Penandanya adalah **Hanya berlaku untuk transaksi ini**, tanpa badge aturan otomatis. Rumus harga tidak mengubah modal akuntansi atau harga transaksi yang sudah disimpan.

## Edit Cepat di keranjang

- Pengguna dengan permission **edit produk** dapat mengaktifkan ikon **Edit Cepat** pada header keranjang.
- Setiap produk menampilkan referensi **Harga Normal**, **Harga Agen**, dan **Harga Dinas**.
- Ikon produk membuka modal untuk mengubah Nama, Kategori, dan Merek seluruh varian dalam grup.
- Ikon harga membuka modal **Ubah Harga Produk**. Harga Normal/Agen/Dinas mengubah master varian terpilih, sedangkan **Harga Khusus** diberi keterangan **Hanya berlaku untuk transaksi ini**.
- Harga Khusus transaksi menang atas harga otomatis sampai override dihapus.

Tombol dan tindakan dapat berbeda menurut permission RBAC. Pak Teladan hanya dapat menjelaskan alur; ia tidak dapat menambah item ke keranjang, membuka shift, menyimpan draft, atau menyelesaikan transaksi.
