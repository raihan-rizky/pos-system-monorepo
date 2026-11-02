# Desain pemasukan manual dan belanja transfer

Tanggal: 2026-11-02 (Asia/Jakarta)

Status: rancangan percakapan disetujui; spesifikasi ini menunggu tinjauan pengguna sebelum penyusunan rencana implementasi.

## 1. Tujuan dan keputusan pengguna

Tambahkan dua tombol di halaman **Keuangan** untuk mencatat uang masuk tanpa transaksi dan pengeluaran belanja melalui transfer. Data tersimpan di aplikasi dan otomatis disertakan ketika laporan Excel bulanan diunduh.

Keputusan yang sudah disetujui:

- Pemasukan manual memakai empat isian: tanggal, keterangan/sumber, nominal, dan kategori RC.
- Pilihan kategori pemasukan: **ATK, Cetak, Spanduk, Print, Stempel**.
- Belanja transfer merupakan pencatatan keuangan saja.
- Form belanja transfer berisi tanggal transfer, nama penerima/pemasok, keterangan, nominal, serta bukti transfer opsional.
- Kedua jenis catatan dapat dilihat, diubah, dan dihapus sesuai izin pengguna.
- Pemasukan masuk ke sheet `RC {BULAN}`; belanja transfer masuk ke bagian **VIA TRANSFER** pada sheet `PENGELUARAN BELANJA`.
- Catatan ikut memperbarui ringkasan dan arus kas; pengeluaran yang tampil di beberapa sheet tetap dihitung sekali.
- Pengguna menyetujui penyimpanan dokumentasi di `C:\Projects\pos-system-monorepo\markdown-files`, karena lokasi D: dalam AGENTS.md tidak tersedia pada komputer ini.

File Excel yang sudah diunduh merupakan salinan data pada saat ekspor. Pengguna mengunduh ulang laporan untuk mengambil catatan atau koreksi terbaru.

## 2. Pendekatan

Gunakan penyimpanan khusus untuk pemasukan manual dan perluas `Expense` dengan penanda belanja transfer manual. Pertahankan pembentuk workbook bulanan sebagai satu pintu ekspor dari data laporan yang telah dinormalisasi.

Pendekatan ini mengikuti struktur aplikasi: pengeluaran sudah mempunyai penyimpanan, daftar, lampiran, ringkasan, dan penghapusan lunak; pemasukan manual memerlukan penyimpanan tersendiri. Tidak diperlukan buku kas baru yang menggantikan seluruh pencatatan keuangan.

Pada antarmuka digunakan dua tombol langsung. Alternatif satu tombol dengan pilihan jenis catatan menghemat ruang, tetapi menambah langkah sebelum mengisi form. Pengguna menyetujui pilihan dua tombol.

## 3. Antarmuka Keuangan

### 3.1 Tombol dan form

Tambahkan **Tambah Pemasukan** pada bagian Pemasukan dan **Tambah Belanja Transfer** pada bagian Pengeluaran. Tombol pengeluaran biasa tetap tersedia. Tombol mengikuti izin create dari resource masing-masing.

Modal **Tambah Pemasukan** berisi:

| Isian | Aturan |
| --- | --- |
| Tanggal | Wajib; tanggal penerimaan uang; default hari ini WIB |
| Keterangan / sumber | Wajib; teks setelah trim 1–500 karakter |
| Nominal | Wajib; nilai rupiah positif |
| Kategori RC | Wajib; ATK, Cetak, Spanduk, Print, atau Stempel |

Modal **Tambah Belanja Transfer** berisi:

| Isian | Aturan |
| --- | --- |
| Tanggal transfer | Wajib; default hari ini WIB |
| Nama penerima / pemasok | Wajib; teks setelah trim 1–100 karakter |
| Keterangan belanja | Wajib; teks setelah trim 1–500 karakter |
| Nominal transfer | Wajib; nilai rupiah positif |
| Bukti transfer | Opsional; memakai komponen dan kebijakan lampiran pengeluaran yang sudah ada |

Metode pembayaran pada form belanja adalah **Transfer**. Kategori internal pengeluaran baru memakai `SUPPLIES`; tidak ditambahkan isian kategori atau kembalian pada form ini. Nominal merupakan uang yang benar-benar ditransfer, sehingga `changeAmount` bernilai nol.

Kedua form mengikuti komponen modal, tombol, format rupiah, dan pola responsif yang tersedia. Gunakan label berbahasa Indonesia, fokus awal yang jelas, navigasi keyboard, pesan kesalahan terkait isian, serta tombol simpan yang menampilkan status proses.

### 3.2 Daftar dan koreksi

Tampilkan daftar **Pemasukan manual** berdasarkan bulan terpilih pada kolom Pemasukan, dengan tanggal, keterangan, kategori, nominal, dan menu Ubah/Hapus. Gunakan paginasi mengikuti pola daftar pengeluaran agar tidak memuat seluruh riwayat sekaligus.

Ringkasan pemasukan menyertakan nilai manual, tetapi jumlah transaksi tetap menghitung transaksi penjualan. Tampilkan jumlah catatan manual secara terpisah. Tautan riwayat transaksi harian tetap menuju transaksi; koreksi pemasukan manual dilakukan melalui daftar manual di Keuangan.

Belanja transfer tampil pada daftar pengeluaran yang ada dengan badge **Belanja transfer manual** dan metode **Transfer**. Menu Ubah membuka form belanja transfer yang sesuai. Jenis sumber ini tetap dianggap catatan manual sehingga tindakan koreksi tidak tersembunyi sebagai pengeluaran otomatis.

Setelah simpan, ubah, atau hapus, muat ulang query daftar, ringkasan pemasukan/pengeluaran, dan arus kas yang terpengaruh. Jika tanggal berpindah bulan, perbarui cache kedua periode. Hapus memerlukan konfirmasi dengan rincian singkat catatan.

### 3.3 Kegagalan

- Form menampilkan kesalahan isian tanpa menutup modal atau mengosongkan data.
- Selama menyimpan, cegah pengiriman berulang dan penutupan modal yang membuang isian.
- Daftar yang gagal dimuat menampilkan pesan dan tindakan Coba lagi; kegagalan tidak ditampilkan sebagai daftar kosong yang sukses.
- Penghapusan yang gagal mempertahankan catatan pada daftar dan menampilkan pesan.
- Pengelolaan bukti transfer mengikuti aturan unggah dan penghapusan lampiran pengeluaran yang tersedia.

## 4. Penyimpanan dan API

### 4.1 Pemasukan manual

Tambahkan model `ManualIncome`, terhubung ke toko dan pengguna pencatat:

- `id`, `storeId`, `recordedById`.
- `occurredAt`, `description`, `category`, `amount`.
- `createdAt`, `updatedAt`, `deletedAt` untuk penghapusan lunak.
- `amount` memakai `Decimal(12, 2)`.
- Kategori disimpan sebagai enum khusus lima nilai: `ATK`, `CETAK`, `SPANDUK`, `PRINT`, `STEMPEL`.
- Indeks mencakup toko, status penghapusan, dan tanggal pencatatan untuk daftar serta agregasi bulanan.

API:

| Endpoint | Tujuan | Izin |
| --- | --- | --- |
| `GET /api/finance/income?month=YYYY-MM&page=N` | Daftar pemasukan manual untuk bulan terpilih | `income.read` |
| `POST /api/finance/income` | Membuat pemasukan manual | `income.create` |
| `PATCH /api/finance/income/[id]` | Mengoreksi catatan manual aktif | `income.update` |
| `DELETE /api/finance/income/[id]` | Menghapus lunak catatan manual aktif | `income.delete` |

Respons daftar mengikuti format paginasi aplikasi. Data memuat pencatat yang relevan untuk riwayat internal. Detail API menggunakan identitas sesi untuk menentukan toko dan pencatat, bukan menerima keduanya dari payload.

### 4.2 Belanja transfer manual

Gunakan satu baris `Expense` per catatan belanja. Tambahkan kolom nullable `manualPurchasePaymentMethod` yang hanya menerima `TRANSFER` untuk catatan dari fitur ini; nilai null berarti jenis pengeluaran sebelumnya.

Pemetaan data:

- `applicantName`: nama penerima/pemasok dari form.
- `description`: keterangan belanja.
- `amount`: nominal transfer; `changeAmount = 0`.
- `category = SUPPLIES`, tanpa `customCategoryId`.
- `occurredAt`: tanggal transfer; `attachmentUrl`: bukti opsional.
- `manualPurchasePaymentMethod = TRANSFER`.
- Referensi ekspor dibuat dari identitas catatan, misalnya `Belanja manual {id}`.

Gunakan endpoint pengeluaran yang sudah ada untuk create, list, update, delete, dan penghapusan lampiran. Validasi penanda secara eksplisit pada server. Catatan manual ini tidak diberi hubungan ke transaksi, pembelian barang, daftar belanja, atau belanja terdahulu. Pengeditan mempertahankan jenis sumbernya. Pengeluaran otomatis tetap mengikuti penjagaan yang sudah ada.

Tambahan kolom bersifat nullable sehingga pengeluaran lama tetap memiliki perilaku semula. Migrasi menambahkan model/enum pemasukan beserta relasinya dan metadata pengeluaran, disertai kebijakan akses database yang mengikuti pola tabel keuangan aplikasi.

## 5. Izin, validasi, dan batas data

- Tetapkan izin default `income.create` dan `income.update` untuk Owner, Admin, dan Cashier; `income.delete` untuk Owner dan Admin, selaras pola pengeluaran. Override RBAC yang telah dikonfigurasi tetap dihormati.
- Belanja transfer memakai izin `expense.create/update/delete`; lampiran mengikuti izin pengeluaran dan izin penghapusan bukti yang tersedia.
- Setiap baca, ubah, hapus, ringkasan, dan ekspor dibatasi `storeId` pengguna; pengguna tanpa toko ditolak.
- Tanggal harus merupakan tanggal kalender yang valid, dalam lima tahun terakhir, sampai hari ini berdasarkan Asia/Jakarta. Tolak tanggal mendatang dan format yang tidak sah pada server serta form.
- Nominal harus finite, lebih besar dari nol, paling banyak dua angka desimal, dan muat dalam `Decimal(12, 2)`. Nilai negatif, nol, NaN, infinity, atau nilai melewati kapasitas ditolak.
- Kategori pemasukan harus salah satu dari lima nilai yang tersedia. Klien tidak dapat mengirim kategori bebas, `PLAT`, atau `UNMAPPED` untuk pemasukan manual ini.
- Catatan yang sudah dihapus tidak tampil dalam daftar, ringkasan, grafik, atau ekspor.
- Registri reset database harus mengenali tabel pemasukan manual sebagai data keuangan toko, mengikuti pilihan reset yang sudah ada.

Pemasukan manual tidak membuat transaksi POS, piutang, catatan pembayaran transaksi, aktivitas shift, atau pergerakan stok. Belanja transfer pada fitur ini tidak membuat penerimaan barang maupun hutang pemasok. Ini mengikuti keputusan pengguna bahwa fitur merupakan pencatatan keuangan.

## 6. Ringkasan dan aliran data

Alur pemasukan: form → API dengan validasi/izin → `ManualIncome` → daftar dan agregasi Keuangan → pembentuk laporan bulanan → workbook.

Alur belanja transfer: form → API pengeluaran → satu baris `Expense` dengan metadata transfer → ringkasan pengeluaran dan laporan bulanan → RP serta rincian Pengeluaran Belanja.

Perbarui `income/summary` agar nominal dan bucket harian menyertakan pemasukan manual aktif. Perbarui `expenses/summary` agar nilai pemasukan yang dipakai pada Net Cash Flow menyertakan tambahan yang sama. Jumlah transaksi dan jumlah catatan manual dibedakan dalam kontrak respons.

Kontribusi catatan manual dihitung berdasarkan `occurredAt` dengan awal periode inklusif dan akhir periode eksklusif pada WIB. Pencatatan hari pertama bulan pada pukul 00:00 WIB tidak bergeser ke bulan sebelumnya karena konversi UTC.

Perhitungan transaksi penjualan yang sudah ada tetap mengikuti kontrak masing-masing ringkasan dan laporan. Perubahan ini menambahkan kontribusi catatan manual secara konsisten; penyelarasan seluruh perbedaan historis antara ringkasan transaksi dan laporan berbasis ledger berada di luar ruang lingkup fitur.

## 7. Excel bulanan

### 7.1 Sheet RC

`getMonthlyFinancialReport` mengambil pemasukan manual aktif pada toko dan periode yang diminta. `buildMonthlyReport` menormalisasi setiap catatan menjadi satu `MonthlyIncome` dengan identitas sumber yang unik, tanggal penerimaan, referensi manual, keterangan, dan nominal pada tepat satu kelompok kategori.

Nominal masuk seluruhnya ke kolom kategori terpilih. Kolom kategori lainnya bernilai nol. Gunakan struktur `IncomeGroup` yang tersedia pada workbook. Keterangan dan referensi mengikuti pola komentar pada sel tanggal yang sudah ada.

Rumus RC, rekap harian, BERSIH, dan LAP KEU mengambil tambahan nominal dari sumber laporan yang sama sehingga total pendapatan ikut diperbarui tanpa menambahkan jalur total terpisah.

### 7.2 Sheet Pengeluaran Belanja

Normalisasi satu pengeluaran belanja transfer menjadi satu `MonthlyExpense` dengan metadata `purchase`: metode `TRANSFER`, referensi manual, nama penerima/pemasok, dan `dueDate = null`.

Pengeluaran tersebut tampil pada:

1. Sheet `RP {BULAN}` sebagai satu pengeluaran.
2. Sheet `PENGELUARAN BELANJA`, bagian **VIA TRANSFER**, sebagai rincian dari pengeluaran yang sama.
3. Rekap harian, BERSIH, dan LAP KEU melalui total RP yang sudah ada.

Gunakan kelompok laporan `OTHER` mengikuti normalisasi pengeluaran manual saat ini. Rincian belanja merupakan tampilan tambahan dari sumber yang sama dan tidak dijumlahkan lagi ke total pengeluaran. Pemilihan kategori belanja untuk kolom Cetak/Plat, Spanduk, atau ATK pada rekap pengeluaran tidak ditambahkan dalam fitur ini.

Sheet, rumus, dan alur pengunduhan yang sudah ada dipakai kembali. Jurnal transaksi tetap berisi transaksi; kebutuhan utama fitur ini adalah laporan Excel bulanan delapan sheet.

## 8. Dokumentasi pengguna dan catatan perubahan

Pada implementasi, perbarui:

- Bantuan pada `apps/web/features/help-documentation/components/HelpContent.tsx` untuk kedua form, koreksi catatan, dan pengunduhan ulang Excel.
- Panduan AI Assistant terkait Keuangan serta `workflows/workflow-catalog.ts` dengan workflow sesuai izin untuk kedua tindakan.
- Panduan sheet pada workbook bila perlu untuk menerangkan sumber pemasukan dan belanja manual.
- Catatan Perubahan dalam `apps/web/features/changelog/data/changelog.ts` dengan tanggal rilis aktual WIB, id stabil, revision, highlight ringkas, route Keuangan, dan tepat tiga langkah penggunaan. Gunakan ilustrasi yang akurat atau screenshot yang sudah dipastikan tidak memuat data sensitif.
- Dokumentasi fitur pada folder `markdown-files` di repo aktif, dengan nama berakhiran tanggal.

## 9. Pengujian dan penerimaan

Ikuti TDD: tulis pengujian perilaku, jalankan sampai gagal dengan penyebab yang sesuai, kemudian implementasikan hingga lulus. Sebelum mengubah simbol yang sudah ada, jalankan analisis impact GitNexus dan laporkan pemanggil, alur terdampak, dan risikonya.

Pengujian yang diperlukan:

1. Validasi form/API: isian wajib, lima kategori RC, nominal, tanggal kalender, serta batas tanggal WIB.
2. CRUD dan isolasi toko: create/list/update/delete, akses tanpa izin, catatan toko lain, dan pengecualian catatan terhapus.
3. Penyimpanan belanja transfer: hanya satu `Expense`, penanda transfer tersimpan, penerima/bukti terbaca kembali, kembalian nol, dan penjagaan sumber otomatis tetap bekerja.
4. Ringkasan: pemasukan manual mengubah nominal harian/bulanan serta Net Cash Flow; jumlah transaksi tetap terpisah; koreksi tanggal/kategori/nominal dan penghapusan memperbarui hasil.
5. Laporan bulanan: pemasukan masuk tepat satu kategori RC; pengeluaran transfer mempunyai metadata purchase; batas awal/akhir bulan dan toko yang dipilih diterapkan.
6. Workbook: baca kembali workbook hasil builder untuk memeriksa nilai/rumus RC, bagian VIA TRANSFER, RP, rekap harian, BERSIH, dan LAP KEU. Verifikasi satu belanja tidak mengurangi kas dua kali.
7. Antarmuka: kedua tombol, empat field pemasukan, field belanja dan bukti opsional, pesan kesalahan, pencegahan klik simpan berulang, koreksi/hapus, keyboard, dan tata letak ponsel.
8. Regresi terarah: pengeluaran biasa/otomatis, transaksi dan pembayaran piutang pada laporan, RBAC, workflow, dokumentasi, serta registri reset keuangan.

Contoh penerimaan menggunakan data sintetis: pemasukan manual ATK Rp100.000 dan belanja transfer Rp25.000 pada hari yang sama menambah RC ATK Rp100.000, menambah rincian transfer/RP Rp25.000, serta memberi kontribusi bersih Rp75.000. Mengubah pemasukan ke Cetak memindahkan kolom RC tanpa menambah total; menghapus kedua catatan menghilangkan seluruh kontribusi manual tersebut.

Jalankan pemeriksaan TypeScript dan lint yang relevan. Verifikasi browser memakai server yang tersedia atau harness yang mengikuti kebijakan repo. Pengguna mengelola lifecycle server; jangan menjalankan production build dalam sesi agen.

## 10. Batas pekerjaan dan keadaan saat spesifikasi ditulis

Checkout memiliki perubahan pekerjaan lain, termasuk beberapa file Keuangan, laporan bulanan, dokumentasi, dan schema Prisma. Implementasi harus membaca versi aktif dan mempertahankan perubahan tersebut.

Pada tahap spesifikasi ini kode aplikasi belum diubah. Tidak ada migrasi database, production build, atau perubahan lifecycle server yang dijalankan. Tinjauan spesifikasi oleh pengguna merupakan gerbang berikutnya sebelum menggunakan skill writing-plans dan memulai tahap implementasi.
