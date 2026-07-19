# Keuangan (Arus Kas & Pengeluaran)

## Lokasi dan Fungsi

Buka sidebar **Keuangan > Keuangan** (`/keuangan`) untuk memantau arus kas bulanan toko. Halaman ini menyediakan:

- **Net Cash Flow:** Ringkasan bersih arus kas masuk dan keluar.
- **Grafik Pemasukan vs Pengeluaran:** Visualisasi harian untuk membandingkan uang masuk dan uang keluar.
- **Pemasukan dari Transaksi:** Total nominal yang diterima dari transaksi penjualan yang terjadi.
- **Daftar Pengeluaran:** Catatan pengeluaran operasional toko yang dikelompokkan per kategori (misal: sewa, listrik, gaji, operasional, dll).
- **Sumber Pengeluaran:** Badge **Manual** menandai entri dari form, sedangkan badge ungu **Permohonan Belanja** menandai entri otomatis setelah semua item permohonan diproses.
- **Pengeluaran Otomatis:** Nominal memakai harga modal dikali jumlah yang disetujui, kategori Bahan, dan tanggal permohonan. Entri ini tidak dapat diedit atau dihapus dari halaman Keuangan.
- **Harga Modal Kosong:** Item tanpa harga modal dihitung Rp0 dan diberi badge **Harga modal tidak tersedia saat approval**. Mengisi harga modal produk setelah approval tidak mengubah snapshot pengeluaran lama.

## Mengelola Pengeluaran & Bukti Transaksi
- **Pencatatan Pengeluaran:** Catat nominal, pilih kategori, dan masukkan pengeluaran operasional toko. Langkah selengkapnya dibahas di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q18-bagaimana-cara-mencatat-pengeluaran-operasional-toko).
- **Mengunggah Bukti Pengeluaran:** Klik **Pilih gambar bukti** untuk mengunggah foto nota langsung ke R2. Jika penyimpanan R2 gagal, gunakan input prnt.sc yang muncul sebagai fallback. Langkah detail dibahas di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q20-bagaimana-cara-mencatat-pengeluaran-operasional-toko).

## Hak Akses (Role-Based Access Control)
Akses ke menu Keuangan dan tindakan pengeluaran disesuaikan dengan peran pengguna (RBAC). Biasanya dibatasi hanya untuk Owner dan Admin.
