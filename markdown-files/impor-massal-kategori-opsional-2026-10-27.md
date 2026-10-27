# Kategori opsional pada impor produk dan stok massal

Tanggal implementasi: 2026-10-27 (Asia/Jakarta).
Tanggal rilis: 2026-10-28 (Asia/Jakarta).

## Perubahan untuk pengguna

Kedua impor CSV/XLSX menerima berkas tanpa kolom kategori, termasuk berkas
yang masih memiliki kolom kategori tetapi selnya kosong.

| Impor | Kolom wajib | Perlakuan kategori |
| --- | --- | --- |
| Produk massal | `name`, `sku`, `price`, `unit` | Opsional; kategori yang diisi tetap dipakai. |
| Stok massal | `name`, `unit`, `stock` | Tidak dipakai untuk pencocokan; kolom lama tetap diterima. |

Nama header Indonesia yang sudah didukung, seperti Nama Produk/Nama Item,
Satuan, dan Stok, tetap bisa digunakan. Batas berkas tetap 5 MB dan 3.000 baris.

## Impor produk

- Tanpa kategori, SKU produk lama dengan nama yang cocok diprioritaskan. Kategorinya diwarisi saat
  pratinjau dan diperiksa kembali sebelum rencana penyimpanan dibuat.
- Kecocokan nama dan satuan yang jelas tetap mengenali produk lama. Satuan
  baru dapat terhubung ke grup stok produk yang kategorinya sudah diketahui.
- Produk baru tanpa kecocokan masuk ke **Tanpa Kategori**. Kategori bawaan
  dibuat dengan upsert atau digunakan kembali, termasuk ketika opsi membuat
  kategori baru tidak dicentang.
- SKU yang sudah digunakan oleh nama produk lain tetap memerlukan keputusan.
  Memilih membuat produk baru menghasilkan SKU baru dan kategori bawaan untuk
  produk tanpa kecocokan, tanpa mewarisi kategori dari pemilik SKU lama.
- Kategori baru yang ditulis secara eksplisit tetap memerlukan opsi membuat
  kategori baru seperti sebelumnya.
- Jika nama/satuan cocok dengan beberapa produk dan SKU tidak menentukan
  produk, pratinjau meminta keputusan. Pengguna dapat mengisi kategori pada
  berkas, membuat produk baru, atau melewati baris.
- Perhitungan ulang pratinjau tetap membawa kandidat tanpa kategori agar
  konflik tidak hilang ketika keputusan baris lain berubah.
- Kandidat tanpa kategori diambil dari toko aktif sebelum normalisasi nama.
  Singkatan, spasi ganda, serta perbedaan huruf besar/kecil pada nama tersimpan
  tetap diperiksa secara konsisten di pratinjau dan penyimpanan.
- Penanda `categoryProvided` membedakan kategori yang diisi pengguna dari
  kategori yang diwarisi atau ditentukan otomatis.

## Impor stok

- Pencocokan memakai nama produk dan satuan, dengan normalisasi huruf besar,
  huruf kecil, serta spasi di awal/akhir seperti sebelumnya.
- Kategori di berkas tidak menyaring kandidat. Nama dan satuan yang sama di
  kategori berbeda tetap membutuhkan pilihan produk di pratinjau.
- Pratinjau menampilkan kategori dari produk yang cocok/dipilih.
- Pilihan produk divalidasi kembali terhadap nama dan satuan saat penyimpanan.
  Pilihan yang sudah tidak cocok tidak dapat diproses.
- Produk yang tidak ditemukan tetap dilewati. Mode tambah dan set stok,
  validasi stok negatif, izin, lingkup toko, dan riwayat tetap mengikuti alur
  yang sudah ada.
- API penyimpanan langsung dan antrean worker menerima kategori yang hilang
  atau kosong.

## Petunjuk dan pengumuman

- Petunjuk pada drawer impor produk dan stok diperbarui.
- Bantuan untuk Owner, Admin, dan Inventaris mengikuti aturan kolom baru.
- Workflow `bulk-product-import` di katalog AI Assistant diperbarui.
- Catatan Perubahan `bulk-import-optional-category`, revisi 1, menggunakan
  tanggal rilis WIB 2026-10-28 dan ilustrasi kategori yang tersedia.

## Verifikasi

Tes regresi mencakup pemetaan kolom, normalisasi, pemilihan produk ambigu,
validasi API langsung/antrean, kategori bawaan, kategori produk lama,
penyimpanan per chunk, dan perhitungan ulang pratinjau.

Tes perilaku tanpa kategori dijalankan dan dipastikan gagal sebelum perubahan
implementasi, termasuk regresi konflik SKU serta kandidat nama tersimpan.

Hasil verifikasi:

- Regresi impor produk, impor stok, API, dan Catatan Perubahan: **389 tes lulus
  pada 56 berkas**.
- ESLint langsung pada 17 berkas produksi dan 13 berkas tes yang diubah:
  **lulus tanpa temuan**.
- `pnpm --filter @pos/web exec tsc --noEmit --incremental false`:
  **lulus, kode keluar 0**.
- Pemeriksaan whitespace melalui `git diff --check`: **lulus**.
- Tinjauan kode independen selesai. Temuan pencarian kandidat pada perhitungan
  ulang pratinjau dan penyimpanan telah diperbaiki dan ditinjau kembali.

Log pemeriksaan disimpan di `output/category-optional-import-2026-10-27/`.

### Tambahan skenario sebelum publikasi

Empat berkas tes baru menambahkan **28 skenario**:

- API pratinjau CSV dan XLSX: kategori hilang/kosong/berisi, kategori produk
  lama, pemetaan header khusus, kolom satuan yang tetap wajib, dan penanda
  kategori saat perhitungan ulang JSON.
- Resolver produk: urutan kandidat, SKU yang menentukan kategori, produk
  ambigu pada kategori yang sama, pemilihan satuan, serta grup satuan baru
  dari berkas tanpa kategori.
- Penyimpanan produk: tiga chunk terpisah dan baris yang dilewati tanpa
  membuat produk maupun kategori bawaan.
- Stok: akumulasi ADD, nilai terakhir SET, produk bernama sama yang dipilih
  terpisah, serta penolakan pilihan produk yang sudah tidak cocok.

Baseline `origin/main` lulus 50 tes. Sebelum perubahan fitur diterapkan,
26 dari 28 skenario tambahan gagal sesuai kontrak kategori opsional yang
belum tersedia. Setelah fitur diterapkan, seluruh 28 skenario lulus.
Tes API menjalankan parser dan resolver asli dengan database in-memory.

Publikasi disiapkan dari `origin/main` pada checkout terpisah. Pemeriksaan
GitNexus `detect_changes` dijalankan pada staging dan perbandingan terhadap
`origin/main`: 31 berkas dalam lingkup perubahan yang diharapkan. Indeks yang
lama tetap dilengkapi dengan penelusuran sumber dan tinjauan kode independen.

## Catatan lingkungan

- Repositori aktif berada di `C:\Projects\pos-system-monorepo`. Drive `D:`
  dan lokasi dokumentasi lama pada panduan tidak tersedia; dokumentasi ini
  disimpan di direktori `markdown-files` repositori aktif.
- Headroom stats/compress telah dipanggil. Proxy kompresi tidak terjangkau;
  pemeriksaan berikutnya memakai keluaran yang dibatasi.
- Indeks GitNexus lama digunakan untuk impact analysis. Pembaruan indeks
  gagal saat worker mulai; pemanggil saat ini juga ditelusuri dari sumber.
  `previewImportGroupPricing` belum tercakup dalam indeks lama dan dipakai
  oleh API pratinjau produk, termasuk perhitungan ulang keputusan.
- `pnpm type-check` ternyata memicu build lewat dependensi task Turbo.
  Proses pemeriksaan tersebut dihentikan. Pemeriksaan TypeScript dilanjutkan
  dengan `tsc --noEmit` langsung tanpa task build. Server dev tidak dimulai
  atau dihentikan oleh sesi ini.
- Browser DevTools tidak dapat terhubung untuk pemeriksaan visual langsung.
  Tes komponen impor stok dan API tercakup dalam regresi di atas.
