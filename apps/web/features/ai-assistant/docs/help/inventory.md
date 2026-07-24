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

### Verifikasi Log OUT
Verifikasi Log OUT adalah pengecekan kebenaran catatan barang keluar, bukan matching stok fisik. Buka **Tugas > Tugas Harian > Log OUT Belum Diverifikasi** setelah Check In.

- Klik **Setujui** jika produk, qty, alasan, dan catatan sudah benar. Badge baris menjadi **Sesuai**.
- Klik **Perlu Koreksi** jika ada data yang salah. Badge dan warna baris menjadi **Perlu Koreksi**, lalu tombol **Koreksi** tersedia di antrean verifikasi.
- Form koreksi dapat memperbaiki produk, qty, alasan, dan catatan. Koreksi menunggu approval maker-checker; pembuat koreksi tidak boleh menyetujui koreksinya sendiri.
- Setelah koreksi disetujui, baris masuk status **Siap Dicek Ulang** dan harus disetujui ulang sebelum dianggap selesai.
- **Log Stok** hanya menampilkan warna dan badge status verifikasi. Tombol **Setujui**, **Perlu Koreksi**, dan **Koreksi** hanya ada di antrean verifikasi Log OUT.
- Matching stok harian dan Check Out tetap diblokir selama masih ada Log OUT yang belum final **Sesuai**.

### Matching Stok Harian
Matching stok harian hanya dibuka pukul **15:00-20:00 WIB**. Di luar jam tersebut, tombol tugas dan menu **Cocokkan Stok (Harian)** dikunci, dan submit endpoint juga menolak pengiriman.

Saat modal dibuka, klik input **Stok Gudang** pada setiap baris yang dicek. Sistem otomatis menampilkan indikator:
- **Sesuai**: stok gudang sama dengan ekspektasi sistem.
- **Selisih**: stok gudang berbeda dari ekspektasi, sehingga catatan wajib diisi.
- **Belum valid**: input stok gudang kosong/tidak valid dan tombol **Submit Matching** diblokir.

### Alur Sesi Harian (Check In & Check Out)
Staf gudang mengelola operasional harian melalui sesi:
1. **Check In (Morning Check):** Dilakukan di awal hari kerja sebelum mengakses tab Tugas. Terdiri dari peninjauan risiko stok, perhitungan bahan produksi utama, dan checklist pemeriksaan area kerja & keselamatan (Workspace & Safety).
2. **Check Out:** Dilakukan di akhir hari kerja untuk menutup sesi operasional gudang. Check Out merekam ringkasan hari tersebut ke dalam snapshot database dan hanya bisa diselesaikan jika seluruh tugas harian telah rampung.
3. **Weekly Proof:** Bukti mingguan (seperti foto kebersihan) bersifat opsional di hari biasa, namun wajib diselesaikan untuk Check Out pada hari Sabtu (zona waktu Asia/Jakarta).

### Penerimaan Barang dari Pembelian Barang

Penerimaan Barang selalu dimulai dari **Pembelian Barang yang sudah APPROVED**, bukan dari Daftar Belanja:

1. Buka **Transaksi > Penerimaan Barang**, klik **Terima barang**, lalu **Pilih Pembelian Barang**.
2. Periksa jumlah dipesan, jumlah yang sudah diterima, qty pada penerimaan lain yang masih PENDING, dan sisa pesanan. Pembelian berstatus **BARANG DITERIMA SEBAGIAN** dapat dipilih lagi hanya untuk sisa tersebut.
3. Pada setiap produk, pilih **Sesuai** atau **Tidak Sesuai** dan isi jumlah diterima. Qty tidak boleh melebihi sisa pesanan. Catatan wajib jika jumlah berbeda dari jumlah dipesan yang tersedia; bila sama, catatan opsional.
4. Klik **Ajukan ke Owner**. Pengajuan masuk riwayat dengan status PENDING dan belum mengubah stok.
5. Approver memproses tiap produk: status kesesuaian masih dapat diedit, begitu juga qty dan catatan; produk juga dapat dihapus. Dokumen tetap PENDING selama ada produk **Belum Ada Aksi**. Penolakan berlaku untuk seluruh dokumen dan membutuhkan alasan.
6. Setelah semua produk disetujui, penerimaan otomatis APPROVED. Stok bertambah secara atomik sesuai qty final. Pada mode **stok bersama**, stok canonical dan seluruh variannya ikut berubah dan dicatat sebagai satu **bundle** di Log Stok.

Daftar Log Stok memakai nama supplier sebagai judul penerimaan. Nomor **PB-...** hanya muncul di detail bundle. Di halaman Supplier, tombol **Barang Sudah Diterima?** membuka modal yang sama dengan PB sudah terpilih, sedangkan **Lihat Riwayat Penerimaan Barang** membuka riwayat terfilter. Klik Pembelian Barang berstatus **BARANG DITERIMA SEBAGIAN** atau **BARANG DITERIMA** untuk melihat perbandingan jumlah dipesan, diterima, pending, dan sisa.

### Workflow Approval & RBAC

Perubahan stok tidak final selama penerimaan masih PENDING. Hak approval bersifat granular dan default hanya aktif untuk OWNER:

- `inventory.inbound_receipt.approve:update`: review dan menyetujui per produk.
- `inventory.inbound_receipt.reject:update`: menolak seluruh dokumen dengan alasan wajib.
- `inventory.inbound_receipt.edit:update`: mengedit penerimaan yang masih dapat diubah.

Permission tersebut dapat didelegasikan lewat RBAC. Approval Daftar Belanja dan approval Pembelian Barang tidak mengubah stok; hanya finalisasi Penerimaan Barang yang sudah disetujui seluruh item yang menambah stok.

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
