# Riwayat perubahan nota oleh Sales

Tanggal: 2026-11-04 (WIB)

Ketika akun Sales yang memiliki izin mengubah isi nota transaksi berstatus `COMPLETED` (termasuk Tempo) atau DP, sistem menyimpan rincian sebelum dan sesudah perubahan yang berhasil, serta mengirim notifikasi ke inbox Owner pada toko yang sama. Setiap penyimpanan yang benar-benar mengubah isi dicatat sendiri, termasuk perubahan item, rincian transaksi, pajak, nota Percetakan yang sudah diproses, dan pembayaran piutang beserta metode pembayarannya.

Owner membuka notifikasi atau memilih **Riwayat perubahan nota** pada menu tiga titik transaksi di Riwayat. Halaman perbandingan menampilkan pelaku, waktu, rincian yang berubah, versi sebelum dan sesudah, serta nota asli sebelum perubahan Sales pertama yang tercatat. Draft dan transaksi menunggu persetujuan tidak menghasilkan notifikasi ini. Perubahan lama sebelum fitur aktif tidak dapat direkonstruksi.

Pembayaran piutang melalui nota maupun profil pelanggan ikut dicatat. Jika satu pembayaran pelanggan dialokasikan ke beberapa nota, setiap nota yang berubah memiliki versi dan notifikasi sendiri. Saldo, pembayaran, seluruh versi, dan notifikasi disimpan atau dibatalkan bersama.

Penyimpanan riwayat dan notifikasi dilakukan bersama perubahan transaksi dalam satu transaksi database. Jika penyimpanan gagal, perubahan dan catatannya ikut dibatalkan. Riwayat hanya dapat dibaca akun Owner di toko terkait.

## Penerapan

Terapkan migrasi `20261103130000_transaction_receipt_change_audit` pada database tujuan sebelum fitur digunakan. Lokasi `D:\main_project\pos-system-monorepo\markdown-files` yang ditentukan tidak tersedia di lingkungan kerja ini, sehingga dokumen disimpan pada folder `markdown-files` di checkout aktif.

## Catatan pelaksanaan

Headroom MCP tidak tersedia pada sesi penyelesaian; keluaran pemeriksaan dibaca secara terbatas. GitNexus memakai indeks lama setelah indeks ulang gagal memulai parser, sehingga hasil analisis dampaknya dilengkapi pemeriksaan diff dan pengujian langsung pada jalur yang berubah. Migrasi disertakan dalam perubahan kode dan belum diterapkan ke database.
