# Desain pembayaran giro dan ekspor laporan keuangan

Tanggal: 2026-11-01 (WIB)

## Tujuan

Memisahkan pengeluaran manual dari belanja pada ekspor Excel bulanan dan
memungkinkan pengguna mencatat pembayaran giro sebagian atau seluruhnya. Nilai
giro dalam laporan diperoleh dari pembelian dan riwayat pembayaran, tanpa input
tambahan saat mengunduh laporan.

## Aturan yang disetujui

- Sheet **RP bulan** hanya memuat pengeluaran yang dimasukkan manual di Keuangan
  pada periode laporan. Pengeluaran otomatis yang terhubung ke Pembelian Barang
  atau Daftar Belanja lama tidak dimasukkan ke RP.
- Sheet **PENGELUARAN BELANJA** memuat pembelian transfer berdasarkan tanggal
  pengeluarannya dan nilai penuh giro berdasarkan bulan jatuh temponya. Giro
  tetap tercantum pada bulan jatuh tempo meskipun belum dibayar. Data lama yang
  tidak memiliki metode atau tanggal yang dapat dipastikan diberi keterangan;
  data tersebut tidak boleh diam-diam dianggap transfer, giro, atau lunas.
- Sheet **PIUTANG & HUTANG** tetap memuat hutang manual yang dicatat di Keuangan
  dan juga memuat sisa giro yang belum lunas pada akhir periode laporan. Ini
  termasuk giro yang jatuh tempo pada bulan yang sama, bulan mendatang, maupun
  bulan sebelumnya. Saldo berkurang sesuai pembayaran yang tercatat sampai
  akhir periode; tanggal jatuh tempo tidak otomatis melunasi giro.
- Pembayaran giro sebagian menghasilkan status **Sebagian** dan saldo hutang
  yang tersisa. Giro yang telah dibayar penuh berstatus **Lunas** dan tidak lagi
  menjadi hutang pada periode yang mencakup pelunasan maupun periode berikutnya.
- Rekap kas menggunakan pengeluaran manual, pembelian transfer, dan pembayaran
  giro yang benar-benar tercatat pada periode tersebut. Nilai giro yang jatuh
  tempo pada sheet belanja adalah nilai terjadwal dan tidak ditambahkan lagi ke
  kas. Tampilkan penjelasan dan rincian yang memadai agar perbedaan antara nilai
  jatuh tempo dan pembayaran aktual dapat ditelusuri.
- Ringkasan arus kas pada halaman Keuangan mengikuti aturan kas yang sama:
  pembayaran giro dihitung pada tanggal pembayaran aktual, bukan seluruh nilai
  pembelian saat penerimaan barang. Bila riwayat giro belum diketahui, tandai
  ringkasan yang terdampak sebagai belum lengkap.
- Tanggal periode, hari pembayaran, dan tanggal jatuh tempo mengikuti WIB dan
  nilai kalender. Laporan bulan berjalan tetap memakai batas data sampai hari
  ini; giro yang sudah tercatat dan jatuh tempo pada bulan itu tetap terlihat
  sebagai nilai terjadwal meskipun tanggal jatuh temponya belum tiba.

Contoh: giro Rp100.000 jatuh tempo November dan dibayar Rp30.000 pada November.
Sheet belanja November menampilkan Rp100.000, sheet hutang menampilkan Rp70.000,
dan kas November berkurang Rp30.000. Bila belum ada pembayaran, sheet belanja
dan hutang masing-masing menampilkan Rp100.000, sedangkan kas belum berkurang.

## Data dan pencatatan pembayaran

Gunakan mekanisme Hutang Pemasok dan pembayaran yang sudah ada dengan hubungan
unik dan eksplisit ke Pembelian Barang. Giro baru memperoleh catatan yang
terhubung ketika penerimaan barang yang relevan disetujui. Pencatatan harus
atomik terhadap proses penerimaan dan tidak boleh membuat catatan ganda saat
penerimaan berikutnya atau permintaan yang sama diproses ulang.

Pada halaman Keuangan, pengguna dapat melihat nomor pembelian, pemasok, jatuh
tempo, nominal, riwayat pembayaran, sisa, dan status giro, lalu mencatat nominal
dan tanggal pembayaran. Izinkan pembayaran sebagian dan pelunasan, tetapi tolak
nominal yang tidak valid, pembayaran melebihi sisa, tanggal sebelum kewajiban,
dan tanggal mendatang. Gunakan transaksi dan penguncian agar dua pembayaran
bersamaan tidak melampaui saldo. Batasi akses berdasarkan toko dan izin yang
berlaku untuk membaca dan memperbarui pengeluaran.

Pembayaran giro tidak membuat pengeluaran manual baru. Pembayaran hutang manual
yang tidak terhubung ke giro tetap mengikuti perilaku yang telah ada dan tidak
otomatis membuat pengeluaran. Identitas, jumlah, tanggal, dan pencatat pembayaran
disimpan untuk menghitung laporan berdasarkan tanggal sebenarnya.

## Giro dan hutang lama

Giro yang sudah ada sebelum fitur ini tidak memiliki riwayat pembayaran yang
dapat dipastikan. Tampilkan sebagai **Belum diketahui** sampai pengguna
memeriksa dan mengonfirmasi riwayatnya; jangan menganggapnya lunas atau belum
dibayar. Pengguna dapat mencatat pembayaran historis dengan tanggal sebenarnya,
memastikan bahwa riwayatnya lengkap, dan kemudian mencatat pembayaran lanjutan.
Giro baru yang dibuat melalui alur fitur ini memiliki riwayat yang diketahui.

Jika hutang giro yang sama sudah pernah dicatat manual, sediakan pilihan untuk
menghubungkannya setelah pengguna memeriksa kecocokannya. Jangan mencocokkan
otomatis berdasarkan nama atau nominal. Hubungan harus unik, berada di toko yang
sama, dan tidak boleh membuat saldo atau pembayaran terhitung dua kali. Jika
nominal atau riwayat tidak dapat diselaraskan dengan aman, biarkan status belum
diketahui dan jelaskan kepada pengguna apa yang perlu diperiksa.

Dalam laporan, saldo atau rekap yang bergantung pada giro berstatus belum
diketahui ditandai **Belum tersedia** beserta penjelasannya, bukan diisi nol
atau diklaim sebagai jumlah lengkap. Nilai jatuh tempo yang diketahui tetap
dapat ditampilkan sebagai jadwal; data lain yang diketahui tetap dapat dirinci.
Setelah riwayat dikonfirmasi atau dilengkapi, ekspor ulang menghitung setiap
periode dari tanggal pembayaran yang tersimpan.

## Cakupan implementasi

- Perbarui model dan migrasi database untuk hubungan serta status verifikasi
  yang diperlukan; jangan merekayasa pembayaran historis.
- Perbarui proses penerimaan, endpoint, dan komponen Keuangan untuk pencatatan,
  peninjauan, penghubungan, dan pembayaran giro. Sesuaikan ringkasan arus kas
  Keuangan agar memakai pembayaran aktual dengan aturan yang sama seperti Excel.
- Pisahkan pengeluaran manual, jadwal belanja, pembayaran giro aktual, dan
  saldo hutang dalam pengambilan data serta pembuatan workbook. Pastikan rumus
  harian, BERSIH, LAP KEU, dan nilai tersimpan setelah serialisasi konsisten.
- Perbarui panduan workbook, Bantuan, katalog alur asisten, dan Catatan
  Perubahan agar sesuai dengan hasil yang benar-benar diimplementasikan.
- Tambahkan pemeriksaan terarah untuk pengeluaran manual dan otomatis, transfer,
  giro lintas bulan, pembayaran awal/sebagian/penuh, giro lama yang belum
  diketahui, penghubungan hutang manual, batas tanggal WIB, isolasi toko,
  pembayaran bersamaan, rumus, dan hasil Excel yang diserialisasi.

## Batasan

Tanggal jatuh tempo adalah jadwal dan bukan bukti uang telah keluar. Laporan
historis bergantung pada kelengkapan tanggal pembayaran yang dikonfirmasi
pengguna. Perubahan ini tidak mengubah nominal pembelian atau otomatis membuat
transaksi pengeluaran manual baru.
