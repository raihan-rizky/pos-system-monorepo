# Kartu KPI piutang pada detail pelanggan

Tanggal: 2026-10-20 (Asia/Jakarta)

## Perubahan

Grafik piutang pada modal detail satu pelanggan diganti dengan tiga kartu. Pilihan Rentang Detail 7 Hari, 14 Hari, dan 30 Hari tetap mengatur data; pilihan awal tetap 30 Hari. Produk Teratas tetap ditampilkan.

| Kartu | Definisi |
| --- | --- |
| Piutang Belum Lunas | Sisa saldo saat ini dari transaksi atau piutang manual yang tanggal asalnya berada dalam periode terpilih. Tidak sama dengan seluruh saldo piutang pelanggan. |
| Piutang Dilunasi | Jumlah nilai awal piutang yang mencapai lunas dalam periode terpilih, termasuk piutang yang berasal dari periode sebelumnya. Cicilan yang belum melunasi piutang tidak masuk kartu ini. |
| Rata-rata Waktu Pelunasan | Rata-rata jumlah hari dari tanggal asal sampai tanggal lunas, dihitung per piutang yang lunas dalam periode, bukan rata-rata titik grafik. |

Hari pelunasan pada KPI dihitung sebagai selisih tanggal kalender WIB. Pelunasan pada tanggal yang sama bernilai 0 hari; pembayaran sesaat setelah tengah malam pada tanggal berikutnya bernilai 1 hari. Jika tidak ada pelunasan, API mengirim `null` dan kartu menampilkan **Belum ada pelunasan**. Batas periode juga menggunakan kalender WIB.

## Implementasi

- `buildCustomerDetailRecap` menambahkan `debtUnpaidInPeriod`, `debtPaidOffInPeriod`, dan `averagePaymentDays` ke `summary` respons endpoint detail pelanggan.
- Kartu memakai format rupiah dan angka Indonesia, tiga kolom pada desktop serta satu kolom pada ponsel. Tombol periode mengungkap status pilihan melalui `aria-pressed`.
- Bantuan, workflow pembayaran piutang pada AI Assistant, dan Catatan Perubahan diperbarui.
- Screenshot menggunakan komponen asli dengan data contoh dalam fixture browser; tidak mengandung data pelanggan asli.

## Verifikasi

- Tes baru diverifikasi gagal sebelum implementasi (8 tes), lalu lulus bersama tes regresi rekap dan endpoint detail (28 tes).
- Dua tes tambahan diverifikasi gagal untuk pembulatan durasi pelunasan, lalu lulus setelah perhitungan KPI menggunakan selisih tanggal WIB. Cakupan: saldo sesuai tanggal asal, piutang lama yang baru lunas, cicilan, rata-rata per piutang, piutang manual, nilai kosong versus 0 hari, serta batas tanggal WIB.
- Regresi gabungan: 97 dari 98 tes lulus. Satu kegagalan ada pada tes Bantuan `documents the Goods Purchase inbound receipt submission flow` yang mengharapkan teks `Pilih Pembelian Barang`. Kegagalan sama direproduksi dengan perubahan teks KPI dikeluarkan melalui transformasi fixture, tanpa mengubah file kerja.
- Fixture browser lulus untuk filter 7/14/30 hari, navigasi keyboard, tiga kolom desktop, satu kolom pada lebar 320/390 px, tanpa overflow, dan screenshot dengan data contoh.
- Review kode menemukan masalah pembulatan hari di atas; tidak ada temuan lain pada lingkup KPI.
- `pnpm --filter @pos/web exec tsc --noEmit --incremental false` selesai dengan exit code 0. ESLint untuk komponen, tipe, helper, dan tes KPI selesai tanpa error atau warning.

## Catatan lingkungan

Drive `D:` yang ditentukan pada instruksi dokumentasi tidak tersedia di lingkungan ini. Dokumen disimpan dalam `markdown-files` pada checkout aktif `C:\Projects\pos-system-monorepo`.

Headroom MCP dan Serena tidak tersedia pada sesi utama; pembacaan kode serta log dibatasi. GitNexus dipanggil melalui CLI untuk analisis dampak: risiko rendah pada komponen dan satu endpoint detail pelanggan.

Perintah root `pnpm type-check` ternyata menarik dependensi `build` melalui Turbo. Proses validasi tersebut segera dihentikan saat terdeteksi memasuki Next production build. Pemeriksaan tipe dilanjutkan langsung melalui TypeScript tanpa Turbo. Dev server tidak dinyalakan atau dihentikan; pengguna perlu me-restart dev server jika aset `.next` terdampak.
