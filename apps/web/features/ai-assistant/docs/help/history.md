# Panduan Fitur Riwayat Transaksi (Transaction History)

Fitur Riwayat Transaksi berfungsi sebagai pusat pemantauan seluruh catatan penjualan yang terjadi di sistem POS. Halaman ini memungkinkan pengguna untuk mencari nota lama, mengecek status pembayaran, mengubah detail pesanan, dan mencetak ulang struk.

## Konsep Utama
Setiap transaksi yang tercatat memiliki beberapa informasi penting: Nomor Struk (Invoice), Nama Pelanggan, Total Nominal, Metode Pembayaran (Cash, Transfer, QRIS, dsb), Nama Kasir, dan **Status Transaksi**.

### Status Transaksi yang Tersedia
- **Lunas (COMPLETED):** Pembayaran transaksi telah selesai dan lunas.
- **DP:** Pelanggan baru membayar sebagian dari total tagihan (Down Payment) atau masih memiliki sisa hutang/piutang (Bayar Nanti).
- **Pending (PENDING_APPROVAL):** Transaksi masih menunggu persetujuan atau verifikasi (misalnya transaksi dibuat oleh perangkat sales dari luar).
- **Dibatalkan (VOIDED):** Transaksi telah dibatalkan. Nilainya tidak akan dihitung sebagai pendapatan, dan stok barang biasanya dikembalikan.
- **Refund:** Transaksi yang uangnya dikembalikan kepada pelanggan karena suatu alasan.
- **Sementara (DRAFT):** Nota disimpan sementara dan belum difinalisasi menjadi transaksi utuh.

## Fungsionalitas Utama
- **Pencarian & Filter:** Anda dapat mencari transaksi menggunakan Nomor Invoice atau Nama Pelanggan, serta menggunakan filter berdasarkan Status Transaksi (misal: hanya tampilkan yang DP) atau rentang waktu (Hari ini, Minggu ini, Bulan ini).
- **Ubah Transaksi:** Anda dapat mengedit nama pelanggan, menetapkan/mengubah nama anggota Sales, atau merubah status pembayaran (misalnya dari DP menjadi Lunas). Pengguna yang memiliki hak akses juga dapat memodifikasi isi keranjang belanja pada transaksi tersebut (menambah/mengurangi barang).
- **Cetak Struk:** Tombol untuk memunculkan tampilan struk transaksi agar bisa dicetak ulang atau dikirim ke pelanggan.
- **Surat Jalan:** Anda dapat langsung membuat Surat Jalan pengiriman dari transaksi yang telah dipilih.
- **Batalkan (Void):** Merubah status transaksi menjadi VOID jika terjadi kesalahan.

## Hak Akses (Role-Based Access Control)
- **Hanya Lihat:** Dapat melihat daftar transaksi, detail, dan mencetak struk.
- **Ubah (Update):** Diperlukan untuk mengakses fungsi "Ubah Transaksi", "Batalkan (Void)", dan memberikan persetujuan (Approve) pada pesanan Pending.
- **Hapus (Delete):** Fungsi penghapusan (menghapus data transaksi dari sistem secara permanen) adalah tindakan berisiko tinggi dan hanya dibatasi untuk level pengguna tertinggi (seperti Pemilik/Admin).

## Proses Transaksi Khusus
- **Approval Transaksi Pending:** Transaksi pending dari perangkat sales luar memerlukan persetujuan kasir/admin di halaman riwayat sebelum memotong stok. Langkah persetujuan dibahas di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q7-bagaimana-cara-menyetujui-transaksi-pending-approval-process-yang-dikirim-oleh-sales-lapangan).
- **Cetak Surat Jalan:** Surat jalan pengiriman barang fisik dapat dibuat dari menu aksi transaksi berstatus Lunas/DP. Langkah selengkapnya dibahas di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q8-bagaimana-cara-membuat-surat-jalan-pengiriman-delivery-order-barang-ke-pelanggan).
- **Mengunggah Bukti Transaksi:** Bukti transfer/nota dapat ditautkan ke transaksi menggunakan link URL gambar. Panduan langkah unggah dibahas di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q9-bagaimana-cara-mengunggah-foto-nota-pengeluaran-atau-struk-bukti-transaksi-pelanggan).
