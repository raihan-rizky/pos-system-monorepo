# Filter Katalog dan Penanda Satuan POS

Tanggal: 2026-11-16 (WIB)

## Ringkasan

POS kini memakai dua filter berpasangan untuk daftar produk: grup katalog ATK/PERCETAKAN dan subkategori dalam grup tersebut. Kontrol subkategori nonaktif sampai grup dipilih. Saat grup berubah, pilihan subkategori dibersihkan dan hasil kembali ke halaman pertama.

Chip kategori lama di penjelajahan produk digantikan filter katalog. Filter pencarian, stok tersedia, dan pagination tetap berlaku. Kategori lama produk tetap dipakai untuk penyuntingan data dan menjadi sumber klasifikasi cadangan bila `catalogSubcategoryId` belum diisi.

Setiap baris produk di keranjang menampilkan lencana **Satuan dipilih** dengan nama unit aktif. Produk dengan beberapa unit tetap memakai kontrol **Ubah satuan** yang sama, kini dengan label terlihat.

## Data dan perilaku offline

- API produk menggabungkan hasil pencarian dan filter klasifikasi agar parameter search tetap berlaku bersama grup atau subkategori.
- Klasifikasi eksplisit pada produk mengalahkan pemetaan subkategori kategori lama. Pemetaan kategori dipakai saat klasifikasi eksplisit kosong.
- Snapshot POS awal dan snapshot offline menyertakan relasi subkategori kategori lama. Saat jaringan tidak tersedia, filter grup/subkategori dan pencarian unit menerapkan aturan klasifikasi yang sama pada katalog tersimpan.
- Perubahan ini menggunakan izin `product.read` yang sudah ada serta relasi klasifikasi yang tersedia; tidak menambah izin, dependensi, atau migrasi.

## Bantuan dan catatan perubahan

Panduan **Memproses Penjualan (POS)** menjelaskan filter grup/subkategori dan lencana satuan. Pratinjau panduan memiliki target khusus untuk dua dropdown tersebut. Catatan perubahan bertanggal 2026-11-16 mencantumkan tiga langkah penggunaan.

## Verifikasi terarah

- Filter POS, perubahan grup, dan pagination.
- Pencocokan subkategori eksplisit dan pemetaan kategori pada hasil offline.
- Query API produk, snapshot offline, dan data awal POS.
- Tampilan satuan keranjang dan pratinjau panduan POS.
