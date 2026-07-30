# Desain Prioritas Harga Khusus di Pembayaran

Tanggal: 30 Juli 2026

## Ringkasan

Harga Khusus otomatis menjadi prioritas default di atas Harga Agen dan Harga
Dinas. Pada modal Pembayaran, kasir dapat mengganti prioritas untuk seluruh
transaksi menjadi Harga Agen/Dinas. Harga Khusus transaksi yang dimasukkan
manual tetap menjadi override tertinggi.

## Tujuan

- Memastikan setiap rule Harga Khusus yang cocok menang secara default,
  termasuk rule `ALL` dan rule berdasarkan tipe pelanggan, kategori, unit,
  serta merek.
- Memberikan satu pilihan sederhana kepada kasir untuk mengutamakan Harga
  Agen/Dinas pada seluruh transaksi.
- Menjaga hasil perhitungan harga konsisten antara modal Pembayaran, API,
  draft, dan sinkronisasi transaksi offline.
- Mempertahankan perhitungan final di server agar harga dari browser tidak
  dipercaya secara mentah.

## Di Luar Cakupan

- Pilihan prioritas per item.
- Perubahan struktur rule Harga Khusus atau urutan specificity rule existing.
- Perubahan permission untuk mengedit Harga Khusus transaksi manual.
- Migrasi database atau penyimpanan preference sebagai field transaksi baru.

## Urutan Prioritas

### Mode Harga Khusus

Mode ini menjadi default saat modal Pembayaran dibuka dan setiap kali pelanggan
berubah.

1. Harga Khusus transaksi/manual.
2. Rule Harga Khusus otomatis yang paling cocok.
3. Harga Agen untuk pelanggan `AGEN` atau Harga Dinas untuk pelanggan
   `PEMERINTAH`.
4. Harga Normal.

### Mode Harga Agen/Dinas

Kasir dapat memilih mode ini untuk seluruh transaksi.

1. Harga Khusus transaksi/manual.
2. Harga Agen untuk pelanggan `AGEN` atau Harga Dinas untuk pelanggan
   `PEMERINTAH`.
3. Rule Harga Khusus otomatis yang paling cocok.
4. Harga Normal.

Jika suatu item tidak memiliki Harga Agen/Dinas yang valid, item tersebut tetap
memakai matching Harga Khusus. Pilihan kasir menukar urutan prioritas dan tidak
menonaktifkan fallback.

## Antarmuka Pembayaran

Modal Pembayaran menampilkan bagian **Prioritas Harga** hanya ketika pelanggan
terpilih bertipe `AGEN` atau `PEMERINTAH`. Bagian ini menyediakan dua radio-card:

- **Harga Khusus (Default)**: memakai rule Harga Khusus yang cocok terlebih
  dahulu.
- **Harga Agen/Dinas**: mengutamakan harga member produk dan memakai Harga
  Khusus sebagai fallback.

Teks pendamping menjelaskan bahwa pilihan berlaku untuk seluruh transaksi.
Ringkasan setiap item tetap menampilkan sumber harga final, yaitu Harga Khusus,
Harga Agen, Harga Dinas, atau Harga Normal.

Preference di-reset menjadi Harga Khusus ketika:

- modal Pembayaran dibuka ulang; atau
- pelanggan terpilih berubah.

Reset mencegah pilihan pelanggan sebelumnya terbawa secara tidak sengaja.

## Arsitektur

### Domain pricing

Tambahkan shared type:

```ts
type PricingPreference = "SPECIAL" | "MEMBER";
```

Helper pricing menerima preference dengan default `"SPECIAL"` untuk menjaga
kompatibilitas caller lama. Helper mencari matching Harga Khusus satu kali,
kemudian memilih kandidat harga berdasarkan urutan mode yang aktif.

Urutan specificity Harga Khusus existing tetap dipertahankan:

1. scope paling spesifik;
2. customer-specific di atas `ALL`;
3. unit-specific;
4. brand-specific;
5. rule terbaru sebagai tie-breaker existing.

### Client checkout

`PaymentModal` menyimpan preference lokal dan meneruskannya ke
`priceCartItemsForCheckout`. Harga dan subtotal langsung dihitung ulang ketika
kasir mengganti pilihan.

Payload konfirmasi pembayaran dan simpan draft membawa
`pricingPreference`. Payload offline juga menyimpan preference yang sama agar
pilihan kasir tidak hilang ketika transaksi menunggu sinkronisasi.

### Server

Schema API memvalidasi `pricingPreference` sebagai `"SPECIAL"` atau `"MEMBER"`.
Request lama yang tidak membawa field ini menggunakan default `"SPECIAL"`.

Server mengambil product master, tipe pelanggan, dan rule Harga Khusus aktif,
kemudian menghitung ulang harga dengan helper domain yang sama. Harga item dan
total dari browser tidak dijadikan sumber kebenaran.

Flow berikut menggunakan preference yang sama:

- pembuatan transaksi online;
- penyimpanan draft dari modal Pembayaran; dan
- sinkronisasi transaksi offline.

Tidak diperlukan migrasi database. Sumber harga final sudah dapat ditelusuri
melalui metadata pricing item existing, termasuk ID rule Harga Khusus,
`harga-agen`, atau `harga-dinas`.

## Error Handling

- Jika rule Harga Khusus gagal dimuat di client, modal menampilkan peringatan
  ramah dan preview memakai Harga Agen/Dinas bila tersedia, lalu Harga Normal.
- Server tetap menghitung harga dari data resmi. Kegagalan membaca data pricing
  di server menghasilkan error transaksi dan tidak melakukan commit parsial.
- Preference yang tidak valid ditolak sebagai validation error.
- Jika master harga berubah sebelum transaksi offline disinkronkan, mekanisme
  deteksi perubahan total existing tetap menentukan apakah transaksi perlu
  approval.

## Pengujian TDD

Implementasi dimulai dengan failing tests berikut:

1. Mode default membuat matching Harga Khusus mengalahkan Harga Agen.
2. Mode default membuat matching Harga Khusus mengalahkan Harga Dinas.
3. Rule `ALL` tetap menang secara default untuk pelanggan Agen/Pemerintah.
4. Mode member membuat Harga Agen/Dinas mengalahkan matching Harga Khusus.
5. Mode member fallback ke Harga Khusus ketika harga member kosong atau tidak
   valid.
6. Harga Khusus transaksi/manual tetap mengalahkan kedua mode.
7. Matching kategori, tipe pelanggan, unit, dan merek tidak berubah.
8. Selector hanya tampil untuk pelanggan Agen/Pemerintah, default ke Harga
   Khusus, dan reset ketika pelanggan berubah.
9. API online menghormati preference dan menghitung ulang harga dari server.
10. Draft dan offline sync membawa preference serta menghasilkan priority yang
    sama.
11. Request lama tanpa preference memakai mode Harga Khusus.

Setelah focused tests hijau, validasi dilanjutkan dengan lint dan TypeScript
type-check. Production build tidak dijalankan selama sesi agent.

## Dokumentasi Pengguna

Konten Bantuan diperbarui untuk menjelaskan:

- Harga Khusus menjadi prioritas default;
- kasir dapat memilih Harga Agen/Dinas untuk seluruh transaksi; dan
- harga member akan fallback ke Harga Khusus jika tidak tersedia.

AI Assistant workflow catalog diperbarui dengan urutan dan langkah pemilihan
prioritas yang sama agar panduan prosedural tidak bertentangan dengan aplikasi.

## Kriteria Penerimaan

- Dengan pelanggan Agen, matching Harga Khusus dipakai walaupun produk memiliki
  Harga Agen.
- Dengan pelanggan Pemerintah, matching Harga Khusus dipakai walaupun produk
  memiliki Harga Dinas.
- Kasir dapat memilih Harga Agen/Dinas sekali untuk seluruh transaksi.
- Item tanpa Harga Agen/Dinas tetap memakai matching Harga Khusus.
- Harga Khusus transaksi/manual selalu menjadi harga final tertinggi.
- Preview, subtotal, transaksi online, draft, dan offline sync menghasilkan
  urutan prioritas yang konsisten.
- Dokumentasi Bantuan dan AI Assistant menjelaskan behavior baru.
