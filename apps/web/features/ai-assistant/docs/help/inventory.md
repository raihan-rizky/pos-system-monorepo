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

- **Ringkasan**: tugas urgent, status operasional (sesi harian), ringkasan stok, dan antrean/riwayat Surat Jalan.
- **Tugas**: Tugas Harian dan Tugas Mingguan. **Catatan:** Anda wajib melakukan **Check In** terlebih dahulu pada panel sesi harian agar tab Tugas tidak terkunci/buram.
- **Transaksi**: Penerimaan Barang, Pemakaian Internal, Surat Jalan, serta Bulk & Grup Stok.
- **Riwayat**: Log Stok, Rekap Stok, Laporan Barang Rusak, Riwayat Tugas Harian (yang berisi sub-tab **Check In** dan **Check Out**), dan Riwayat Tugas Mingguan.

Pada layar HP, sub-tab **Riwayat** dapat digeser horizontal agar semua pilihan tetap bisa dijangkau. **Log Stok** ditampilkan sebagai kartu ringkas di mobile, sedangkan tabel lengkap tetap dipakai di layar tablet/desktop.

Menu **Input / Transaksi** menyediakan **Cocokkan Stok (Harian)**, **Proof Kebersihan (Mingguan)**, **Laporkan Barang Rusak**, **Penerimaan Barang**, dan **Stock Out Internal**.

### Alur Sesi Harian (Check In & Check Out)
Staf gudang mengelola operasional harian melalui sesi:
1. **Check In (Morning Check):** Dilakukan di awal hari kerja sebelum mengakses tab Tugas. Terdiri dari peninjauan risiko stok, perhitungan bahan produksi utama, dan checklist pemeriksaan area kerja & keselamatan (Workspace & Safety).
2. **Check Out:** Dilakukan di akhir hari kerja untuk menutup sesi operasional gudang. Check Out merekam ringkasan hari tersebut ke dalam snapshot database dan hanya bisa diselesaikan jika seluruh tugas harian telah rampung.
3. **Weekly Proof:** Bukti mingguan (seperti foto kebersihan) bersifat opsional di hari biasa, namun wajib diselesaikan untuk Check Out pada hari Sabtu (zona waktu Asia/Jakarta).

### Workflow Approval & Pembatalan
Perubahan stok yang diajukan melalui workflow approval tidak boleh dianggap final saat masih pending. Contohnya, draft penerimaan harus disubmit dan baru menambah stok setelah disetujui. Persetujuan inventory memakai permission `inventory.approve`; permission ini dikunci untuk OWNER. Pengaju dapat membatalkan permintaan yang masih memenuhi syarat, sedangkan alasan wajib diisi saat menolak.

### Marking Surat Jalan (Delivery Order)
Surat Jalan tidak lagi memakai istilah verifikasi, melainkan alur **Marking**:
- Setiap Surat Jalan di antrean harus ditandai statusnya menjadi salah satu dari: **Selesai (COMPLETED)**, **Belum Dikirim (NOT_DELIVERED)**, **Perlu Tanda Tangan (NEEDS_SIGNATURE)**, **Perlu Follow Up (NEEDS_FOLLOW_UP)**, **Ditunda (POSTPONED)**, atau **Tidak Relevan (NOT_RELEVANT)**.
- Status pengecualian selain *Selesai* mewajibkan staf gudang menginput catatan/alasan pengecualian di modal marking.
- **Bloker Check-Out:** Sesi Check Out harian akan terblokir jika masih ada Surat Jalan berstatus **UNMARKED** (belum ditandai). Semua Surat Jalan harus diselesaikan atau memiliki catatan pengecualian.

## Panduan Aksi Inventaris
Prosedur operasional berikut dapat dibaca selengkapnya di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md):
- **Melaporkan Barang Rusak:** Lihat cara input dan penyerahan barang rusak di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q14-bagaimana-cara-melaporkan-barang-yang-rusak-hilang-atau-menyusut-di-gudang).
- **Menyelesaikan Tugas Mingguan:** Lihat cara unggah berkas kebersihan mingguan di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q15-bagaimana-cara-menyelesaikan-tugas-operasional-mingguan-seperti-proof-kebersihan).
- **Mengajukan Penerimaan Barang:** Lihat cara mencatat inbound stock baru dari supplier di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q16-bagaimana-cara-mengajukan-penerimaan-barang-inbound-receipt-dari-supplier).
- **Melakukan Check In & Check Out:** Lihat alur lengkap day session di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q27-bagaimana-cara-melakukan-check-in-dan-check-out-day-session-bagi-staf-gudang).
- **Marking Surat Jalan:** Lihat cara menandai status Surat Jalan di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q28-bagaimana-cara-melakukan-marking-pada-surat-jalan-delivery-order).

## Kemampuan Pak Teladan

Pak Teladan dapat mengambil daftar produk aktif dengan stok kurang dari atau sama dengan minimum stok untuk role OWNER, ADMIN, dan INVENTORY. Tool ini tidak membaca tugas, log stok, penerimaan, laporan rusak, atau status approval, dan tidak dapat membuat atau menyetujui transaksi inventaris. Semua angka stok harus berasal dari tool/backend.
