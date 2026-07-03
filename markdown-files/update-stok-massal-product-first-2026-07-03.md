# Update Stok Massal Product-First - 2026-07-03

## Ringkasan Implementasi

Fitur `Update Stok Massal` di halaman Inventaris tab `Transaksi` sekarang memakai desain product-first. User mencari dan memilih produk terlebih dahulu, lalu setiap produk terpilih memiliki aksi, input stok, catatan, dan mode stok sendiri.

Mode yang tersedia:

- `Stok Bersama`: perubahan mengikuti stok grup, memperlihatkan dampak ke varian lain, membuat log dalam bundle Stock Log, dan mengubah `ProductStockGroup.baseStock` saat bundle disetujui.
- `Stok Produk Ini`: perubahan hanya membuat satu log stok untuk produk tersebut, tidak membuat bundle, dan tidak mengubah stok grup. Catatan log menyertakan `Mode: Stok Produk Ini - stok grup tidak diubah`.

## Aturan Utama

- Produk duplikat dengan identitas, nama, SKU, dan unit yang sama diblokir.
- Produk dengan nama sama tetapi unit berbeda tetap boleh dipilih.
- Dua varian dari grup stok yang sama tidak boleh sama-sama memakai mode `Stok Bersama`.
- Setiap baris produk berdiri sendiri, sehingga mode dan input salah satu produk tidak mengubah produk lain.
- Aksi yang didukung adalah `IN`, `OUT`, dan `ADJUSTMENT`.
- Semua submit tetap mengikuti approval flow yang sudah ada.

## Area yang Diubah

- Helper kalkulasi preview product-first untuk stok bersama dan stok produk ini.
- API `/api/inventory-management/stock-group-bulk` untuk preview dan submit payload berbasis baris produk.
- API approval bundle stock-group bulk untuk summary `PRODUCT_FIRST_STOCK_GROUP_BULK`.
- API approval log stok individual agar catatan `Stok Produk Ini` tidak mengubah stok grup.
- Panel `StockGroupBulkPanel` menjadi pencarian produk dengan preview dampak real-time.
- Modal approval bulk stock menampilkan approval ringkas untuk bundle `Stok Bersama`.
- Bantuan dan AI Assistant workflow catalog diperbarui untuk label `Update Stok Massal`.

## Verifikasi

Test yang ditambahkan atau diperbarui mencakup:

- Kalkulasi helper untuk ekspansi `Stok Bersama`, log-only `Stok Produk Ini`, blok produk duplikat, dan blok konflik grup.
- API submit campuran yang membuat bundle dan log standalone.
- API approval bundle yang mengubah base stock grup sekali.
- API approval log individual yang tidak mengubah stok grup untuk mode `Stok Produk Ini`.
- UI panel product-first, modal approval bundle, HelpContent, dan workflow catalog.
