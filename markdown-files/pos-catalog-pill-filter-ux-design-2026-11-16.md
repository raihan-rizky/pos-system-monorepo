# Desain Pill Filter Katalog POS

Tanggal: 2026-11-16

Pembaruan cakupan: 2026-11-17

## Tujuan

Ganti dua dropdown grup dan subkategori di halaman POS dengan pill yang cepat dipindai dan tetap memperlihatkan pilihan satu tingkat di bawahnya. Pilihan satuan aktif di keranjang tetap terlihat jelas.

## Cakupan

- Hanya tampilan filter POS yang berubah; Produk dan inventaris tetap memakai dropdown saat ini.
- Baris pertama berisi pill `Semua kategori`, `ATK`, dan `PERCETAKAN`.
- Baris kedua selalu terlihat. Sebelum grup dipilih, tampilkan petunjuk pill nonaktif `Pilih kategori dahulu`.
- Setelah grup dipilih, baris kedua berisi `Semua subkategori` dan pill subkategori untuk grup tersebut. Grup `PERCETAKAN` mencakup `PLAT`, `PRINT`, `STEMPEL`, `CETAK`, dan `SPANDUK`.
- Pilihan grup mengosongkan subkategori dan kembali ke halaman produk pertama. Pilihan subkategori juga kembali ke halaman pertama.
- Filter stok tidak berubah. Setiap item keranjang tetap menunjukkan lencana `Satuan dipilih` beserta nama unit aktif; kontrol `Ubah satuan` tetap tersedia bila ada beberapa pilihan.
- Data subkategori tetap memakai sumber daring/offline yang sama; POS tidak menampilkan opsi `Belum diatur`.
- Seed katalog dan migrasi database menambahkan `CETAK` serta `SPANDUK` secara idempoten tanpa mengubah klasifikasi produk yang sudah ada.

## Arah visual dan aksesibilitas

**Arah:** rel pill POS untuk pemindaian cepat. Penanda visualnya adalah hierarki dua tingkat: pill grup memakai warna brand saat aktif, sedangkan subkategori berada di rel kedua dengan gaya aktif yang sama dan pilihan lain yang netral.

**DFII:** dampak visual 3, kecocokan konteks 5, kelayakan 5, keamanan performa 5, risiko konsistensi 3; skor 15.

Gunakan tipografi, warna `brand`/`surface`, dan jarak komponen yang sudah dipakai POS; tanpa font, dependensi, atau animasi baru. Pill memakai fokus keyboard yang jelas, label kelompok, dan state `aria-pressed`; pilihan aktif memiliki ikon centang selain warna brand. Setiap baris dapat digulir mendatar pada layar kecil tanpa menyembunyikan indikator pilihan aktif. Pratinjau visual POS di Bantuan mengikuti susunan yang sama dan memperlihatkan contoh satuan aktif di keranjang.

## Pendekatan

1. **Dua baris pill (dipilih pengguna):** grup dan subkategori terpisah, dengan baris subkategori yang tetap tampak nonaktif sebelum grup dipilih. Pilihan dan hierarki terlihat langsung.
2. **Satu baris gabungan:** lebih ringkas, tetapi pill grup dan subkategori bercampur dalam satu guliran panjang.
3. **Baris subkategori setelah grup dipilih:** menghemat ruang awal, tetapi keadaan subkategori tidak terlihat sebelum ada pilihan grup.

Pengguna memilih pendekatan pertama karena paling jelas dan mempertahankan perilaku subkategori nonaktif yang disetujui sebelumnya.

## Batasan dan yang bukan tujuan

Tidak mengubah API/query, pencarian offline, aturan klasifikasi produk, filter stok, atau perilaku harga/keranjang. Katalog hanya mendapat dua baris subkategori default melalui seed dan migrasi idempoten. Implementasi mengikuti komponen dan token UI yang sudah dipakai proyek; tidak menambah dependensi.
