# Produk

## Lokasi dan pencarian

Buka sidebar **Katalog > Produk** (`/products`). Halaman **Pusat Produk** menampilkan total produk, peringatan stok menipis, stok negatif, dan nilai inventaris. Produk dapat dicari berdasarkan nama, SKU, atau barcode serta difilter berdasarkan kategori, status stok, dan grup stok.

Tab yang tersedia adalah **Produk**, **Riwayat Harga**, **Harga Khusus**, dan **Aktivitas Grup**. Riwayat Harga dan Harga Khusus hanya tampil jika role memiliki permission yang diperlukan.

## Manajemen Produk & Harga
Seluruh operasi katalog produk dan penyesuaian harga dapat diakses dari menu ini sesuai izin peran Anda.
Langkah operasional detail dapat dilihat langsung di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md):
- **Menambah Produk Baru:** Langkah pengisian formulir produk dan varian dibahas di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q1-bagaimana-cara-menambahkan-produk-baru-ke-katalog-toko).
- **Mengubah Harga Jual:** Langkah merubah harga langsung di tabel atau mengedit HPP dibahas di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q2-bagaimana-cara-mengubah-harga-jual-produk-agar-tercatat-di-riwayat).
- **Mengatur Harga Grup (Harga Khusus):** Kebijakan diskon kategori per kelompok pelanggan dibahas di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q3-bagaimana-cara-mengatur-harga-khususdiskon-bagi-grup-pelanggan-agen-industri-dinas).
- **Import Massal Excel:** Prosedur unggah data produk & stok via file spreadsheet dibahas di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q4-bagaimana-cara-mengimpor-data-produk-atau-kuantitas-stok-secara-massal-lewat-excel).
- **Mengatur Grup Stok (Stock Group):** Penggabungan varian produk yang berbagi stok fisik dibahas di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q5-bagaimana-cara-mengatur-grup-stok-stock-group).

## Kemampuan Pak Teladan

Pak Teladan dapat mencari produk aktif berdasarkan nama, SKU, atau barcode serta membaca harga dan stok produk spesifik untuk role OWNER, ADMIN, INVENTORY, dan CASHIER. Daftar stok rendah tersedia bagi OWNER, ADMIN, dan INVENTORY. Pak Teladan tidak dapat membuat, mengubah, menghapus, mengimpor, atau menyesuaikan stok produk. Data produk harus berasal dari tool/backend.
