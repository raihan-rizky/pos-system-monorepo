# Nominal Pembayaran di Riwayat Transaksi

## Intent

Pengguna dapat mengenali nominal yang dibayar melalui setiap metode langsung dari halaman Riwayat Transaksi, termasuk transaksi satu metode dan multipayment.

## Scope

- Tampilkan setiap pembayaran sebagai badge `METODE · Rp jumlah` di tabel desktop dan kartu mobile.
- Gunakan data `payments` yang sudah dikirim API; fallback ke `paymentMethod` dan `amountPaid` untuk transaksi lama atau transaksi tanpa baris pembayaran.
- Format Rupiah memakai locale `id-ID` tanpa angka desimal.

## Approaches

1. Memperluas badge pembayaran yang sudah ada (dipilih): perubahan kecil, konsisten di dua layout, dan mudah dipindai.
2. Menambah ringkasan nominal terpisah: lebih longgar untuk banyak metode, tetapi menambah tinggi baris dan mengubah struktur tabel.

## Design direction

Industrial utilitarian dengan aksen warna metode yang sudah ada. Anchor visualnya adalah nominal tebal yang menempel pada badge metode, sehingga mata dapat memindai `QRIS · Rp 15.000` tanpa membuka detail transaksi. DFII: 12.

## Constraints

- Teks antarmuka tetap dalam Bahasa Indonesia.
- Tidak menambah dependensi atau mengubah kontrak API.
- Akses keyboard, kontras, dan layout responsif harus dipertahankan.
