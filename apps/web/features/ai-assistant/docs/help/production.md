# Panduan Fitur Produksi (Production)

Fitur Produksi adalah area kerja bagi tim operasional/produksi untuk memantau, memproses, dan menyelesaikan pesanan pelanggan (job order). Halaman ini menggunakan tampilan Kanban Board untuk memudahkan visualisasi alur kerja.

## Konsep Utama
- **Job Order:** Pesanan dari pelanggan yang sudah dibayar atau diproses oleh kasir dan diteruskan ke bagian produksi.
- **Kanban Board:** Papan interaktif tempat job order divisualisasikan dalam bentuk kartu-kartu yang dikelompokkan berdasarkan status.
- **Aktivitas Produksi (Log):** Catatan riwayat (history) dari setiap pergerakan status pesanan dan notifikasi yang dikirimkan, lengkap dengan nama operator (actor) dan waktunya.

## Alur Status (Kanban Columns)
Alur kerja produksi memiliki tahapan (status) berikut:
1. **Baru:** Job order yang baru saja dibuat dan belum mulai diproses.
2. **Sedang Diproses (PRINTING):** Job order sedang dikerjakan/dicetak oleh operator produksi.
3. **Siap Diambil (READY_PICKUP):** Job order sudah selesai diproses dan menunggu pelanggan untuk mengambilnya.
4. **Selesai (DELIVERED):** Job order telah diambil oleh pelanggan dan dianggap selesai.

Terdapat juga indikator khusus:
- **Terlambat (OVERDUE):** Jika waktu saat ini telah melewati estimasi waktu selesai pesanan (`estimatedDoneAt`).

## Fungsionalitas & Operasional
- **Statistik Produksi:** Menampilkan ringkasan data penting di bagian atas halaman (Total Aktif, Masuk Printing, Siap Diambil, dan Operator Aktif).
- **Tab Aktivitas:** Menampilkan daftar aktivitas siapa (operator) melakukan perubahan apa, serta fungsi pencarian riwayat berdasarkan nomor invoice atau nama pelanggan.
- **Langkah Kerja Operasional:**
  - **Ubah Status Kanban:** Pelajari cara menyeret kartu antar kolom status di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q22-bagaimana-cara-memperbarui-status-pengerjaan-pesanan-cetak-job-order).
  - **Kirim WhatsApp:** Pelajari cara mengirimkan notifikasi pengambilan barang di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q23-bagaimana-cara-mengirim-notifikasi-pengambilan-barang-kepada-pelanggan).

## Hak Akses (Role-Based Access Control)
- **Hanya Lihat:** Pengguna yang tidak memiliki izin *update* hanya dapat melihat kanban dan aktivitas.
- **Update (Ubah):** Pengguna dengan izin update produksi dapat memindahkan status job order dan mengirimkan notifikasi kepada pelanggan.
