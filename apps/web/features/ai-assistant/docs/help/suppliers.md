# Supplier

## Lokasi dan tab

Buka sidebar **Katalog > Supplier** (`/suppliers`). Halaman ini memiliki empat tab. Tautan lama `?tab=goods-purchases` membuka Daftar Belanja.

- **Supplier**: daftar supplier, total pembelian, jumlah restock, supplier aktif, dan top supplier.
- **Rekap Stock In**: hanya menampilkan restock supplier yang sudah disetujui.
- **Daftar Belanja**: pengajuan, satu persetujuan jumlah dan harga, Pembelian Barang terkait, serta riwayatnya.
- **Penerimaan Barang**: mencatat barang yang benar-benar datang dari pembelian yang sudah disetujui.

## Mengelola supplier

Pada tab Supplier, cari berdasarkan nama, kontak, atau telepon; filter berdasarkan tipe; dan aktifkan **Tampilkan nonaktif** bila perlu. Tipe supplier yang tersedia adalah DISTRIBUTOR, MARKETPLACE, INDIVIDUAL, MANUFACTURER, dan OTHER.

Gunakan **Tambah Supplier** atau **Import Supplier** bila memiliki permission create. Nama dan tipe wajib diisi; phone, kontak, alamat, dan catatan bersifat opsional. Supplier dapat diedit, dinonaktifkan, atau diaktifkan kembali sesuai permission update. Menonaktifkan supplier mempertahankan histori, bukan menghapus data.

Klik kartu supplier untuk melihat profil dan histori Stock In yang sudah disetujui. Detail menampilkan bundle/log terbaru, kuantitas, total biaya jika tersedia, pengaju, approver, dan item produk. **Rekap Stock In** tidak boleh dihitung dari permohonan berstatus Diajukan, pending, ditolak, atau dibatalkan.

Semua halaman dan aksi supplier mengikuti permission resource `supplier` dan akses halaman RBAC.

## Membuat Daftar Belanja

Pilih supplier, cari barang, isi jumlah kebutuhan, dan tambahkan catatan bila perlu. Setelah barang masuk daftar, pilih **Satuan** lain dari varian dalam grup stok yang sama. Angka jumlah tidak dikonversi: **12 pcs menjadi 12 dus**. Nama satuan dan stok mengikuti varian yang dipilih. Varian yang sudah ada di daftar tidak bisa dipilih dua kali.

Simpan daftar dengan status **Diajukan**. Pemegang izin `supplier.shopping_request.edit:update` dapat mengubah supplier, produk, satuan, jumlah, dan catatan sebelum item diputuskan. Gunakan **Tindakan lainnya** pada kartu untuk mengedit, membatalkan, atau mencetak. Pembuatan belum membuat Pengeluaran dan tidak mengubah stok.

## Satu persetujuan jumlah dan harga

Pemegang izin `supplier.goods_purchase.approve:update` memilih **Tinjau & Setujui** pada daftar baru. Dalam satu modal, periksa **Jumlah**, **Satuan**, dan **Harga Beli** aktual untuk setiap barang. Harga awal mengikuti HPP master varian terpilih; periksa manual bila HPP belum tersedia. Mengganti satuan mempertahankan angka jumlah dan memuat harga awal varian baru. Jumlah nol berarti barang tidak disetujui. Barang tambahan dan pilihan pembaruan HPP tersedia dalam modal yang sama. Jumlah melebihi kebutuhan perlu konfirmasi.

Klik **Setujui dan Catat Pembelian** sekali. Sistem menyetujui Daftar Belanja, membuat Pembelian Barang berstatus disetujui, menerapkan pembaruan HPP yang dipilih, dan mencatat tepat satu Pengeluaran kategori Bahan dalam satu transaksi. Pemegang izin `supplier.goods_purchase.reject:update` dapat menolak seluruh daftar dengan alasan; penolakan tidak membuat pembelian atau Pengeluaran.

Persetujuan tidak mengubah stok. Setelah barang datang, pilih **Catat Penerimaan** pada kartu pembelian yang disetujui. Riwayat dan perbandingan penerimaan ada di **Tindakan lainnya**. Stok baru bertambah ketika penerimaan disetujui.

## Dokumen lama

Daftar dan Pembelian Barang lama tetap terlihat di Daftar Belanja. Pembelian lama yang masih menunggu bisa diproses dengan alur review lama dari kartunya. Daftar lama yang sudah disetujui tanpa pembelian menampilkan **Lengkapi Pembelian Lama**; jika ada Pengeluaran lama, sistem menggantinya saat pembelian baru selesai agar tidak dihitung dua kali. Permohonan lama yang sedang diputuskan per item tetap memakai tindakan dan izin lamanya.

## Kemampuan Pak Teladan

Pak Teladan saat ini hanya memiliki dokumentasi cara memakai fitur Supplier. Ia tidak memiliki tool live untuk daftar supplier, top supplier, nilai pembelian, restock, histori Stock In, Daftar Belanja, atau Pembelian Barang, dan tidak dapat membuat atau mengubah supplier. Untuk angka atau ranking supplier, arahkan pengguna ke halaman Supplier dan jangan mengarang data.
