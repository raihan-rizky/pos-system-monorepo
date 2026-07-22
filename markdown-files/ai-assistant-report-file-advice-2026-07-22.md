# AI Assistant Report File & Advice

Tanggal: 22 Juli 2026

## Ringkasan

Pak Teladan menampilkan kartu file saat pengguna meminta laporan keuangan atau rekap pelanggan, tanpa mengunduh otomatis. Pengguna memulai unduhan lewat tombol **Download PDF/Excel**; setelah berhasil, tombol berubah menjadi **Download ulang** tanpa perlu mengirim prompt baru. OWNER juga mendapat quick prompt bulanan dengan glow loop.

## Advice berbasis data

- Laporan keuangan: saran memakai pemasukan, pengeluaran, arus bersih, dan metode pembayaran dari data laporan yang diekspor.
- Rekap pelanggan: saran memakai hasil analisis AI dari dataset rekap yang sama dengan PDF atau Excel.
- Advice ditampilkan di bawah kartu file agar user dapat langsung mengubah laporan menjadi action plan.

## Default dan akses

Jika periode atau format tidak disebutkan, ekspor tetap memakai 30 hari terakhir dan PDF. Permission existing untuk laporan keuangan dan pelanggan tetap berlaku; fitur ini tidak memperluas akses data user.

## Verifikasi

Coverage mencakup penyimpanan metadata file pada chat state, rendering kartu file, tombol Download ulang, advice, workflow catalog, dan TypeScript.
