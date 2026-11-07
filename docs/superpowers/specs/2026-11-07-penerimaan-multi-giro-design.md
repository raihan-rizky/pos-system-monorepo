# Desain: Edit Produk Penerimaan dan Multi-Giro

Tanggal: 2026-11-07 (WIB)

## Intent

Penerimaan Barang harus dapat dikoreksi saat barang yang datang berbeda dari daftar belanja: pengguna dapat mengganti produk dan kuantitas pada baris penerimaan. Satu Pembelian Barang juga perlu mendukung beberapa giro dengan jatuh tempo berbeda, misalnya giro 7 hari dan giro 30 hari.

## Tujuan

- Menambah kemampuan edit produk dan kuantitas pada penerimaan yang masih dapat direvisi.
- Menyimpan beberapa rincian pembayaran untuk satu Pembelian Barang, terutama beberapa giro dengan nominal dan jatuh tempo masing-masing.
- Memastikan jumlah pembayaran sama dengan total Pembelian Barang sebelum penerimaan diajukan/ditetapkan.
- Menjaga data lama yang hanya memiliki `paymentMethod` dan `paymentDueDate` tetap bisa dibaca dan diproses.
- Menegakkan validasi di API/service, bukan hanya pada UI.

## Bukan tujuan

- Mengubah workflow persetujuan stok atau membuat pembayaran parsial lintas beberapa dokumen.
- Mengganti modul hutang supplier yang sudah ada.
- Menghapus kolom pembayaran lama pada `GoodsPurchase`/`InventoryInboundReceipt` pada perubahan ini.

## Pendekatan yang dipilih

Perluasan alur yang ada. Data pembayaran baru disimpan sebagai baris anak pada Pembelian Barang, sehingga satu dokumen dapat memiliki satu transfer atau beberapa giro. Penerimaan tetap merujuk ke Pembelian Barang tersebut dan menampilkan rincian pembayaran.

## Keputusan desain

- Setiap pembayaran memiliki metode `TRANSFER` atau `GIRO`, nominal positif, tanggal jatuh tempo untuk giro, dan catatan opsional.
- Untuk data baru, pembayaran boleh terdiri dari satu transfer atau beberapa giro. Kombinasi transfer + giro diizinkan agar alur tidak lebih sempit dari kebutuhan pengguna; total seluruh nominal wajib sama dengan `GoodsPurchase.totalAmount`.
- Data lama tanpa baris pembayaran dibaca sebagai satu pembayaran dari kolom lama. Jika kolom lama belum terisi, penerimaan mengikuti validasi pembayaran yang sudah ada.
- Edit produk dilakukan dari modal review pada baris penerimaan. Produk pengganti harus berasal dari store yang sama dan tidak boleh menghasilkan duplikasi produk pada penerimaan. Kuantitas tetap divalidasi terhadap sisa kuantitas Pembelian Barang dan penerimaan pending lain.
- Perubahan produk/kuantitas mengembalikan status review baris menjadi `PENDING`; persetujuan stok tidak boleh memakai snapshot lama.
- Penghapusan baris tetap mengikuti aturan yang ada. Menambah baris baru dilakukan dengan mengganti produk pada baris yang ada atau memakai baris yang belum diterima; tidak ada endpoint bebas untuk menambah produk di luar Pembelian Barang.

## Perubahan yang akan dibuat

1. Prisma: model `GoodsPurchasePayment` (relasi ke `GoodsPurchase`) dengan metode, nominal, jatuh tempo, catatan, audit waktu/pembuat; migrasi backfill dari kolom lama.
2. Repository/service: membaca dan menulis pembayaran baru, fallback legacy, validasi total/metode/tanggal, serta validasi produk pengganti dan kuantitas.
3. API: payload create/list/review/edit menambahkan pembayaran dan productId pada edit baris; semua validasi memakai Zod + service transaction.
4. UI: editor pembayaran berulang pada Penerimaan Barang dan pemilih produk pada editor baris; tampilkan total pembayaran, selisih, dan jatuh tempo tiap giro.
5. RBAC: gunakan permission penerimaan yang sudah ada (`inventory.inbound_receipt.edit`/`inventory` update); audit hanya jika katalog permission memang perlu entry baru.
6. Test: service/repository/route/component untuk multi-giro, total mismatch, due date invalid, fallback legacy, produk pengganti valid/duplikat, qty melewati sisa, dan role denied.
7. Dokumentasi: update Bantuan, katalog workflow AI, changelog, dan catatan markdown fitur.

## Validasi dan transaksi

- Semua baris pembayaran harus valid; giro wajib memiliki tanggal ISO yang valid; transfer tidak menyimpan jatuh tempo.
- Total pembayaran dibandingkan dengan total pembelian menggunakan nilai uang presisi dua desimal.
- Edit baris mengunci/mengecek versi `updatedAt` dan menghitung ulang sisa kuantitas di transaksi database.
- Finalisasi hanya memakai baris dan pembayaran yang sudah tervalidasi; perubahan pembayaran setelah expense terbentuk ditolak atau memerlukan revisi sesuai status workflow yang ada.

## Yang masih menjadi keputusan builder

- Nama tabel/kolom dan detail indeks.
- Apakah editor pembayaran diletakkan di modal penerimaan atau modal Pembelian Barang; implementasi akan menjaga editor utama di Penerimaan Barang agar sesuai permintaan pengguna.
- Format label nominal dan tanggal mengikuti komponen pembayaran yang sudah ada serta bahasa Indonesia.
