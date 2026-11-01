# Desain Belanja Terdahulu dan Pembayaran Bertahap

Tanggal: 2026-11-01 WIB
Status: disetujui

## Tujuan

Pengguna dapat mencatat pembelian dari bulan sebelumnya di Daftar Belanja dan mengikuti pembayaran yang belum lunas. Catatan ini hanya membutuhkan data transaksi dan tidak membuat barang, penerimaan, atau perubahan stok.

## Data yang dimasukkan

- **Tanggal Pembelian**: tanggal pada bulan sebelum bulan berjalan atau lebih lama, berdasarkan WIB.
- **Metode Pembayaran**: Giro sebagai pilihan awal; Transfer juga tersedia.
- **Tanggal Jatuh Tempo**: wajib diisi, sama dengan atau setelah tanggal pembelian.
- **No. Giro / No. Transaksi**: nomor yang dimasukkan pengguna, dengan label sesuai metode pembayaran.
- **Nominal Pembelian**: jumlah asli yang lebih besar dari nol.
- **Pembayaran yang sudah dilakukan**: opsional; setiap pembayaran memiliki nominal dan tanggal. Pengguna dapat mencatat lebih dari satu pembayaran dengan tanggal yang berbeda.

Nominal yang belum dibayar dihitung dari nominal pembelian dikurangi seluruh pembayaran yang tercatat. Nominal pembayaran harus lebih besar dari nol dan tidak boleh melebihi sisa tagihan. Tanggal pembayaran tidak boleh sebelum tanggal pembelian atau setelah hari ini dalam WIB. Validasi yang sama berlaku pada server dan formulir.

## Daftar Belanja dan pembayaran

Catatan belanja terdahulu tampil dalam daftar yang sama dengan daftar belanja yang ada. Tambahkan filter jenis catatan dan filter status pembayaran agar pengguna dapat menemukan belanja terdahulu yang belum lunas. Pencarian nomor, filter metode pembayaran, dan filter tanggal jatuh tempo juga berlaku untuk catatan ini. Pengurutan dan paginasi harus tetap konsisten ketika kedua jenis catatan digabung.

Kartu belanja terdahulu menampilkan tanggal pembelian, metode, tanggal jatuh tempo, nomor referensi, nominal awal, jumlah dibayar, dan sisa tagihan. Statusnya **Belum dibayar**, **Dibayar sebagian**, atau **Lunas**. Catatan ini tidak memakai status persetujuan dan penerimaan barang atau tindakan yang mengharuskan daftar barang. Filter status pembayaran berlaku untuk belanja terdahulu; catatan biasa yang tidak memiliki status pembayaran tidak diberi status yang dibuat-buat.

Dari kartu, pengguna dapat membuka riwayat pembayaran dan menambahkan pembayaran. Setelah disimpan, saldo dan status segera diperbarui. Pembayaran setelah lunas dan pembayaran yang melebihi sisa ditolak. Penambahan pembayaran harus aman ketika dua pengguna menyimpan bersamaan dan tidak boleh mencatat pengeluaran ganda karena percobaan ulang.

## Aturan keuangan

Tanggal pengeluaran menggunakan kalender Asia/Jakarta. Pembayaran yang tanggalnya sama dengan atau sebelum tanggal jatuh tempo dicatat sebagai pengeluaran pada tanggal pembayaran. Sisa nominal yang belum dibayar pada tanggal jatuh tempo dicatat otomatis sebagai pengeluaran pada tanggal jatuh tempo, meskipun belum ada konfirmasi pelunasan. Sebelum tanggal tersebut tiba, pengeluaran jatuh tempo tidak masuk ke jumlah atau laporan keuangan.

Pembayaran yang tanggalnya setelah jatuh tempo mengurangi sisa tagihan dan muncul pada riwayat pembayaran, tetapi tidak membuat pengeluaran kedua. Pembayaran historis yang dimasukkan saat membuat catatan mengikuti aturan tanggal yang sama. Pembayaran dengan tanggal sebelum atau pada jatuh tempo yang baru dimasukkan belakangan memperbarui jumlah pengeluaran jatuh tempo; laporan periode terkait dapat berubah mengikuti tanggal pembayaran yang dimasukkan.

Contoh: pembelian Rp10.000.000, pembayaran sebelum jatuh tempo Rp4.000.000 dan Rp2.000.000, serta jatuh tempo 10 November. Keuangan mencatat kedua pembayaran pada tanggal masing-masing dan Rp4.000.000 pada 10 November. Jika Rp2.000.000 lagi dibayar pada Desember, sisa tagihan menjadi Rp2.000.000 dan tidak ada pengeluaran kedua untuk pembayaran Desember tersebut.

Pengeluaran pembayaran dan jatuh tempo harus terhubung ke catatan sumber, diberi label yang jelas, dan terlindungi dari pengubahan atau penghapusan terpisah yang menyebabkan saldo dan laporan tidak cocok. Semua tampilan dan ekspor keuangan yang menghitung pengeluaran, termasuk ringkasan, jurnal, laporan bulanan, dan data asisten, harus menerapkan aturan tanggal yang sama.

## Penyimpanan dan hak akses

Simpan belanja terdahulu dan riwayat pembayarannya sebagai data tersendiri, lalu gabungkan hasilnya dengan daftar belanja saat dibaca. Struktur ini menghindari daftar barang kosong atau status persetujuan palsu pada alur pembelian biasa. Data dan pengeluaran terkait disimpan secara atomik; setiap pembayaran dan pengeluaran jatuh tempo memiliki hubungan yang mencegah pencatatan ganda. Gunakan perhitungan nominal desimal yang tepat dan pemeriksaan saldo dalam transaksi basis data.

Pembuatan catatan memerlukan izin membuat supplier dan pengeluaran. Penambahan pembayaran memerlukan izin pengubahan pengeluaran serta akses ke Daftar Belanja. Semua pembacaan dan perubahan dibatasi pada toko pengguna. Migrasi basis data diterapkan ke lingkungan pengembangan dan produksi sesuai permintaan pengguna setelah pemeriksaan rilis.

## Penanganan kesalahan dan pemeriksaan

Formulir menjelaskan kesalahan tanggal, nominal, saldo, dan nomor yang belum diisi dalam bahasa Indonesia. Jika penyimpanan gagal, data formulir tetap tersedia agar pengguna dapat memperbaiki atau mencoba lagi. Tampilan mengikuti pola aplikasi yang ada dan dapat digunakan dengan keyboard serta layar kecil.

Pemeriksaan mencakup tanggal WIB dan pergantian bulan, pembayaran sebelum/pada/setelah jatuh tempo, pembayaran historis yang dimasukkan belakangan, pembayaran sebagian dan lunas, batas saldo dan pembayaran bersamaan, pencegahan pengeluaran ganda, hak akses dan isolasi toko, filter dan paginasi gabungan, serta kecocokan semua laporan keuangan. Alur pembelian dan penerimaan barang yang sudah ada tetap diperiksa.

Halaman Bantuan, katalog alur AI Assistant, dan Catatan Perubahan diperbarui sesuai alur yang selesai diterapkan. Dokumentasi fitur ditempatkan di direktori `markdown-files` pada checkout aktif, sesuai persetujuan pengguna karena lokasi `D:` yang tercantum di AGENTS.md tidak tersedia.
