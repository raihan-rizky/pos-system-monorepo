# Verifikasi koreksi pembayaran pembelian

## Akar masalah

Jadwal campuran Transfer/Giro menghasilkan ringkasan pembelian dengan metode kosong dan tanggal jatuh tempo Giro. CHECK lama pada `pos_goods_purchases` menolak kombinasi tersebut: pratinjau berhasil, tetapi transaksi simpan dibatalkan database. Migrasi `20261119010000_flexible_goods_purchase_payment_summary` memperbolehkan ringkasan campuran sambil mempertahankan validasi masing-masing metode dan baris jadwal.

## Perbaikan hasil review

- Total barang dengan jumlah pecahan memakai Decimal dan pembulatan HALF_UP per baris, sesuai server; `2.01 × 0.5` menghasilkan `1.01`.
- Menghapus pesan validasi saat mengetik tidak memindahkan fokus dari kolom nominal.
- Editor lengkap menyediakan pemuatan data terbaru setelah konflik versi, dengan konfirmasi sebelum data daftar, barang, dan pilihan katalog direset. Alasan tetap tersedia; jadwal yang berbenturan ditampilkan untuk diperiksa.
- Kegagalan pemuatan ulang mempertahankan pilihan katalog. Pilihan hanya direset setelah server berhasil mengembalikan data terbaru.
- Kembali ke formulir tanpa mengubah draft menggunakan kunci retry yang sama. Perubahan payload mendapatkan kunci baru.
- Decimal diekspor melalui subpath browser `@pos/db/decimal`, tanpa menambahkan dependensi atau membuat PrismaClient di browser.

## Bukti dan batas verifikasi

Regresi ditulis dan diamati gagal sebelum perbaikan, termasuk kehilangan pilihan katalog setelah reload gagal. Audit baca-saja melalui SSH `pos-vps` memastikan CHECK baru tervalidasi dan migrasi tercatat selesai pada dev serta production; fingerprint kedua rilis kompatibel. Tidak ada pembelian pelanggan yang diubah untuk pengujian.

Suite fitur sebelumnya: 6.888 tes lulus; integrasi PostgreSQL 72 tes lulus; validasi migrasi 3 tes lulus. Follow-up diverifikasi kembali dengan tes formulir/tindakan, browser desktop/mobile dan keyboard, TypeScript langsung untuk web/database, serta ESLint. CI rilis menjalankan pemeriksaan repositori dan build pada runner GitHub; build production tidak dijalankan secara lokal.

Direktori dokumentasi wajib `D:\main_project\pos-system-monorepo\markdown-files` tidak tersedia pada host ini. Dokumentasi disimpan pada `markdown-files` checkout agar ikut dalam rilis. Headroom MCP dipanggil; proxy kompresinya tidak terjangkau, sehingga keluaran dibatasi dan hasil lokal digunakan.
