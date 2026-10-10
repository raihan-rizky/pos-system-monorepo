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

Pak Teladan dapat mencari produk aktif berdasarkan nama, SKU, atau barcode serta membaca harga dan stok produk spesifik untuk role OWNER, ADMIN, INVENTORY, dan CASHIER. Daftar stok rendah tersedia bagi OWNER, ADMIN, dan INVENTORY. Pak Teladan dapat membuka modal **Tambah Produk** jika role memiliki izin, tetapi tidak mengisi atau menyimpan form. Pak Teladan tidak membuat, mengubah, menghapus, atau mengimpor data secara otomatis. Data produk harus berasal dari tool/backend.

## Harga Khusus dan pratinjau pelanggan

Owner membuka tab **Harga Khusus**, lalu memilih **Tambah aturan**. Formulir memuat kategori, pilihan satuan, tipe pelanggan, dan cara menghitung harga. Satu aturan dapat berlaku untuk beberapa tipe sekaligus, misalnya **Umum dan Agen**; **Semua pelanggan** dipilih sendiri. Pilihan satuan mengikuti kategori. Rumus modal memerlukan satuan tertentu; diskon dapat memakai Semua satuan. Aturan untuk Rim hanya berlaku saat satuan Rim dipilih.

Empat cara menghitung harga tersedia: **Diskon rupiah**, **Diskon persen**, **Modal + rupiah**, dan **Modal + persen**. Periksa contoh harga sebelum **Simpan aturan**. Pengaturan merek, tambah merek, dan status aktif tersedia di **Pengaturan tambahan**.

**Nonaktifkan** menghentikan penerapan aturan. Aturan tetap tersimpan dan bisa diaktifkan kembali melalui **Ubah → Pengaturan tambahan → Aturan aktif**.

Rumus modal menggunakan nilai modal satuan terkecil dari grup produk yang sama di toko yang sama, tanpa perkalian isi kemasan. Contoh: modal **Rp700/pcs + Rp4.000** untuk **Rim** menghasilkan **Rp4.700/rim**. Tambahan **10%** menghasilkan **Rp770/rim**. Rumus mengikuti modal satuan terkecil terbaru. Jika sumber modal tidak tersedia atau tidak valid, harga Agen/Dinas yang sesuai atau harga normal tetap digunakan.

Di tab **Produk**, pilih **Harga untuk: Umum/Agen/Industri/Pemerintah**; pilihan awalnya **Umum**. Harga hasil aturan ditandai **hijau** dan badge **Harga Khusus**. Harga Agen/Dinas biasa dan harga manual transaksi tidak memakai badge aturan otomatis. Aturan berlaku dinamis di Produk dan POS, tanpa mengubah modal akuntansi atau transaksi lama.
