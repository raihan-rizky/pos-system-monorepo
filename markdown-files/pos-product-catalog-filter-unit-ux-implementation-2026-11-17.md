# Filter Katalog dan Penanda Satuan POS

Tanggal: 2026-11-17 (WIB)

## Ringkasan

POS memakai dua baris pill untuk memfilter katalog produk: `Semua kategori`, `ATK`, atau `PERCETAKAN` pada baris pertama, lalu subkategori grup aktif pada baris kedua. Baris subkategori tetap terlihat dan nonaktif sampai grup dipilih. Mengganti grup membersihkan pilihan subkategori dan mengembalikan hasil ke halaman pertama.

PERCETAKAN menyediakan lima subkategori: PLAT, PRINT, STEMPEL, CETAK, dan SPANDUK. Seed dan migrasi idempoten menambahkan CETAK serta SPANDUK tanpa mengubah klasifikasi yang sudah ada.

Chip kategori lama di penjelajahan produk digantikan filter katalog. Filter pencarian, stok tersedia, dan pagination tetap berlaku. Kategori lama produk tetap dipakai untuk penyuntingan data dan menjadi sumber klasifikasi cadangan bila `catalogSubcategoryId` belum diisi.

Setiap baris produk di keranjang menampilkan lencana **Satuan dipilih** beserta nama unit aktif. Produk dengan beberapa unit tetap memakai kontrol **Ubah satuan**.

## Data dan perilaku offline

- API produk menggabungkan hasil pencarian dan filter klasifikasi agar parameter search tetap berlaku bersama grup atau subkategori.
- Klasifikasi eksplisit pada produk mengalahkan pemetaan subkategori kategori lama. Pemetaan kategori dipakai saat klasifikasi eksplisit kosong.
- Snapshot POS awal dan snapshot offline menyertakan relasi subkategori kategori lama. Saat jaringan tidak tersedia, filter grup/subkategori dan pencarian unit menerapkan aturan klasifikasi yang sama pada katalog tersimpan.
- Perubahan menggunakan izin `product.read` dan relasi klasifikasi yang sudah ada; tidak menambah izin atau dependensi. Migrasi idempoten hanya menambahkan dua subkategori default baru.

## Bantuan dan catatan perubahan

Panduan **Memproses Penjualan (POS)** menjelaskan kedua baris pill, lima subkategori PERCETAKAN, dan nama unit pada lencana keranjang. Pratinjau panduan menampilkan pill kategori dan subkategori serta satuan terpilih di keranjang. Catatan perubahan bertanggal 2026-11-17 mencantumkan tiga langkah penggunaan.

## Verifikasi terarah

- Filter pill POS, perubahan grup, dan pagination.
- Pencocokan subkategori eksplisit dan pemetaan kategori pada hasil offline.
- Query API produk, snapshot offline, dan data awal POS.
- Tampilan satuan aktif di keranjang dan pratinjau panduan POS.
- Seed dan migrasi subkategori PERCETAKAN.
