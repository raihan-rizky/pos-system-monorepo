# Perbaikan Reset Database: Nota Percetakan

Tanggal rilis: 2026-11-02 (Asia/Jakarta).

## Masalah dan perbaikan

Sebelumnya, reset Transaksi Penjualan terhalang bila ada Nota Percetakan yang terhubung. Planner selalu melindungi nota tersebut, tetapi UI tidak menyediakan pilihan untuk memenuhi dependensinya.

- Owner kini dapat mencentang **Penjualan & Keuangan > Nota Percetakan**.
- Jika transaksi terhubung ke nota, preview meminta sub-data **Nota Percetakan**. Pilih nota tersebut dan tampilkan dampak lagi agar dependensinya terpenuhi.
- Jika nota dan transaksi dipilih bersama, nota dihapus sebelum transaksi dalam transaction database yang sama, sesuai relasi `onDelete: Restrict`.
- Memilih **Nota Percetakan** saja menghapus nota toko aktif tanpa menghapus transaksi penjualan. Nota yang tidak dipilih tetap tersimpan.
- Counter penomoran nota tetap tersimpan sehingga nomor yang sudah digunakan tidak diulang. Piutang manual tetap dilindungi.
- Request API granular `models: ["PrintingReceipt"]` dan kategori lama `domains: ["salesFinance"]` didukung. Kepemilikan toko berasal dari Owner yang terautentikasi.

## Panduan pengguna

1. Buka **Pengaturan > Reset Database**, lalu pilih sub-data yang ingin dihapus, termasuk **Nota Percetakan** bila diminta sebagai dependensi transaksi.
2. Klik **Lihat Dampak Reset** dan periksa jumlah data serta dependensinya. Perubahan pilihan membatalkan preview dan konfirmasi sebelumnya.
3. Pastikan shift, import, dan batch sudah selesai. Ketik **RESET DATABASE** persis, lalu klik **Reset Data Terpilih**.

Bantuan Owner, FAQ Q46, workflow AI Assistant, dan Catatan Perubahan `database-reset-printing-receipts` diperbarui. Catatan Perubahan memakai ilustrasi kategori yang disediakan aplikasi.

## Verifikasi dan catatan eksekusi

- TDD: delapan kegagalan regresi diverifikasi sebelum implementasi, mencakup checkbox, validasi API, dependensi, cakupan toko, dan urutan penghapusan. Setelah implementasi, 49 tes reset lulus.
- Verifikasi akhir: 137 tes integrasi pada 11 berkas, ESLint pada berkas TypeScript yang berubah, dan pemeriksaan TypeScript web lulus.
- Review independen tidak menemukan masalah Critical, Important, atau Minor; pemilihan nota, cakupan toko, urutan penghapusan, dan pemeliharaan penomoran telah diperiksa.
- Tes eksekusi memeriksa argumen penghapusan nota `where: { storeId }`; tes lainnya memeriksa urutan nota sebelum transaksi serta pemeliharaan transaksi dan penomoran.
- Headroom stats/compress dipanggil. Proxy `127.0.0.1:8787` tidak dapat dihubungi dan kompresi memakai passthrough; keluaran dibatasi.
- GitNexus impact dicoba untuk planner, registry, pilihan, dependensi, dan Bantuan. Simbol tidak ditemukan pada indeks yang tersedia, sehingga hasilnya UNKNOWN; pemanggil preview/execute dan cakupan kode diperiksa langsung.
- Drive `D:` tidak tersedia. Dokumentasi disimpan di folder `markdown-files` repository.
- Git hook dilewati sesuai permintaan pengguna. Verifikasi terarah dijalankan secara manual; suite penuh tidak dinyatakan lulus.
- Tidak menjalankan production build, mengubah lifecycle server Next.js, atau menjalankan reset pada database nyata.
