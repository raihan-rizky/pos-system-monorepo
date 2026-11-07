# Nominal Pembayaran di Riwayat Transaksi — 2026-11-05

## Ringkasan

Halaman Riwayat Transaksi sekarang menampilkan metode dan nominal pada setiap badge pembayaran. Contoh: `QRIS · Rp 15.000` dan `CASH · Rp 1.000`.

## Perilaku

- Transaksi satu metode memakai nominal pembayaran yang tersimpan; transaksi lama memakai `amountPaid` sebagai fallback.
- Multipayment menampilkan satu badge untuk setiap metode beserta nominalnya.
- Format Rupiah memakai pemisah Indonesia tanpa desimal untuk nilai bulat.
- Tampilan berlaku di tabel desktop dan kartu mobile.

## Cara menggunakan

1. Buka menu **Operasi > Riwayat**.
2. Cari invoice atau pelanggan pada pencarian atau filter.
3. Baca badge metode dan nominal pada kolom Pembayaran atau kartu transaksi.
