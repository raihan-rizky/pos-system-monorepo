# POS / Kasir

## Alur Transaksi Kasir (POS)
Proses melayani penjualan langsung dapat dilakukan dengan cepat menggunakan layar kasir. Langkah detail dari memilih produk, memasukkan ke keranjang, memproses metode pembayaran, hingga mencetak struk dibahas lengkap di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q6-bagaimana-alur-memproses-transaksi-penjualan-langsung-di-kasir-pos).

## Draft dan stok kosong

- Tombol **Faktur Sementara** menyimpan draft dari modal Pembayaran. Draft ini hanya tersedia untuk keranjang produk, bukan keranjang yang berisi layanan cetak.
- Keranjang yang berisi produk dengan stok 0 atau kurang otomatis memakai mode **Create Nota Penawaran**, bukan pembayaran langsung.
- Transaksi layanan cetak memerlukan koneksi agar pemakaian bahan dapat dicatat ke stok.

Tombol dan tindakan dapat berbeda menurut permission RBAC. Pak Teladan hanya dapat menjelaskan alur; ia tidak dapat menambah item ke keranjang, membuka shift, menyimpan draft, atau menyelesaikan transaksi.
