# Supplier

## Lokasi dan tab

Buka sidebar **Katalog > Supplier** (`/suppliers`). Halaman ini memiliki empat tab:

- **Supplier**: daftar supplier, total pembelian, jumlah restock, supplier aktif, dan top supplier.
- **Rekap Stock In**: hanya menampilkan restock supplier yang sudah disetujui.
- **Daftar Belanja**: membuat, menyetujui/membatalkan sesuai permission, melihat detail, dan mencetak kebutuhan barang.
- **Pembelian Barang**: mencatat pembelian aktual dari Daftar Belanja yang disetujui, termasuk harga terbaru, review per produk, dan riwayat status.

## Mengelola supplier

Pada tab Supplier, cari berdasarkan nama, kontak, atau telepon; filter berdasarkan tipe; dan aktifkan **Tampilkan nonaktif** bila perlu. Tipe supplier yang tersedia adalah DISTRIBUTOR, MARKETPLACE, INDIVIDUAL, MANUFACTURER, dan OTHER.

Gunakan **Tambah Supplier** atau **Import Supplier** bila memiliki permission create. Nama dan tipe wajib diisi; phone, kontak, alamat, dan catatan bersifat opsional. Supplier dapat diedit, dinonaktifkan, atau diaktifkan kembali sesuai permission update. Menonaktifkan supplier mempertahankan histori, bukan menghapus data.

Klik kartu supplier untuk melihat profil dan histori Stock In yang sudah disetujui. Detail menampilkan bundle/log terbaru, kuantitas, total biaya jika tersedia, pengaju, approver, dan item produk. **Rekap Stock In** tidak boleh dihitung dari permohonan berstatus Diajukan, pending, ditolak, atau dibatalkan.

Semua halaman dan aksi supplier mengikuti permission resource `supplier` dan akses halaman RBAC.

## Membuat Daftar Belanja
Supplier wajib dipilih; jika belum tersedia, pengguna dapat menambahkan nama dan tipe supplier dengan quick add. Pengguna memilih produk, mengisi jumlah kebutuhan, dan dapat menambahkan catatan. Daftar disimpan dengan status Diajukan. Pembuatan dan approval Daftar Belanja tidak mengubah stok atau membuat Pengeluaran.

Sebelum item pertama diputuskan, Owner atau role dengan `supplier.shopping_request.edit:update` dapat mengedit isi permohonan. Owner atau role dengan `supplier.shopping_request.set_approved_qty:update` dapat menyiapkan **Jumlah yang Di-ACC** melalui tombol tersendiri atau mengisinya langsung di modal **Setujui Daftar Belanja**. Modal menampilkan **Kebutuhan Belanja** sebagai pembanding; input awal kosong bila jumlah belum pernah disimpan. Approver tanpa izin quantity hanya melihat nilai secara read-only. Jumlah lebih besar dari kebutuhan memerlukan satu konfirmasi, sedangkan nilai 0 akan diproses sebagai **Tidak Disetujui**.

Role dengan `supplier.shopping_request.approve_stock:update` dapat memproses satu item melalui **Setujui Item** atau menyetujui semua item tersisa. Jumlah yang diisi langsung disimpan sebelum approval dijalankan. Modal menampilkan **Estimasi pengeluaran** dari Jumlah yang Di-ACC dan harga modal; harga modal yang kosong dihitung Rp0 dengan peringatan. Approval hanya mencatat keputusan, tanpa membuat Pengeluaran, mengubah stok, atau membuat log restock. Item yang sudah diputuskan terkunci, sedangkan daftar tetap Diajukan sampai semua item selesai. Setelah item terakhir diproses, Daftar Belanja tersedia sebagai sumber Pembelian Barang. Lihat langkah lengkap di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q19-bagaimana-cara-membuat-daftar-belanja-kebutuhan-toko-ke-supplier).

## Pembelian Barang

Di tab **Pembelian Barang**, klik **Buat Pembelian Barang** lalu pilih Daftar Belanja yang sudah disetujui. Supplier dan produk yang di-ACC muncul otomatis. Jumlah awal mengikuti nilai di-ACC, sedangkan harga produk terbaru mengikuti HPP master. Jika harga berbeda, pengguna memilih per produk apakah HPP master perlu diperbarui. Total pengeluaran dihitung dari jumlah dikali harga terbaru.

Pengajuan disimpan sebagai **PENDING**. Izin `supplier.goods_purchase.approve:update` dan `supplier.goods_purchase.reject:update` terpisah dan default-nya hanya OWNER. Saat review, approver dapat menyetujui, mengedit, atau menghapus setiap produk, serta menambah produk master dengan unit besar. Edit produk yang sudah disetujui mengembalikannya menjadi **Belum Ada Aksi** setelah konfirmasi. Minimal satu produk harus tetap ada.

Setelah semua produk disetujui, dokumen otomatis menjadi **APPROVED**, update HPP terpilih dijalankan, dan satu Pengeluaran kategori Bahan dibuat memakai total final. Dokumen yang ditolak wajib memiliki alasan dan membebaskan Daftar Belanja agar dapat dipilih kembali. Seluruh proses Pembelian Barang tidak mengubah stok; penerimaan barang fisik tetap memakai workflow inventaris terpisah. Lihat [FAQ Q38](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q38-bagaimana-cara-mengajukan-dan-memutuskan-pembelian-barang).

## Kemampuan Pak Teladan

Pak Teladan saat ini hanya memiliki dokumentasi cara memakai fitur Supplier. Ia tidak memiliki tool live untuk daftar supplier, top supplier, nilai pembelian, restock, histori Stock In, Daftar Belanja, atau Pembelian Barang, dan tidak dapat membuat atau mengubah supplier. Untuk angka atau ranking supplier, arahkan pengguna ke halaman Supplier dan jangan mengarang data.
