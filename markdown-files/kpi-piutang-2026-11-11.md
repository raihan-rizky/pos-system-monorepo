# KPI Piutang

Tanggal: 2026-11-11 (WIB)

## Definisi saldo

Piutang adalah sisa transaksi Tempo yang belum lunas ditambah sisa Piutang Manual. Transaksi berstatus DP tidak masuk KPI Piutang; Outstanding DP tetap menjadi KPI terpisah dengan keterangan “Sisa transaksi berstatus DP. Tidak termasuk Tempo atau Piutang Manual.” Saldo memakai jumlah pembayaran terbaru yang tercatat.

## Tanggal acuan

- Dashboard menampilkan saldo sampai hari ini menurut WIB.
- Laporan Keuangan lengkap memakai tanggal akhir rentang laporan.
- Tampilan harian Sales memakai tanggal yang dipilih.
- Pembayaran yang dicatat setelah tanggal acuan tetap mengurangi saldo. Laporan tidak merekonstruksi saldo historis.

## Akses dan lingkup data

- Query dibatasi ke toko pengguna.
- KPI hanya dikirim jika role memiliki izin baca transaksi (`transaction:read`) dan data Pelanggan (`customer:read`); tampilan Sales memakai izin efektif Sales.
- API menerapkan pemeriksaan izin, dan UI menyembunyikan kartu ketika saldo tidak tersedia.
- Fitur memakai izin RBAC yang sudah ada; tidak menambah permission atau migrasi.

## Tampilan

- Dashboard: kartu Piutang dan Outstanding DP tampil terpisah.
- Laporan Keuangan lengkap: kartu Piutang mengikuti tanggal akhir rentang dan izin baca transaksi serta data Pelanggan pada role aktif.
- Lihat sebagai Sales: kartu Piutang mengikuti tanggal pilihan dan izin role Sales.
- Ekspor bulanan tidak menambahkan KPI ini.

Catatan Perubahan memakai ilustrasi keuangan dengan data contoh. Screenshot aman untuk dipublikasikan belum tersedia.
