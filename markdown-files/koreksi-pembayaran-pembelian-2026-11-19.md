# Koreksi pembayaran pembelian

Pengguna dengan izin `supplier.shopping_request.correct_processed:update` dapat memilih **Supplier → Daftar Belanja → Tindakan lainnya → Ubah pembayaran** pada pembelian yang disetujui. Tindakan ini tersedia sebelum, selama, dan setelah penerimaan barang. **Edit daftar** tetap tersedia untuk koreksi data dan barang.

Jadwal dapat dibagi ke Transfer dan satu atau beberapa Giro. Setiap Giro memiliki tanggal jatuh tempo sendiri; jumlah jadwal harus sesuai total pembelian. Koreksi pembayaran saja mempertahankan total dan dasar total pembelian, termasuk saat barang baru diterima sebagian.

Jika penerimaan masih menunggu persetujuan, peringatan menjelaskan bahwa pembayaran tetap dapat dikoreksi. Koreksi barang yang berpotensi berbenturan dengan penerimaan tersebut tetap dilindungi. Saat penerimaan berikutnya disetujui, perhitungan menggunakan jadwal pembelian yang terbaru; snapshot penerimaan yang telah disetujui tetap menjadi riwayat.

Jadwal merupakan rencana, sedangkan pembayaran tercatat dan alokasinya ditampilkan terpisah. Nominal atau tanggal pembayaran aktual hanya diubah melalui pilihan koreksi yang eksplisit. Perbedaan dengan jadwal ditampilkan sebagai peringatan dan tidak membuat perpindahan uang atau pelunasan otomatis.

Isi alasan, pilih **Tinjau dampak**, periksa perubahan dan simpan. Riwayat mencatat keadaan sebelum dan sesudah; jika data berubah bersamaan, pengguna diminta memuat ulang dan meninjau kembali. Migrasi `20261119010000_flexible_goods_purchase_payment_summary` diperlukan agar ringkasan jadwal campuran dapat menyimpan jatuh tempo Giro.
