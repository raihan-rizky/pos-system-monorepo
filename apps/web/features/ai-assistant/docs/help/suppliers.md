# Supplier

## Lokasi dan tab

Buka sidebar **Katalog > Supplier** (`/suppliers`). Halaman ini memiliki tiga tab:

- **Supplier**: daftar supplier, total pembelian, jumlah restock, supplier aktif, dan top supplier.
- **Rekap Stock In**: hanya menampilkan restock supplier yang sudah disetujui.
- **Daftar Belanja**: membuat, menyetujui/membatalkan sesuai permission, melihat detail, dan mencetak daftar kebutuhan barang.

## Mengelola supplier

Pada tab Supplier, cari berdasarkan nama, kontak, atau telepon; filter berdasarkan tipe; dan aktifkan **Tampilkan nonaktif** bila perlu. Tipe supplier yang tersedia adalah DISTRIBUTOR, MARKETPLACE, INDIVIDUAL, MANUFACTURER, dan OTHER.

Gunakan **Tambah Supplier** atau **Import Supplier** bila memiliki permission create. Nama dan tipe wajib diisi; phone, kontak, alamat, dan catatan bersifat opsional. Supplier dapat diedit, dinonaktifkan, atau diaktifkan kembali sesuai permission update. Menonaktifkan supplier mempertahankan histori, bukan menghapus data.

Klik kartu supplier untuk melihat profil dan histori Stock In yang sudah disetujui. Detail menampilkan bundle/log terbaru, kuantitas, total biaya jika tersedia, pengaju, approver, dan item produk. **Rekap Stock In** tidak boleh dihitung dari permintaan yang masih draft, pending, ditolak, atau dibatalkan.

Semua halaman dan aksi supplier mengikuti permission resource `supplier` dan akses halaman RBAC.

## Membuat Daftar Belanja (Shopping Request)
Daftar belanja ke supplier dapat diajukan dengan status DRAFT terlebih dahulu sebelum disetujui. Langkah-langkah pembuatan daftar belanja secara detail dibahas di [FAQ](file:///d:/main_project/pos-system-monorepo/apps/web/features/ai-assistant/docs/help/faq.md#q17-bagaimana-cara-membuat-daftar-belanja-shopping-request-kebutuhan-toko-ke-supplier).

## Kemampuan Pak Teladan

Pak Teladan saat ini hanya memiliki dokumentasi cara memakai fitur Supplier. Ia tidak memiliki tool live untuk daftar supplier, top supplier, nilai pembelian, restock, histori Stock In, atau Daftar Belanja, dan tidak dapat membuat atau mengubah supplier. Untuk angka atau ranking supplier, arahkan pengguna ke halaman Supplier dan jangan mengarang data.
