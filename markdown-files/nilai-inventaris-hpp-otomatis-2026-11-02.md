# Nilai Inventaris otomatis dari HPP satuan

Tanggal: 2026-11-02 (Asia/Jakarta).

## Aturan perhitungan

- Setiap produk mandiri atau grup stok mewakili satu saldo fisik. Varian satuan dalam grup tidak dijumlahkan sebagai persediaan terpisah.
- Gunakan stok bersama `baseStock`, uraikan dari pengali satuan terbesar ke terkecil, dan kurangi saldo setelah setiap bagian dihitung. Satuan terakhir menampung sisa, termasuk pecahan yang sah.
- Tiap bagian menggunakan `costPrice` satuannya sendiri. Jika kosong, turunkan HPP lewat rasio pengali dari satuan terkecil yang memiliki HPP. HPP nol valid; HPP kosong berbeda dengan nol.
- Contoh 25 pcs, 10 pcs/dus, HPP dus Rp9.000 dan pcs Rp1.000: 2 × Rp9.000 + 5 × Rp1.000 = Rp23.000. HPP dus kosong menghasilkan Rp25.000.
- Produk aktif dalam toko pengguna saja yang masuk perhitungan. Label satuan dasar dan penanda tinjauan lama tidak menjadi syarat membaca nilai inventaris; penghitungan memakai konversi numerik yang tersimpan.
- Pengali harus positif dan terbatas. Alias satuan dengan pengali sama dihitung sekali, mengutamakan HPP terisi lalu ID produk yang stabil. Nilai dibulatkan dua desimal setelah satu saldo selesai dihitung.
- Pencarian atau kategori memilih grup yang masuk perhitungan. Semua satuan aktif grup tersebut tetap digunakan agar pencarian salah satu SKU tidak mengganti hasil penilaian grup.
- Stok nol/negatif berkontribusi nol. Produk tanpa HPP yang dapat dihitung ditandai satu kali sebagai belum dinilai; kartu menampilkan nilai sebagian.

## Riwayat dan laporan bulanan

Migration `20261102010000_inventory_unit_cost_valuation` menyediakan satu fungsi penilaian PostgreSQL untuk statistik Produk, laporan bulanan, dan jurnal perubahan.

Metode `unit_hpp` memiliki baseline terpisah. Baseline serta perubahan metode lama diberi identitas `selling_price` dan tetap disimpan. Riwayat lama tersebut tidak dilabeli sebagai HPP. Periode sebelum baseline HPP ditampilkan kosong bila snapshot HPP belum tersedia.

Trigger tingkat statement pada produk dan grup hanya menghitung ulang saldo yang terdampak. Cache per saldo dan penguncian baris mencegah perubahan satuan yang mereplikasi stok grup menulis nilai berulang. Perubahan harga jual tidak memengaruhi jurnal HPP. Jumlah produk yang belum dinilai juga dicatat dalam snapshot. Jurnal lama tetap aktif selama rollout aplikasi; laporan HPP selalu memfilter metode `unit_hpp`.

Saldo historis hanya tersedia bila penghalang penutupan bulan berhasil dicatat. Penguncian tabel saat penutupan menunggu transaksi stok selesai agar waktu trigger tidak dianggap sebagai bukti commit. Cache HPP memakai RLS, dan izin tabel serta fungsi dicabut dari role API Supabase.

Excel menahan saldo inventaris dan rumus jumlah harta jika HPP belum lengkap. Nilai nol yang tercatat tetap angka nol. Catatan menjelaskan data yang belum tersedia tanpa meminta pengguna memperbaiki satuan dasar.

## Penerapan

Migration diterapkan melalui `prisma migrate deploy` sebelum aplikasi yang menggunakan fungsi ini diterapkan. Tidak ada pembaruan HPP master atau pemilihan sumber harga untuk menjalankan perhitungan. Status dan verifikasi dev/produksi dicatat pada bagian hasil penerapan.

Bantuan, FAQ Q47, workflow AI Assistant, dan Catatan Perubahan diperbarui pada perubahan yang sama. Catatan Perubahan memakai ilustrasi satuan karena tangkapan layar nilai finansial toko tidak digunakan.

## Pengujian

Pengujian integrasi menjalankan route statistik, fungsi SQL, dan trigger asli pada PostgreSQL dalam memori menggunakan PGlite. Tool pengujian dipasang di folder sementara di luar dependency aplikasi; schema uji tidak menyentuh database pengembangan maupun produksi.

```powershell
$inventorySqlTestTools = Join-Path $env:TEMP 'pos-inventory-sql-tests'
npm install --prefix $inventorySqlTestTools --no-save --no-package-lock --ignore-scripts @electric-sql/pglite
$env:INVENTORY_PGLITE_MODULE = Join-Path $inventorySqlTestTools 'node_modules\@electric-sql\pglite'
pnpm --filter @pos/web exec vitest run features/inventory-valuation/__tests__/inventory-valuation.integration.test.ts features/financial-report/helpers/__tests__/monthly-automatic-balances.test.ts
pnpm --filter @pos/web exec tsc --noEmit
pnpm --filter @pos/db exec tsc --noEmit
```

RED awal membuktikan kode lama menghasilkan Rp95.000 untuk fixture yang seharusnya Rp23.000. Pengujian Excel juga gagal sebelum perlindungan saldo HPP yang belum lengkap diterapkan.

Verifikasi implementasi awal: 118 pengujian lolos pada tujuh file dan pemeriksaan TypeScript pada paket web/database selesai tanpa error. Rilis disusun ulang di atas `origin/main` terbaru dengan mempertahankan laporan giro, transaksi snapshot, model V2, dan penutupan bulan yang sudah dipublikasikan. Pengujian integrasi rilis menjalankan migration V2, penutupan bulan, dan ACL produksi sebelum migration HPP: 28 pengujian integrasi dan enam pengujian workbook lolos, termasuk RED→GREEN untuk penutupan bulan yang terlewat, trigger lama, izin default Supabase, dan HPP belum lengkap.

## Catatan eksekusi

Drive `D:` yang disebutkan dalam petunjuk repositori tidak tersedia pada host ini. Dokumen disimpan di `markdown-files` dalam checkout aktif `C:\Projects\pos-system-monorepo`.

Headroom MCP dipanggil pada sesi pengembangan dan kompresi output digunakan. Proxy kompresi tidak terhubung; pembacaan kode dan output dibatasi. Server pengembangan dikelola pengguna. Perintah root `pnpm type-check` ternyata memicu dependency Turbo `next build`; proses langsung dihentikan. Verifikasi dilanjutkan dengan TypeScript langsung per paket, tanpa menjalankan development server.

Review independen menemukan dua hal yang diperbaiki sebelum selesai: schema Prisma disinkronkan dengan migration, dan query dipersempit melalui indeks ID produk/grup. Regresi performa dengan 2.000 produk membuktikan pemindaian 2.002 baris sebelum perbaikan dan paling banyak empat baris sesudahnya. Prisma Client dibuat ulang dan schema tervalidasi. Kontrak visual panduan belanja terdahulu yang belum terdaftar dilengkapi karena sebelumnya membuat modul Bantuan gagal dimuat; indeks langkah panduan yang sudah ada dipertahankan.

## Hasil penerapan dev dan produksi

Pada 2026-11-02 WIB, migration `20261102010000_inventory_unit_cost_valuation` berhasil diterapkan ke database dev dan produksi dengan `prisma migrate deploy`. Pemeriksaan sebelum penerapan menunjukkan hanya migration ini yang tertunda. Tidak ada reset atau penghapusan data.

Query verifikasi setelah penerapan membuktikan konsistensi nilai langsung, cache per saldo, dan jurnal HPP pada kedua lingkungan. Hak akses API dibatasi, jurnal lama tetap aktif, dan migration tercatat selesai. Pemeriksaan TypeScript langsung pada paket web dan database di checkout rilis juga lolos. Review independen terhadap penyesuaian `main` tidak menemukan masalah tersisa.

Suite aplikasi lengkap mencatat 5.171 tes lolos dan 128 tes integrasi opsional dilewati. Dua pemeriksaan lama yang masih mewajibkan arahan memperbaiki satuan dasar diperbarui sesuai perubahan fitur, lalu kedua file dijalankan ulang: seluruh 18 tes lolos. Tidak ada perubahan kode aplikasi sesudah suite lengkap tersebut. Pengujian penuh pertama terhenti akibat crash Node saat diagnostik debugger; hasil suite lengkap ini berasal dari pengulangan tanpa debugger.

ESLint tambahan belum dapat berjalan pada instalasi terpisah karena resolver konfigurasi tidak menemukan `eslint-plugin-react-hooks`; paket tersebut sudah ada dalam dependency transitif. Perintah lint paket web menggunakan TypeScript dan telah lolos. Tidak ada dependency aplikasi yang diubah untuk menangani kendala tool ini.
