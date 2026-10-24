# Desain HPP dan Harga Otomatis Grup Satuan

Tanggal: 2026-10-24 (Asia/Jakarta)
Status: desain diimplementasikan, ditinjau dan diterapkan ke checkout utama. Suite web sebelum perbaikan final: 4.088 lulus/10 dilewati; verifikasi integrasi final di checkout utama: 99/99 tes dan 4 skenario browser lulus. Detail bukti dan batas tersedia pada dokumen implementasi.

Migrasi schema dev dan prod `20261024010000_group_automatic_pricing` diterapkan dan diverifikasi pada 2026-10-24 WIB. Backfill data belum dijalankan.

## 1. Tujuan dan keputusan pengguna

Pengguna cukup mengelola HPP dan harga jual satuan acuan. Satuan lain dalam grup mengikuti konversi dan pengaturan harga masing-masing.

Keputusan yang sudah disetujui:

- Pembaruan berlangsung terus ketika HPP acuan, harga jual acuan, atau konversi berubah.
- Semua grup baru dan lama memakai mode Otomatis secara default.
- Harga jual grup lama dipertahankan pada migrasi dengan menghitung faktor penyesuaian dari harga yang sudah tersimpan.
- HPP otomatis mengikuti HPP acuan dikalikan konversi; diskon jual tidak mengurangi HPP.
- Mode Manual tersedia per satuan untuk mengisi HPP dan harga jual sendiri.
- Hasil perhitungan disimpan bersama dalam satu transaksi agar katalog, POS, dan laporan mendapat nilai konsisten.
- Data acuan atau konversi yang belum valid ditandai Perlu ditinjau; sistem mempertahankan nilai sebelumnya untuk perhitungan yang belum dapat dilakukan.

## 2. Kondisi sistem sebelum implementasi

- `Product` menyimpan `price`, `costPrice`, `stockGroupId`, dan `unitMultiplierToBase`.
- `ProductStockGroup` menyimpan satuan acuan stok melalui `baseUnit`, tanpa konfigurasi hubungan harga.
- Endpoint harga grup memperbarui satu produk dan menulis riwayat harga dalam transaksi.
- Tab Harga mengizinkan pengisian HPP dan harga jual langsung untuk setiap satuan.
- Endpoint konversi dan penambahan satuan sudah memakai penguncian grup dan produk.
- Harga produk juga ditulis melalui endpoint produk dan layanan import; integrasi hanya di endpoint harga grup tidak mencukupi.
- Harga supplier pada Penerimaan Barang disimpan pada catatan penerimaan dan persediaan. Keberadaan harga supplier pada dokumen tidak dengan sendirinya membuktikan HPP master produk telah berubah.

## 3. Pendekatan

### Pilihan utama: hitung ketika data ditulis

Satu layanan domain menghitung dan menyimpan seluruh dampak harga grup ketika sumber berubah. Semua jalur penulisan harga memakai layanan yang sama. Pembaca tetap mengambil harga dan HPP produk yang tersimpan.

Manfaat: perilaku seragam pada katalog, POS, import, dan laporan; riwayat harga dapat menjelaskan pembaruan. Konsekuensi: setiap jalur penulisan harga dan perubahan anggota grup harus diintegrasikan.

### Alternatif: hitung ketika data dibaca

Semua pembaca menghitung harga efektif dari konfigurasi. Konsekuensinya adalah perubahan di banyak pembaca, sinkronisasi offline, perhitungan margin, dan snapshot transaksi. Pendekatan ini tidak dipilih.

## 4. Model domain

### Grup

- Menyimpan ID produk acuan harga secara eksplisit, terbatas pada anggota grup dan toko yang sama.
- Menyimpan versi konfigurasi untuk mendeteksi pratinjau atau penyimpanan yang kedaluwarsa.
- Menyimpan versi migrasi agar inisialisasi data lama dapat dijalankan ulang tanpa menghitung ulang faktor yang sudah terbentuk.
- Acuan awal dipilih hanya bila ada satu anggota aktif yang cocok dengan `baseUnit`, konversinya valid, dan tidak memerlukan peninjauan konversi.
- Acuan yang tidak dapat ditentukan secara unik menghasilkan status Perlu ditinjau. Sistem tidak memilih produk pertama secara diam-diam.
- Produk acuan menjadi titik input HPP dan harga grup; mode otomatis diterapkan pada satuan pengikut. Produk acuan tidak mengikuti dirinya sendiri.

### Anggota grup

- Mode harga: `AUTO` atau `MANUAL`, dengan default `AUTO`.
- Faktor penyesuaian harga jual; faktor 1 berarti tanpa penyesuaian.
- Alasan peninjauan yang membedakan acuan tidak tersedia, konversi belum valid, harga acuan nol untuk inisialisasi faktor lama, dan HPP acuan belum tersedia.
- `price` dan `costPrice` tetap menjadi hasil tersimpan yang digunakan pembaca.

Faktor disimpan sebagai rasio pembilang dan penyebut yang presisi, bukan persentase tampilan yang dibulatkan. Rasio dapat direpresentasikan sebagai pasangan bilangan bulat berbentuk string dalam metadata konfigurasi. Kalkulasi menggunakan aritmetika desimal/rasional. Nilai uang dibulatkan setengah ke atas ke dua desimal hanya pada hasil akhir.

## 5. Rumus dan contoh

Untuk produk acuan A dan satuan pengikut V:

```text
konversi V terhadap A = multiplier V / multiplier A
HPP V = HPP A × konversi V terhadap A
harga V = harga A × konversi V terhadap A × faktor V
```

Rumus berlaku langsung dari acuan ke setiap pengikut, sehingga pembulatan tidak bertumpuk dari pcs ke pak lalu dus.

Contoh yang menjadi kriteria penerimaan:

| Data | Nilai |
| --- | --- |
| Konversi | 1 pak = 12 pcs |
| HPP pcs | Rp2.000 |
| Harga jual pcs | Rp3.000 |
| Harga jual pak lama | Rp32.400 |
| Faktor pak hasil migrasi | 0,9, ditampilkan sebagai diskon 10% |
| HPP pak otomatis | Rp24.000 |
| Harga pak setelah pcs menjadi Rp3.500 | Rp37.800 |

Harga lama di atas harga perkalian menghasilkan faktor lebih dari 1 dan ditampilkan sebagai penambahan persentase. Harga pengikut nol dengan harga acuan positif menghasilkan faktor nol. Diskon dibatasi hingga 100%; faktor negatif ditolak.

Perubahan HPP hanya memperbarui HPP pengikut. Perubahan harga jual hanya memperbarui harga jual pengikut. Perubahan konversi memperbarui keduanya dengan faktor penyesuaian yang sama.

## 6. Migrasi grup lama

1. Jalankan pratinjau tanpa penulisan: jumlah grup, acuan yang ditemukan, hasil HPP, dan alasan peninjauan.
2. Untuk grup valid, tandai seluruh pengikut sebagai AUTO dan hitung faktor dari harga jual lama dibagi harga acuan dikali konversi saat migrasi.
3. Simpan harga jual lama persis sebagaimana tersimpan. HPP pengikut dihitung ulang dari HPP acuan bila tersedia; perubahan HPP dicatat sebagai dampak migrasi.
4. Jika faktor belum dapat dihitung, simpan harga lama dan status peninjauan. Jangan membuat faktor 1 untuk menggantikan harga lama.
5. Jika hanya HPP acuan yang kosong, harga jual yang valid tetap dapat mengikuti rumus, sedangkan HPP lama ditahan dan diberi penjelasan.
6. Migrasi ulang melewati konfigurasi yang sudah diinisialisasi; faktor tidak berubah akibat harga acuan yang telah diperbarui sejak migrasi pertama.
7. Saat data yang tertunda diperbaiki, faktor pertama dihitung untuk mempertahankan harga jual yang masih tersimpan, lalu hubungan otomatis aktif untuk perubahan berikutnya.

Migrasi berlaku lintas toko dengan pembatasan per toko dan grup. Setiap grup diproses dalam transaksi tersendiri. Eksekusi migrasi pada database pengguna dilakukan pada tahap penerapan yang disetujui, setelah pratinjau dan pengujian tersedia.

## 7. Alur pembaruan

### Mengubah acuan atau konversi

- Klien meminta pratinjau hasil dan perubahan semua satuan terkait.
- Server memvalidasi izin, toko, keanggotaan, angka, dan versi konfigurasi.
- Transaksi mengunci grup dan anggota dengan urutan ID yang konsisten, membaca ulang data, menghitung hasil, lalu menyimpan perubahan dan riwayat.
- Jika versi berubah sejak pratinjau, tampilkan konflik dalam bahasa Indonesia dan minta pengguna memuat pratinjau terbaru.
- Cache katalog dan grup diperbarui setelah commit berhasil.

### Menambah satuan

- Default AUTO dengan faktor 1, HPP dan harga dihitung dari acuan.
- Pengguna dapat mengatur diskon/penambahan persentase atau memilih Manual sebelum menyimpan.
- Satuan baru menggunakan stok bersama; operasi harga tidak menambah persediaan.

### Berganti mode

- AUTO ke MANUAL: nilai terakhir menjadi nilai awal yang dapat diedit.
- MANUAL ke AUTO: hitung faktor dari harga jual saat itu agar harga tidak melonjak ketika mode diaktifkan; HPP mengikuti acuan setelah pratinjau disimpan.
- Jika faktor belum bisa dibentuk, pertahankan nilai dan minta penyelesaian data acuan.

### Mengganti atau menghapus produk acuan

- Penggantian acuan harus menampilkan dampak sebelum penyimpanan.
- Faktor dibentuk kembali terhadap acuan baru dengan mempertahankan harga jual yang sedang berlaku; perubahan harga selanjutnya mengikuti acuan baru.
- Penghapusan, pemindahan grup, atau penonaktifan acuan memerlukan pengganti yang valid atau menempatkan grup dalam status Perlu ditinjau. Tidak ada pemilihan pengganti secara diam-diam.

### Jalur penulisan lain

- Endpoint produk, edit harga grup, import, penambahan/pemindahan anggota, dan perubahan konversi mengarah ke layanan domain yang sama.
- Perubahan harga jual pengikut AUTO melalui formulir produk ditafsirkan sebagai perubahan faktor terhadap acuan terkini, dengan penjelasan dan pratinjau.
- HPP pengikut AUTO tidak dapat ditulis bebas; formulir menawarkan perubahan HPP acuan atau mode Manual.
- Import harus memperlihatkan harga dan HPP efektif pada pratinjau. Harga jual pengikut yang disediakan menjadi faktor, sedangkan konflik HPP pengikut ditampilkan untuk diselesaikan sebelum commit. Urutan baris import tidak memengaruhi hasil: sumber dan anggota dihimpun per grup sebelum perhitungan.
- Perubahan HPP master yang memang dilakukan alur penerimaan atau pembelian harus memanggil layanan sinkronisasi. Fitur ini tidak menganggap pencatatan harga supplier pada dokumen sebagai instruksi otomatis mengganti HPP master atau harga jual acuan.
- Harga Agen/Dinas dan Harga Khusus tetap memiliki aturan pemilihan tersendiri. Fitur ini mengatur HPP dan harga jual normal produk yang menjadi masukan bagi alur tersebut; tidak membuat rumus diskon baru untuk harga member.

## 8. Pengalaman pengguna

Tab Harga pada workspace grup menampilkan:

- Produk/satuan acuan yang jelas beserta HPP dan harga jualnya.
- Mode Otomatis atau Manual untuk setiap pengikut.
- Pengaturan Tanpa penyesuaian, Diskon, atau Penambahan harga.
- Nilai HPP dan harga hasil hitung serta rumus dengan angka aktual.
- Pratinjau sebelum dan sesudah, termasuk margin negatif, sebelum penyimpanan.
- Status Perlu ditinjau dengan alasan dan tindakan perbaikan spesifik.
- Riwayat yang menjelaskan perubahan acuan, faktor, konversi, mode, dan harga hasil hitung.

Kontrol angka memiliki label yang dapat dibaca pembaca layar, status tidak dibedakan hanya dengan warna, seluruh tindakan dapat dijalankan memakai keyboard, dan pratinjau tetap terbaca pada ponsel.

## 9. Batas tanggung jawab dan konsistensi

- Layanan kalkulasi murni menerima data grup dan konfigurasi, lalu menghasilkan harga, HPP, dan alasan peninjauan tanpa akses database.
- Layanan transaksi memvalidasi lingkup toko, mengambil kunci, memanggil kalkulasi, menyimpan hasil, dan menulis audit.
- UI menampilkan pratinjau server dan mengirim perubahan konfigurasi; hasil hitung klien tidak menjadi sumber kebenaran.
- Tidak ada dependensi harga berantai antarpengikut, sehingga konfigurasi tidak membentuk siklus.
- Snapshot transaksi dan penerimaan yang sudah tercatat tetap menggambarkan nilai ketika dokumen tersebut dibuat.
- Nilai yang melampaui kapasitas kolom uang ditolak sebelum commit; kegagalan salah satu penulisan membatalkan seluruh pembaruan grup.

## 10. Pengujian dan kriteria selesai

Gunakan TDD: tulis dan jalankan tes yang gagal sebelum mengimplementasikan perilakunya.

- Kalkulasi: contoh Snowman, faktor lebih dari 1, diskon 100%, nol, HPP kosong, konversi pecahan, dan pembulatan uang.
- Migrasi: harga jual lama identik, HPP mengikuti acuan, acuan ambigu, konversi perlu ditinjau, harga acuan nol, serta eksekusi ulang tanpa pergeseran faktor.
- Sinkronisasi: perubahan HPP, harga, konversi, mode, sumber, dan anggota grup.
- Integrasi: endpoint produk/grup, import yang urutan barisnya berbeda, dan setiap penulis HPP master yang ditemukan dalam analisis dampak.
- Transaksi: rollback, lintas toko, izin, pembaruan bersamaan, dan konflik versi setelah pratinjau.
- UI: pratinjau, pesan peninjauan, pergantian mode, keyboard, serta tampilan ponsel.
- Regresi: harga checkout dan katalog, snapshot transaksi, harga khusus/member, dan stok bersama.
- Jalankan lint dan pemeriksaan tipe yang sesuai; jangan menjalankan production build atau mengubah siklus hidup server development.

## 11. Dokumentasi dan catatan rilis saat implementasi

- Perbarui dokumen ini sesuai hasil implementasi.
- Perbarui `HelpContent.tsx` untuk alur acuan, mode, penyesuaian, dan peninjauan.
- Perbarui `workflow-catalog.ts` untuk panduan grup yang berubah.
- Tambahkan catatan perubahan dengan tanggal penerapan sebenarnya dalam WIB, ID stabil, revision, ringkasan popup, tautan fitur, dan tepat tiga langkah penggunaan.
- Gunakan screenshot nyata dengan data contoh bila tersedia; alternatifnya ilustrasi yang dilabeli dengan benar.

## 12. Catatan eksekusi desain

- Rancangan inti disetujui di chat pada 2026-10-24.
- Dokumen disimpan di `C:\Projects\pos-system-monorepo\markdown-files` karena drive D: dan lokasi dokumentasi D: yang disebut dalam instruksi tidak tersedia pada sesi ini.
- GitNexus MCP tidak tersedia. CLI dapat dijalankan, tetapi pencarian terdegradasi karena indeks FTS tidak tersedia; pemeriksaan source dilakukan dengan keluaran yang dibatasi.
- Headroom MCP dipanggil; statistik dan kompresi tersedia, tetapi proxy kompresi terkonfigurasi tidak dapat dihubungi.
- Ada perubahan lokal yang sudah ada di komponen grup; implementasi harus mempertahankannya dan memeriksa dampak sebelum mengedit simbol.
- Catatan historis saat tahap desain: saat itu baru spesifikasi yang dihasilkan. Implementasi aplikasi dan bukti pengujian berikutnya tercatat pada bagian status akhir dan dokumen implementasi; migrasi database pengguna belum dijalankan.

## Hasil implementasi

Domain eksak, konfigurasi JSON, service transaksi, seluruh writer produk/impor/pembelian, preview/apply versi dan ledger harga telah diterapkan. Editor produk memakai aksi harga terpisah setelah detail disimpan. Satuan baru default Auto faktor 1 dengan pilihan Manual/penyesuaian sebelum create.

Keputusan final, contoh nol/null, equal-HPP no-op pembelian, urutan deployment aplikasi/worker dan bukti verifikasi tersedia pada [dokumen implementasi](harga-otomatis-grup-satuan-implementation-2026-10-24.md). Lampirannya mempertahankan seluruh keputusan beserta alasan dan biaya.
