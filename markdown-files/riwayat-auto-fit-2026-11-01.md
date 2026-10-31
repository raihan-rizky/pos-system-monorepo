# Penyesuaian lebar tabel Riwayat

Tanggal: 2026-11-01 (WIB)

## Penggunaan

- Pada layar komputer, tabel Riwayat Transaksi menyesuaikan lebar area yang tersedia agar semua kolom dan tombol aksi dapat dilihat bersama.
- Lebar dihitung ulang saat ukuran area atau isi tabel berubah. Tombol **Sesuaikan tabel** di atas tabel dapat digunakan untuk menghitung ulang secara manual.
- Pada layar ponsel, transaksi tetap ditampilkan sebagai kartu dengan jumlah item, rincian, dan tindakan masing-masing.

## Catatan implementasi

Tabel diukur berdasarkan lebar isi dan disesuaikan tanpa memperbesar tampilan melebihi ukuran aslinya. Nama pelanggan dan sales yang panjang serta tombol aksi dapat membungkus untuk membantu menjaga ukuran teks. Browser yang tidak mendukung CSS `zoom` memakai transformasi dengan penyesuaian tinggi area tabel.
