# Inventaris

## Lokasi dan status stok

Buka sidebar **Manajemen Inventaris > Inventaris** (`/inventory`). Gunakan halaman **Produk** (`/products`) untuk katalog dan nilai stok per produk.

Status stok yang dipakai sistem:

- **Stok Negatif**: stok kurang dari 0.
- **Stok Habis**: stok sama dengan 0.
- **Stok Menipis**: stok lebih dari 0 dan kurang dari atau sama dengan **Peringatan Stok Minimum**.
- **Aman**: stok lebih besar dari minimum stok.

## Workspace Inventaris

Tab utama di halaman Inventaris adalah:

- **Ringkasan**: tugas urgent, status operasional, ringkasan stok, dan riwayat Surat Jalan.
- **Tugas**: Tugas Harian dan Tugas Mingguan, termasuk Matching Stok Harian, Laporan Barang Rusak, verifikasi log OUT, dan Proof Kebersihan Gudang.
- **Transaksi**: Penerimaan Barang, Pemakaian Internal, Surat Jalan, serta Bulk & Grup Stok.
- **Riwayat**: Log Stok, Rekap Stok, Laporan Barang Rusak, Riwayat Tugas Harian, dan Riwayat Tugas Mingguan.

Menu **Input / Transaksi** menyediakan **Cocokkan Stok (Harian)**, **Proof Kebersihan (Mingguan)**, **Laporkan Barang Rusak**, **Penerimaan Barang**, dan **Stock Out Internal**.

Perubahan stok yang diajukan melalui workflow approval tidak boleh dianggap final saat masih pending. Contohnya, draft penerimaan harus disubmit dan baru menambah stok setelah disetujui. Persetujuan inventory memakai permission `inventory.approve`; permission ini dikunci untuk OWNER. Pengaju dapat membatalkan permintaan yang masih memenuhi syarat, sedangkan alasan wajib diisi saat menolak.

## Panduan Aksi Inventaris
Prosedur operasional berikut dapat dibaca selengkapnya di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md):
- **Melaporkan Barang Rusak:** Lihat cara input dan penyerahan barang rusak di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q14-bagaimana-cara-melaporkan-barang-yang-rusak-hilang-atau-menyusut-di-gudang).
- **Menyelesaikan Tugas Mingguan:** Lihat cara unggah berkas kebersihan mingguan di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q15-bagaimana-cara-menyelesaikan-tugas-operasional-mingguan-seperti-proof-kebersihan).
- **Mengajukan Penerimaan Barang:** Lihat cara mencatat inbound stock baru dari supplier di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q16-bagaimana-cara-mengajukan-penerimaan-barang-inbound-receipt-dari-supplier).

## Kemampuan Pak Teladan

Pak Teladan dapat mengambil daftar produk aktif dengan stok kurang dari atau sama dengan minimum stok untuk role OWNER, ADMIN, dan INVENTORY. Tool ini tidak membaca tugas, log stok, penerimaan, laporan rusak, atau status approval, dan tidak dapat membuat atau menyetujui transaksi inventaris. Semua angka stok harus berasal dari tool/backend.
