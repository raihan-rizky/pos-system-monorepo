# Jenis Pelanggan saat Menambahkan Pelanggan di Kasir

Tanggal: 2026-11-14

## Alur

Saat memilih **Tambah pelanggan baru** dari modal Pembayaran, isi nama dan nomor WhatsApp bila tersedia, lalu pilih jenis pelanggan. Pilihan yang tersedia adalah UMUM, AGEN, INDUSTRI, dan PEMERINTAH; nilai awalnya UMUM.

Jenis yang dipilih dipakai untuk menghitung harga checkout dan disimpan bersama profil saat transaksi diselesaikan. Pelanggan lama tetap menggunakan jenis yang tercatat pada profilnya.

## Data dan migrasi

Skema pelanggan sudah memiliki kolom `Customer.type` dengan enum `CustomerType` dan nilai default `UMUM`. Karena itu perubahan ini tidak memerlukan migrasi basis data.
