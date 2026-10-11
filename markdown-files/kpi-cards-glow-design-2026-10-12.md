# Desain Glow Kartu KPI Ringkasan Daftar Belanja

Tanggal: 2026-10-12

## Tujuan

Kartu KPI yang memiliki nilai positif mendapat halo statis lembut agar metrik aktif lebih mudah dikenali. Kartu dengan nilai nol atau data yang tidak tersedia tidak mendapat halo.

## Perilaku

- Kondisi glow memakai angka mentah dari ringkasan: `pendingRequestCount`, `pendingRequestedQty`, `approvedRequestCount`, dan `fulfillmentRate`.
- Nilai lebih besar dari nol mengaktifkan glow statis dengan warna yang mengikuti tone kartu amber, cyan, emerald, atau violet.
- Nilai nol dan status tidak tersedia (`—`) memakai bayangan kartu biasa tanpa halo.
- Glow tidak mengubah label, nilai, deskripsi, susunan, atau perilaku hover kartu.

## Pilihan desain

1. Halo statis pada kartu, mengikuti tone — dipilih karena memberi penekanan yang jelas tanpa membuat beberapa kartu berdenyut terus-menerus.
2. Halo berdenyut — lebih mencolok, tetapi dapat mengganggu saat beberapa KPI sekaligus bernilai positif.
3. Halo hanya pada ikon dan angka — lebih kecil cakupannya, tetapi memberi penekanan yang lebih lemah pada kartu.

## Batas implementasi

Perubahan berpusat pada `ShoppingRequestKpiCard` dan pemanggilnya di `ShoppingRequestList.tsx`. Nilai aktif ditentukan dari data numerik sebelum pemformatan, sehingga string tampilan seperti `102,6%` dan `—` tidak dipakai sebagai sumber keputusan. Tidak ada perubahan API atau perhitungan KPI.

## Validasi

Periksa keadaan nilai positif, nol, dan data tidak tersedia. Jalankan pemeriksaan lint dan TypeScript yang sesuai tanpa menjalankan production build.
