# AI Assistant Report File & Advice

Tanggal: 22 Juli 2026

## Ringkasan

Pak Teladan sekarang menampilkan kartu file setelah berhasil mengekspor laporan keuangan atau rekap pelanggan. File tetap otomatis diunduh seperti sebelumnya, tetapi kartu di percakapan menyediakan tombol **Download ulang** tanpa perlu mengirim prompt baru.

## Advice berbasis data

- Laporan keuangan: saran memakai pemasukan, pengeluaran, arus bersih, dan metode pembayaran dari data laporan yang diekspor.
- Rekap pelanggan: saran memakai hasil analisis AI dari dataset rekap yang sama dengan PDF atau Excel.
- Advice ditampilkan di bawah kartu file agar user dapat langsung mengubah laporan menjadi action plan.

## Default dan akses

Jika periode atau format tidak disebutkan, ekspor tetap memakai 30 hari terakhir dan PDF. Permission existing untuk laporan keuangan dan pelanggan tetap berlaku; fitur ini tidak memperluas akses data user.

## Verifikasi

Coverage mencakup penyimpanan metadata file pada chat state, rendering kartu file, tombol Download ulang, advice, workflow catalog, dan TypeScript.
