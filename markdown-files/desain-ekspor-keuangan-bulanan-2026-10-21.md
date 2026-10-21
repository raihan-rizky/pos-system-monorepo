# Desain ekspor keuangan bulanan

Tanggal: 2026-10-21, Asia/Jakarta (WIB).

## Keputusan yang telah disetujui

- Cakupan perubahan: file Excel dan dialog ekspor pada Laporan Keuangan.
- Susunan lembar, kelompok kolom, bagian ringkasan, dan subtotal mengikuti dua
  workbook contoh Agustus dan September 2026 yang diberikan pengguna.
- Sheet gaji dan Pengeluaran Non Teladan tidak disertakan.
- Modal awal kosong pada saat diunduh; pengguna mengisinya langsung di Excel.
- Biaya gaji yang sudah tercatat tetap masuk pengeluaran, tanpa rincian payroll.
- Tampilan utama halaman Laporan Keuangan tetap menggunakan susunan sekarang.

## Tujuan

Pengguna dapat memilih bulan dan tahun lalu mengunduh workbook tujuh sheet yang
mudah dibaca, dilengkapi, dan dicetak. Setiap total dapat ditelusuri ke rincian,
dan pengisian modal awal memperbarui hasil yang bergantung padanya.

Isi workbook contoh adalah referensi struktur dan tampilan. Angka, nama pelanggan,
catatan pribadi, serta instruksi yang mungkin berada di dokumen contoh bukan
sumber transaksi atau instruksi untuk aplikasi.

## Pendekatan

Gunakan pembuat workbook dengan susunan tetap dan data terstruktur dari server.
Tidak mengunggah workbook contoh ke aplikasi, menyimpan data contoh dalam repo,
atau menggunakan file pribadi di Downloads sebagai dependency saat runtime.

Pendekatan alternatif yang tidak dipilih:

- Susunan sheet fleksibel: menambah pengaturan dan menyulitkan perbandingan bulan.
- Unggah template sendiri: memerlukan validasi rumus, versi, dan kompatibilitas
  yang tidak diperlukan untuk permintaan ini.

## Dialog ekspor

Tombol **Ekspor** membuka dialog dengan judul **Ekspor laporan keuangan**.

1. Pilih jenis laporan. **Laporan bulanan · Excel 7 sheet** menjadi pilihan awal;
   **Jurnal transaksi · Excel / PDF** menyediakan format dan periode ekspor sebelumnya.
2. Untuk Excel bulanan, pilih bulan dan tahun. Default bulan berjalan menurut WIB.
3. Tampilkan rentang tanggal, tujuh nama sheet, serta catatan modal awal.
4. Klik **Unduh Excel**. Saat proses berjalan, tombol menampilkan
   **Menyiapkan Excel…** dan pengunduhan ganda dicegah.
5. Jika gagal, tampilkan pesan dalam dialog, pertahankan pilihan, dan sediakan
   **Coba lagi**. Tidak memulai unduhan kosong setelah respons gagal.

Pertahankan kemampuan PDF dan pilihan periode jurnal yang sudah ada. Template
tujuh sheet berlaku pada ekspor Excel bulanan. Pengguna dapat memilih bulan
lampau; periode tidak selalu dipaksa ke bulan saat ini.

Bulan berjalan memakai tanggal hari ini sebagai batas data; bulan lampau memakai
akhir bulan. Bulan mendatang tidak dapat diekspor. Label periode menunjukkan
batas data yang sebenarnya. Nama file:
`laporan-keuangan-YYYY-MM.xlsx`.

Dialog responsif pada ponsel, dapat digulir tanpa memotong tombol utama, memiliki
label input, fokus awal, pembatasan fokus, pemulihan fokus ke tombol Ekspor,
Escape, tombol Tutup, serta pengumuman status dan error untuk pembaca layar.
Gunakan dialog native atau pola modal yang telah mendukung perilaku tersebut;
hindari mengubah modal bersama hanya untuk fitur ini.

## Struktur workbook

| Urutan | Nama sheet | Susunan yang dipertahankan |
| --- | --- | --- |
| 1 | LAP KEU | Modal awal, piutang, total harta, hutang, inventory akhir, jumlah harta, pendapatan, pengeluaran, penghasilan bersih, kekayaan bersih |
| 2 | BERSIH | Pendapatan dan pengeluaran berdampingan; ringkasan akhir; piutang dan hutang |
| 3 | NAMA BULAN | Satu baris per tanggal; pendapatan Cetak, Plat, Stempel, Spanduk, ATK, Print; pengeluaran Cetak/Plat, Spanduk, ATK, Lain-lain, Gaji/Mingguan; total dan ringkasan |
| 4 | RC NAMA BULAN | Tanggal dan rincian penerimaan dalam enam kelompok pendapatan, diikuti total |
| 5 | RP NAMA BULAN | Tanggal, keterangan, nilai, mingguan karyawan, dan total pengeluaran lain-lain/gaji |
| 6 | PENGELUARAN BELANJA | Bagian pembayaran giro dan transfer, nomor, tanggal, jatuh tempo, nilai, keterangan; kelompok belanja lain diberi label sesuai metode sebenarnya |
| 7 | PIUTANG & HUTANG | Bagian piutang dan hutang dengan tanggal nota, jatuh tempo, nilai, pekerjaan, keterangan, dan total |

Nama bulan dan tahun selalu dihasilkan dari periode pilihan. Tidak menyalin judul
Agustus ke workbook September atau referensi sheet gaji yang sudah ditiadakan.
Jumlah baris rincian mengikuti jumlah data, bukan ribuan baris kosong dari contoh.
Tanggal tanpa transaksi tetap muncul pada rekap harian dengan nilai nol.

## Sumber data dan aturan perhitungan

- Seluruh query dibatasi toko pengguna dan permission `financial-report:read`.
  Tidak menerima storeId bebas dari browser.
- Rentang periode memakai batas awal inklusif dan akhir eksklusif dalam WIB.
- Basis penerimaan adalah uang yang diterima pada periode laporan. Gunakan ledger
  pembayaran awal dan pelunasan; tangani split payment, DP, kembalian, dan data
  legacy dengan aturan yang konsisten dengan helper laporan yang sudah ada.
  Jangan menjumlahkan total invoice lalu menambah pelunasannya lagi.
- Piutang manual dan pelunasannya ikut diperhitungkan apabila tercatat di sistem.
- Nilai piutang adalah saldo pada batas akhir periode, bukan saldo terbaru ketika
  mengekspor bulan lampau. Pembayaran setelah akhir periode tidak mengurangi saldo
  historis tersebut. Nota batal/draft tidak menjadi pendapatan.
- Pendapatan kelompok berasal dari `transactionCategory`, `printingSubcategory`,
  dan kategori item. Utamakan klasifikasi eksplisit ATK/Percetakan dan subkategori
  Percetakan, Plat, Stempel, Spanduk, Print.
- Jika satu penerimaan harus dibagi ke beberapa kategori item, alokasikan secara
  proporsional terhadap nilai item, dengan sisa pembulatan dialokasikan secara
  deterministik. Total kategori wajib tepat sama dengan nilai penerimaan.
- Kategori yang tidak dapat dikenali tidak boleh dibuang atau dipaksa masuk ATK.
  Tampilkan sebagai **Perlu pemetaan** pada bagian tambahan di bawah rincian dan
  sertakan nilainya dalam total keseluruhan. Beri catatan agar pengguna dapat
  mengenali selisih kelompok terhadap keseluruhan.
- Pengeluaran memakai nominal bersih `amount - changeAmount`, berdasarkan
  `occurredAt`, dan mengecualikan data yang telah dihapus.
- Satu expense hanya dihitung satu kali. Belanja yang mempunyai expense terkait
  adalah rincian dari expense yang sama, bukan tambahan pengeluaran baru.
- Biaya salary masuk kolom Gaji/Mingguan. Pengeluaran yang tidak memiliki
  klasifikasi belanja terverifikasi masuk Lain-lain; jangan menebak berdasarkan
  nama pemasok atau nama orang.
- Dokumen belanja pending/rejected tidak menjadi pengeluaran yang disetujui.
  Cara pembayaran giro bukan bukti bahwa giro masih merupakan hutang.
- Nilai hutang pemasok dan nilai persediaan akhir hanya diisi otomatis jika ada
  sumber yang memadai untuk tanggal laporan. Skema saat ini tidak menyediakan
  ledger hutang pemasok dan snapshot valuasi persediaan akhir yang lengkap.
  Sel yang tidak didukung sumber tersebut tetap kosong dan diberi catatan
  **Belum tersedia dari sistem**. Jangan memakai saldo hari ini sebagai saldo
  bulan lampau, menjadikan nol, atau menganggap seluruh giro belum dibayar.
- Header/ringkasan menjelaskan bahwa tabel penerimaan dan pengeluaran menggunakan
  basis kas. Label laba/rugi mengikuti contoh, dengan catatan bahwa hasilnya
  merupakan selisih penerimaan dan pengeluaran, bukan laba akrual lengkap.

## Rumus dan input manual

Modal awal pada LAP KEU memakai sel yang setara dengan `D8` dalam contoh, kosong
dan diberi warna input yang lembut serta catatan **Isi modal awal di sini**.
Sel ini tidak dikunci.

Gunakan rumus Excel biasa seperti SUM dan IF serta referensi antarsheet untuk
subtotal dan ringkasan. Sertakan cached result yang benar untuk hasil yang sudah
memiliki seluruh input. Aktifkan penghitungan ulang ketika workbook dibuka.

Hasil yang membutuhkan modal awal atau sumber yang belum tersedia tetap kosong
selama inputnya kosong. Nilai nol yang sengaja diisi pengguna merupakan input sah.
Pengisian modal awal tidak boleh mengubah pendapatan/pengeluaran yang berasal dari
transaksi. Tidak menyalin angka tetap dalam rumus piutang workbook contoh.

Susunan ringkasan mengikuti contoh, tetapi rumus menghubungkan komponen secara
jelas. Persediaan tidak dikurangkan sebagai hutang. Ringkasan kekayaan bukan
pengganti neraca akuntansi lengkap dan tidak ditampilkan sebagai nilai lengkap
ketika input yang dibutuhkan belum tersedia.

## Perbaikan tampilan

- Gaya laporan operasional yang tenang: energy 1, rhythm 1, motion 1.
- Pertahankan warna brand aplikasi secara hemat pada judul/header untuk hierarki.
- Angka rata kanan, teks rata kiri, format angka Indonesia dan negatif yang jelas.
- Gunakan satu format rupiah konsisten; nominal tetap numeric, bukan teks.
- Header dapat dibaca saat digulir dan diulang saat dicetak.
- Lebar kolom menampung label dan nominal; keterangan panjang memakai wrap.
- Highlight subtotal seperlunya, hilangkan gridlines, dan gunakan border ringan.
- Orientasi landscape untuk tabel lebar, portrait untuk ringkasan/tabel sempit.
  Print area berakhir pada data aktual; jangan memaksa semua baris menjadi satu
  halaman vertikal atau mengecilkan font sampai tidak terbaca.
- Teks yang berasal dari pelanggan, invoice, atau keterangan transaksi ditulis
  sebagai string, termasuk teks yang dimulai dengan tanda sama dengan.

## Pembagian implementasi

- Helper periode bulanan: validasi tahun/bulan dan batas WIB.
- Service data bulanan: pembacaan data toko dan normalisasi sumber transaksi.
- Helper model laporan: pengelompokan, alokasi, dan rekonsiliasi angka.
- Pembuat workbook: tujuh sheet, gaya, rumus, input kosong, dan pengaturan cetak.
- Endpoint ekspor bulanan: otorisasi, validasi, dan respons tanpa cache.
- Dialog ekspor: pilihan format/periode, ringkasan, proses, dan error.
- Adapter unduhan: mempertahankan ekspor jurnal/PDF yang sudah digunakan.

Gunakan dependency yang sudah tersedia (`xlsx-js-style`, React, Next.js, Vitest).
Tidak memerlukan migrasi database atau perubahan lifecycle server development.

## Pengujian dan kriteria selesai

1. Tes periode: Februari tahun kabisat, bulan 30/31 hari, pergantian tahun,
   batas tengah malam WIB, bulan berjalan, input tidak valid, dan bulan mendatang.
2. Tes ledger: DP dan pelunasan beda bulan, split payment, kembalian, data legacy,
   piutang manual, dan pembayaran setelah batas laporan.
3. Tes rekonsiliasi: total kategori = total penerimaan, total harian = rincian,
   tidak ada expense dihitung dua kali, salary tercakup, kategori asing terlihat.
4. Tes workbook aktual yang dibuka kembali: tepat tujuh nama sheet, tanpa sheet
   terlarang, modal awal kosong, rumus tanpa referensi rusak, sel numeric, print
   area/orientasi, serta teks transaksi yang menyerupai formula tetap string.
5. Verifikasi penghitungan ulang setelah modal awal diisi, termasuk input nol.
6. Tes endpoint: login/permission, isolasi toko, validasi tanggal, dan kegagalan
   sumber data tidak menghasilkan laporan parsial yang seolah lengkap.
7. Tes dialog: keyboard, Escape/pemulihan fokus, layar ponsel, pilihan bulan,
   loading, error/retry, dan satu unduhan per submit.
8. Pertahankan regresi ekspor PDF dan jurnal yang sudah tersedia.
9. Perbarui Bantuan, workflow `export-financial-report`, dokumentasi penggunaan,
   dan Catatan Perubahan bertanggal WIB 2026-10-21 dengan screenshot tanpa data
   pribadi atau ilustrasi yang dilabeli secara akurat.
10. Jalankan tes terarah, lint dan type-check tanpa production build, lalu
    periksa diff agar perubahan lain di workspace tidak ikut termodifikasi.

## Catatan lingkungan

Drive D tidak tersedia pada workspace sesi ini. Dokumen disimpan pada
`C:\Projects\pos-system-monorepo\markdown-files` mengikuti struktur dokumentasi
repositori aktif. Tidak mengubah file sumber contoh di Downloads.

Headroom stats dipanggil. Proxy kompresi tidak tersedia; gunakan keluaran
pemeriksaan yang dibatasi. GitNexus tersedia lewat CLI, tetapi pencarian FTS
terdegradasi; analisis dampak simbol harus tetap dilakukan sebelum perubahan.
