# Rancangan: Total Harian di RC Bulan

Status: selesai; implementasi tersedia.

## Tujuan

Tampilkan subtotal penerimaan per tanggal langsung di sheet `RC {BULAN}` pada export laporan bulanan.

## Cakupan dan batasan

- Sisipkan satu baris `TOTAL HARIAN` setelah seluruh transaksi pada tanggal yang sama.
- Jumlahkan setiap kategori penerimaan, termasuk `Perlu pemetaan`, serta kolom `TOTAL`.
- Bedakan baris subtotal dengan isian mint `#DFF3ED`, teks `#14564F`, dan garis atas `#15816F` sesuai mockup yang disetujui.
- Hari tanpa penerimaan tidak mendapat baris subtotal.
- Total bulanan tetap menghitung transaksi saja; baris subtotal tidak boleh dihitung ulang.
- Pertahankan sheet rekap harian dan sumber data yang ada. Tidak ada perubahan API atau skema database.

## Pendekatan

Gunakan subtotal baris setelah kelompok transaksi tiap tanggal. Label subtotal berupa teks agar rumus rekap harian yang mencocokkan tanggal dan hitungan jumlah transaksi tetap mengabaikannya.

## Perilaku rumus dan verifikasi

Rumus subtotal menjumlahkan baris transaksi untuk tanggal yang sama dan menyimpan cache numerik. Total bulanan menjumlahkan hanya baris dengan tanggal numerik, sehingga tidak menggandakan subtotal. Tes mencakup beberapa transaksi pada satu tanggal, tanggal berbeda, penerimaan belum dipetakan, total kategori/total bulanan, tampilan subtotal, dan bulan tanpa penerimaan.
