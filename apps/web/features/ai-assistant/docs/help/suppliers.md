# Supplier

## Lokasi dan tab

Buka sidebar **Katalog > Supplier** (`/suppliers`). Halaman ini memiliki tiga tab:

- **Supplier**: daftar supplier, total pembelian, jumlah restock, supplier aktif, dan top supplier.
- **Rekap Stock In**: hanya menampilkan restock supplier yang sudah disetujui.
- **Permohonan Belanja**: membuat, menyetujui/membatalkan sesuai permission, melihat detail, dan mencetak permohonan kebutuhan barang.

## Mengelola supplier

Pada tab Supplier, cari berdasarkan nama, kontak, atau telepon; filter berdasarkan tipe; dan aktifkan **Tampilkan nonaktif** bila perlu. Tipe supplier yang tersedia adalah DISTRIBUTOR, MARKETPLACE, INDIVIDUAL, MANUFACTURER, dan OTHER.

Gunakan **Tambah Supplier** atau **Import Supplier** bila memiliki permission create. Nama dan tipe wajib diisi; phone, kontak, alamat, dan catatan bersifat opsional. Supplier dapat diedit, dinonaktifkan, atau diaktifkan kembali sesuai permission update. Menonaktifkan supplier mempertahankan histori, bukan menghapus data.

Klik kartu supplier untuk melihat profil dan histori Stock In yang sudah disetujui. Detail menampilkan bundle/log terbaru, kuantitas, total biaya jika tersedia, pengaju, approver, dan item produk. **Rekap Stock In** tidak boleh dihitung dari permohonan berstatus Diajukan, pending, ditolak, atau dibatalkan.

Semua halaman dan aksi supplier mengikuti permission resource `supplier` dan akses halaman RBAC.

## Membuat Permohonan Belanja
Supplier wajib dipilih; jika belum tersedia, pengguna dapat menambahkan nama dan tipe supplier dengan quick add. Setiap produk memakai mode Stok Bersama atau Stok Produk Ini, dengan Stok Bersama sebagai default untuk produk bergrup. Permohonan disimpan dengan status Diajukan dan belum mengubah stok.

Sebelum item pertama diputuskan, Owner atau role dengan `supplier.shopping_request.edit:update` dapat mengedit isi permohonan. Owner atau role dengan `supplier.shopping_request.set_approved_qty:update` dapat menyiapkan **Jumlah yang Di-ACC** melalui tombol tersendiri atau mengisinya langsung di modal **Setujui Daftar Belanja**. Modal menampilkan **Kebutuhan Belanja** sebagai pembanding; input awal kosong bila jumlah belum pernah disimpan. Approver tanpa izin quantity hanya melihat nilai secara read-only. Jumlah lebih besar dari kebutuhan memerlukan satu konfirmasi, sedangkan nilai 0 akan diproses sebagai **Tidak Disetujui**.

Role dengan `supplier.shopping_request.approve_stock:update` dapat memproses satu item melalui **Setujui Item** atau menyetujui semua item tersisa. Jumlah yang diisi langsung disimpan sebelum approval dijalankan. Stok berubah per item berdasarkan Jumlah yang Di-ACC dan mode stok yang dipilih. Item yang sudah diputuskan terkunci, sedangkan permohonan tetap Diajukan sampai semua item selesai. Setelah item terakhir diproses, satu Pengeluaran kategori Bahan tercatat otomatis memakai tanggal permohonan dan tidak dapat diedit atau dihapus dari Keuangan. Permohonan tersebut tidak menambah stok lagi melalui Penerimaan Barang. Lihat langkah lengkap di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q19-bagaimana-cara-membuat-permohonan-belanja-kebutuhan-toko-ke-supplier).

## Kemampuan Pak Teladan

Pak Teladan saat ini hanya memiliki dokumentasi cara memakai fitur Supplier. Ia tidak memiliki tool live untuk daftar supplier, top supplier, nilai pembelian, restock, histori Stock In, atau Permohonan Belanja, dan tidak dapat membuat atau mengubah supplier. Untuk angka atau ranking supplier, arahkan pengguna ke halaman Supplier dan jangan mengarang data.
