# Frequently Asked Questions (FAQ) & Panduan Operasional (Cara-Cara)

Halaman ini berisi kumpulan tanya-jawab (FAQ) dan panduan langkah-demi-langkah (cara-cara) operasional untuk seluruh fitur di aplikasi POS dan Manajemen Toko.

---

## 📌 Topik: Produk & Harga

### Q1: Bagaimana cara menambahkan produk baru ke katalog toko?
**A:** Ikuti langkah berikut (memerlukan izin `product.create`):
1. Buka sidebar **Katalog > Produk** (`/products`).
2. Klik tombol hitam **Tambah Produk** di kanan atas. Anda juga dapat meminta **Pak Teladan membuka modal Tambah Produk**; form tetap harus diperiksa, diisi, dan disimpan oleh pengguna.
3. Isi formulir pendaftaran produk:
   - **Informasi Utama:** Nama produk, SKU (harus unik), Kategori, dan Merek bila ada. Jika merek belum tersedia, ketik nama merek baru lalu klik **Tambah**.
   - **Harga:** Harga Jual dasar dan Harga Modal/HPP (opsional). Harga Agen dan Dinas mengikuti harga jual secara default; isi harga manual hanya jika perlu harga tetap yang berbeda.
   - **Stok & Satuan:** Satuan/Unit (misal: pcs, dus), Stok Saat Ini dalam unit tersebut, dan Batas Minimum Stok.
4. **Unit lain (opsional):** Klik **Tambah unit lain (opsional)** jika barang juga dijual dalam satuan lain. Pilih **Lebih besar** atau **Lebih kecil** dari unit utama, lalu isi konversi, misalnya **1 dus = 12 pcs**. Badge **Unit kecil** berwarna hijau dan **Unit besar** berwarna ungu mengikuti konversi. Harga jual dan SKU disarankan otomatis dan bisa diubah; buka **Detail tambahan** untuk SKU, barcode, dan HPP. Anda dapat menambahkan beberapa unit atau menghapus unit yang tidak diperlukan. Masukkan stok awal sekali dalam unit utama. Semua unit otomatis dikelompokkan saat disimpan dan memakai stok bersama, tanpa menghitung stok dua kali.
5. Klik **Simpan**.

### Q2: Bagaimana cara mengubah harga jual produk agar tercatat di riwayat?
**A:** Sistem menyediakan pencatatan riwayat setiap kali harga produk berubah untuk menjaga transparansi:
1. Pada tabel **Produk**, buka **Ubah Harga** atau **Edit**, lalu klik **Atur harga grup / Manual**. Periksa **Sumber harga**: harga jual dan HPP sumber menjadi acuan pengikut **Auto**. Sesuaikan diskon/markup harga jual pengikut, atau pilih **Manual** untuk mengisi harga jual dan HPP sendiri.
2. Klik **Pratinjau harga**, periksa dampak pada semua satuan, lalu **Terapkan harga grup**. Harga grup disimpan terpisah; draft formulir tetap ada. Jika data grup berubah, buat pratinjau baru. Buka **Riwayat Harga** untuk melihat perubahan.
3. **Harga Agen** dan **Harga Dinas** yang kosong otomatis **mengikuti harga jual**, termasuk saat harga grup berubah. Isi manual untuk menetapkan harga tetap pada produk/satuan ini; harga ini ditandai badge **Harga manual**. Klik **Ikuti harga jual** atau kosongkan kolom, lalu **Simpan Harga**, untuk kembali otomatis. Harga manual lama tetap dipertahankan; tombol ini tidak menerapkan ulang harga grup. Untuk diskon atau tambahan otomatis, Owner memakai **Atur diskon / tambahan → Produk > Harga Khusus**; pengguna lain dapat meminta Owner mengaturnya.
4. Di **POS**, tombol **Harga** pada kartu keranjang membuka **Ubah Harga Nota**. Isi **Harga custom per satuan**, periksa harga otomatis, pembulatan dan subtotal, lalu klik **Terapkan harga**. Harga ini hanya berlaku untuk nota tersebut, tersedia meskipun Harga Khusus toko nonaktif, dan tidak mengubah harga produk. Badge amber **Harga custom** tampil di keranjang, pembayaran, dan detail riwayat; penanda tidak dicetak pada nota/PDF. Harga tetap tersimpan pada draft dan transaksi. Klik **Kembalikan harga otomatis** untuk menghapusnya; nota berikutnya memakai harga otomatis.

### Q3: Bagaimana cara mengatur harga khusus/diskon bagi grup pelanggan (Agen, Industri, Dinas)?
**A:** Owner dapat membuat satu aturan untuk satu atau beberapa tipe pelanggan:

1. Harga Khusus nonaktif secara default. Buka **Produk > Harga Khusus**. Saat nonaktif, Owner melihat daftar buram dan terkunci, lalu memilih **Buka Pengaturan**, mengaktifkan fitur, dan **Simpan pengaturan**. Pengguna lain melihat petunjuk menghubungi Owner. Setelah aktif, Owner dapat memilih **Tambah aturan**.
2. Pilih **Kategori**, lalu pilih **Semua satuan** agar diskon atau rumus modal berlaku untuk seluruh satuan dalam kategori tersebut, termasuk satuan yang ditambahkan nanti. Centang satu atau beberapa satuan untuk membatasi aturan pada satuan yang dipilih.
3. Centang tipe pelanggan yang diinginkan, misalnya **Umum dan Agen**. **Semua pelanggan** berlaku untuk keempat tipe dan dipilih sendiri.
4. Pilih cara menghitung harga: **Diskon rupiah**, **Diskon persen**, **Modal + rupiah**, **Modal + persen**, atau **Modal unit + persen − persen**. Untuk rumus terakhir, isi tambahan dan potongan: modal Rp12.000/dus +10% lalu −5% menghasilkan Rp12.540/dus.
5. Periksa **Contoh harga**. Buka **Pengaturan tambahan** jika ingin memilih merek, menambah merek, atau mengubah status aktif. Klik **Simpan aturan** setelah sesuai.
6. Di tab Produk, gunakan **Harga untuk: Umum/Agen/Industri/Pemerintah** untuk melihat harga yang berlaku; pilihan awalnya **Umum**. Di POS, harga mengikuti pelanggan dan satuan yang dipilih.

**Cara membaca modal:** **Modal unit + persen − persen** memakai modal unit yang dipilih dan memotong hasil setelah tambahan persen. **Modal + rupiah** dan **Modal + persen** memakai modal satuan terkecil secara langsung, tanpa mengalikannya dengan isi kemasan. Modal **Rp700/pcs + Rp4.000** dengan aturan satuan **Rim** menghasilkan **Rp4.700/rim**; dua rim berjumlah **Rp9.400**. **Modal + 10%** menghasilkan **Rp770/rim**. Jika modal pcs berubah menjadi Rp800, harga dengan tambahan Rp4.000 menjadi Rp4.800/rim.

Harga dari aturan diberi badge **Harga Khusus** dan harga Agen/Dinas yang diatur pada produk diberi badge **Harga manual**, termasuk saat nilainya sama dengan harga jual. Status **Mengikuti harga jual** tidak diberi badge. Harga Agen/Dinas yang lebih dari 0 diprioritaskan, termasuk saat Harga Khusus nonaktif. Jika kosong atau 0, sistem memakai aturan Harga Khusus yang aktif bila cocok, lalu harga jual. Saat fitur dinonaktifkan, aturan otomatis tidak digunakan, input Harga Khusus di pembayaran untuk pelanggan Industri/Pemerintah tidak tersedia, dan data aturan tetap tersimpan. Jika sumber modal satuan terkecil belum tersedia atau tidak valid, rumus tidak diterapkan dan harga member/normal digunakan. Kasir tidak memilih prioritas harga saat pembayaran.

Harga yang dimasukkan melalui **Ubah Harga Nota** memakai badge amber **Harga custom** di keranjang, pembayaran, dan detail riwayat, tanpa penanda di nota/PDF. Harga hanya berlaku untuk nota tersebut dan dapat dihapus lewat **Kembalikan harga otomatis**. Pengaturan rumus tidak mengubah modal akuntansi atau harga transaksi yang sudah disimpan.

### Q4: Bagaimana cara mengimpor data produk atau kuantitas stok secara massal lewat Excel?
**A:** Untuk memproses data dalam jumlah banyak secara instan:
1. Klik tombol **Import** (dropdown) di kanan atas halaman Pusat Produk.
2. Pilih tipe import:
   - **Import Bulk Products:** Untuk mengunggah file Excel (.xlsx) katalog produk baru atau memperbarui detail produk lama secara massal.
   - **Import Bulk Stock:** Untuk mengunggah file Excel berisi data kuantitas stok untuk memperbarui/menyesuaikan stok barang di gudang.
3. Pilih dan unggah file Excel Anda dari komputer.
4. Lakukan **Column Mapping** (pemetaan kolom) jika nama kolom di Excel tidak sama dengan format sistem.
5. Periksa pratinjau data dan selesaikan import. Status progres dapat dipantau di layar.

### Q5: Bagaimana cara mengatur Grup Stok (Stock Group)?
**A:** Buka grup dari halaman **Produk** atau **Aktivitas Grup**. Untuk membuat atau menggabungkan grup, pilih produk berbeda satuan, klik **Buat atau gabungkan grup stok**, tentukan sumber stok dan konversi, lalu tinjau sebelum menyimpan. Stok tiap satuan mewakili persediaan yang sama dan tidak dijumlahkan.

Untuk harga otomatis, buka tab **Harga** dengan izin `product.update`:
1. Pilih **Sumber harga** aktif dan isi harga jual serta HPP sumber. Pengikut grup baru dan lama memakai **Manual**; harga jual dan HPP lama tetap dipertahankan saat beralih ke Manual.
2. Atur pengikut **Auto** dengan diskon/markup atau pilih **Manual** untuk uang independen. Diskon jual tidak mengurangi HPP. Kembali ke Auto mempertahankan harga jual lewat faktor dan menghitung HPP dari sumber.
3. Klik **Pratinjau harga**, periksa harga/HPP/margin sebelum dan sesudah tiap satuan, lalu **Terapkan harga grup**. Mengubah draf membatalkan pratinjau. Jika data berubah, muat ulang dan tinjau lagi. Perbaiki alasan **Perlu ditinjau** pada sumber, konversi, faktor, atau HPP; HPP kosong berbeda dari nol.

Contoh Snowman V5 saat pengikut dipilih Auto: beli 10 pak dengan 12 pcs/pak berarti stok masuk 120 pcs memakai HPP pcs. HPP pcs Rp2.000 menghasilkan HPP pak Rp24.000. Harga pcs Rp3.000 dan pak lama Rp32.400 membentuk faktor 9/10. Saat harga pcs Rp3.500, harga pak menjadi Rp37.800; HPP pak tetap Rp24.000.

Sumber jual nol dengan faktor valid menghasilkan nol dan mempertahankan faktor; tanpa faktor yang dapat dihitung, harga lama tetap disertai review. Satuan baru memakai Manual; pilih Auto bila ingin mengikuti sumber dan konversi. Satuan terkecil menjadi sumber pada produk baru dengan banyak satuan. Satuan nonaktif tetap terlihat dalam tinjauan. HPP Unit pada Penerimaan Barang yang disetujui memperbarui harga sesuai satuan. Untuk pengikut Auto, HPP sumber dan satuan terkait disesuaikan mengikuti konversi; pengikut Manual tetap memiliki HPP sendiri.

---

## 📌 Topik: Transaksi & POS Kasir

### Q6: Bagaimana alur memproses transaksi penjualan langsung di kasir (POS)?
**A:** Pastikan shift kasir Anda telah aktif terlebih dahulu, lalu ikuti alur berikut:
1. Buka sidebar **Operasi > Kasir** (`/pos`).
2. Pilih tab **ATK** untuk penjualan barang. Cari produk melalui kolom pencarian di bagian atas atau klik gambar produk di grid sebelah kiri. Untuk pesanan cetak, pilih **Percetakan** dan ikuti panduan nota pada **Q40**; pesanan diisi langsung pada lembar nota di subtab asalnya.
3. Jika ada varian (seperti warna/ukuran), pilih varian yang sesuai di pop-up, lalu masukkan item ke **Keranjang**.
4. Tombol **Edit** tersedia sesuai izin edit produk dan mengubah Nama/Kategori/Merek seluruh varian. Tombol **Harga** tersedia sesuai izin **Ubah harga di nota** dan membuka **Ubah Harga Nota**: isi harga per satuan, periksa harga otomatis, pembulatan dan subtotal, lalu **Terapkan harga**. Harga custom tetap tersimpan pada draft dan transaksi, tersedia meskipun Harga Khusus nonaktif, dan ditandai di keranjang, pembayaran, serta detail riwayat. Klik **Kembalikan harga otomatis** untuk menghapusnya; nota berikutnya memakai harga otomatis.
5. Atur kuantitas atau hapus item di keranjang bila perlu, lalu klik tombol hijau besar **Bayar**.
6. Di modal Pembayaran, pilih Pelanggan Umum atau pelanggan terdaftar. Sales dapat dipilih secara opsional.
7. Pilih metode pembayaran: **Tunai**, **QRIS**, **Debit**, atau **Transfer** (maksimal 2 metode gabungan).
8. Pilih status pembayaran **Lunas** atau **Uang Muka (DP)**, lalu tentukan tipe transaksi **Beli Langsung** atau **Job Order**.
9. Isi jumlah uang yang dibayarkan, masukkan nominal diskon bila ada, klik **Konfirmasi Bayar** / **Bayar DP**, lalu cetak struk belanja pelanggan.

### Q7: Bagaimana cara menyetujui transaksi Pending atau mengatur Auto Approve per role?
**A:** Transaksi dengan status **Pending** memerlukan persetujuan dari kasir atau pemilik toko agar stok barang terpotong dan pembayaran terverifikasi:
1. Di halaman **Riwayat Transaksi**, gunakan filter status **Pending** untuk melihat semua transaksi yang menunggu persetujuan (baris transaksi akan berwarna biru).
2. Klik tombol **Setujui** atau **Tolak** di sebelah kanan baris transaksi (atau pilih dari menu tiga titik `...` -> **Setujui** / **Tolak**).
3. Di modal persetujuan:
   - **Bayar Instan:** Pilih metode pembayaran dan masukkan jumlah uang yang dibayar pelanggan.
   - **Bayar Nanti (Tempo):** Centang opsi **Bayar Nanti (Tempo)** jika transaksi berupa piutang/pembayaran bertahap (status transaksi akan otomatis menjadi **DP**).
4. Klik **Setujui** untuk memfinalisasi transaksi. Sistem akan segera mengurangi stok produk yang bersangkutan. Jika memilih **Tolak**, transaksi pending tersebut akan otomatis dibatalkan (VOID).

Untuk **Nota Percetakan**, periksa isi dan pembayaran tersimpan lalu klik **Setujui nota**. Item, nomor, dan tanggal tetap mengikuti nota yang telah diproses; perubahan isian dilakukan saat nota masih draft sebelum **Bayar / DP**.

### Q8: Bagaimana cara membuat Surat Jalan Pengiriman (Delivery Order) barang ke pelanggan?
**A:** Surat Jalan digunakan untuk mengirimkan barang pesanan kepada pelanggan secara bertahap atau sekaligus, langsung dari transaksi penjualan yang ada:
1. Cari transaksi penjualan bersangkutan di halaman **Riwayat Transaksi** (harus berstatus **Lunas** atau **DP** serta memiliki produk fisik).
2. Klik ikon tiga titik `...` di ujung kanan baris transaksi, lalu pilih opsi **Cetak Surat Jalan**.
3. Struk langsung terbuka tanpa langkah pembuatan terpisah. Dokumen aktif terbaru dipilih bila ada; gunakan pilihan **Dokumen** untuk pengiriman lain atau **Pengiriman baru** bila masih ada sisa barang. Membuka struk tidak membuat catatan pengiriman.
4. Klik langsung **Penerima**, **Nama barang**, **Jumlah**, atau **Keterangan** di struk untuk mengedit. Jumlah dibatasi sisa invoice setelah pengiriman PENDING/CONFIRMED lainnya; isi 0 agar barang tidak disertakan saat disimpan. Nama barang hanya berubah pada surat jalan tersebut. Dokumen tersimpan hanya dapat diubah dengan izin `surat_jalan.update`; dokumen CANCELLED/REJECTED hanya dapat dilihat dan dicetak.
5. Pilih **Simpan & Cetak** agar perubahan tersimpan sebelum dicetak. **Cetak** mencetak ulang dokumen yang tidak berubah tanpa pengiriman baru. Jika simpan gagal, isian tetap tersedia. Saat menutup atau berpindah dengan perubahan belum disimpan, pilih **Lanjut edit** atau **Buang perubahan**.
6. Untuk transaksi baru, stok sudah dikurangi ketika transaksi disimpan sebagai Lunas/DP atau ketika transaksi pending disetujui. Membuat, menyetujui, mencetak, dan melakukan marking Surat Jalan tidak mengurangi stok lagi.
7. Status Surat Jalan langsung **CONFIRMED** secara default. Jika Owner menonaktifkan `surat_jalan.auto_approve:create` untuk role pembuat melalui RBAC, dokumen tersimpan sebagai **PENDING** dan menunggu approval. Approval tersebut hanya mengonfirmasi dokumen.

Transaksi lama dengan sumber stok SURAT_JALAN tetap mengikuti alur stok historis. Perubahan jumlah dokumen CONFIRMED menyesuaikan selisih stok dan menulis jurnal hanya jika bukti mutasi, grup stok, dan konversi satuannya dapat diverifikasi; bila bukti tidak cukup, perubahan jumlah ditolak dengan pesan yang jelas.

### Q9: Bagaimana cara mencetak invoice atau struk transaksi?
**A:** Anda dapat mencetak invoice dengan dua cara:
- **Melalui POS Kasir:** Setelah menyelesaikan pembayaran transaksi, klik tombol **Cetak Struk** pada halaman konfirmasi keberhasilan.
- **Melalui Riwayat Transaksi:** 
  1. Buka sidebar **Operasi > Riwayat**.
  2. Cari transaksi dan klik Lihat Struk atau barisnya. Untuk mengubah invoice reguler, klik Ubah di samping Lihat Struk jika memiliki izin; aksi ini tidak tersedia untuk Sales atau transaksi gabungan.
  3. Pada panel detail transaksi di sebelah kanan, klik ikon printer atau tombol **Cetak Invoice/Struk** di sudut kanan atas panel.

### Q10: Bagaimana cara mengubah tanggal invoice transaksi?
**A:** Owner/Admin dapat mengatur tanggal bisnis invoice tanpa mengubah waktu audit sistem. Gunakan fitur ini jika invoice final harus mengikuti tanggal operasional tertentu:
1. Buka sidebar **Operasi > Riwayat** (`/history`).
2. Cari transaksi target. Tanggal utama di tabel adalah **Tanggal Invoice**, sedangkan label **Dibuat** menunjukkan waktu record dibuat oleh sistem.
3. Klik menu titik tiga `...` pada baris transaksi, lalu pilih **Ubah Tanggal Invoice**. Menu ini hanya muncul untuk Owner/Admin.
4. Pilih tanggal invoice baru. Isi jam invoice hanya jika jamnya juga perlu diganti; jika jam dikosongkan, sistem mempertahankan jam invoice sebelumnya.
5. Tulis alasan perubahan dengan jelas, lalu simpan. Sistem akan menyesuaikan nomor invoice/draft, mencatat audit trail, dan menampilkan riwayat perubahan di detail transaksi.
6. Setelah perubahan berhasil, cetak ulang invoice final agar nomor dan tanggal yang diterima pelanggan sudah sesuai.

**Nota Percetakan yang sudah diproses** dikoreksi melalui **Edit nota diproses** di samping **Lihat Struk** di **Riwayat** atau di **Kasir > Percetakan** dengan izin `printing_receipt.processed:update`; ikuti **Q42**. Isi tanggal pada draft di tab Percetakan sebelum **Bayar / DP**; pengaturan tanggal invoice umum tidak tersedia untuk nota tersebut.

### Q11: Bagaimana cara mengunggah foto nota pengeluaran atau struk bukti transaksi pelanggan?
**A:** Aplikasi mengunggah bukti langsung ke penyimpanan R2:
1. Di modal bukti transaksi atau pengeluaran, klik **Pilih gambar bukti**.
2. Periksa pratinjau. Gunakan **Putar kiri** atau **Putar kanan** sampai orientasi benar, lalu klik **Unggah foto**.
3. File harus berupa JPEG, PNG, WebP, GIF, atau AVIF berukuran maksimum 5 MB.
4. Sistem mengecilkan dimensi, menghapus metadata, mengompresi, dan menyimpan rotasi gambar ke R2.
5. Jika penyimpanan R2 gagal, input **prnt.sc** akan muncul. Unggah gambar ke [prnt.sc](https://prnt.sc/) lalu tempel tautannya sebagai fallback.
6. Klik **Simpan** untuk mengaitkan bukti dengan transaksi.
7. OWNER atau role dengan izin `proof_upload:delete` dapat memilih **Hapus foto**. Foto R2 dihapus permanen, sedangkan bukti prnt.sc hanya dikosongkan tautannya.

### Q12: Bagaimana cara memulai (buka) dan mengakhiri (tutup) shift kerja kasir?
**A:** Ikuti langkah berikut untuk mengelola laci uang kasir:
- **Membuka Shift Kasir:**
  1. Buka sidebar **Lainnya > Shift Kasir** (`/shift`) saat baru masuk kerja.
  2. Ketikkan nominal modal uang tunai awal yang ada di dalam laci kasir fisik pada kolom kas awal.
  3. Klik tombol hitam **Mulai Shift**.
- **Mengakhiri Shift Kasir:**
  1. Kembali ke menu **Shift Kasir** atau klik foto profil Anda di kanan atas dan pilih **Tutup Shift**.
  2. Hitung total nominal fisik uang tunai di laci kasir secara manual, lalu ketikkan nilainya pada kolom Uang Tutup Laci Fisik.
  3. Masukkan catatan bila diperlukan, lalu klik tombol merah **Konfirmasi Akhiri Shift**. Sistem akan langsung membandingkan dengan catatan kas masuk sistem dan menampilkan selisih kas (jika ada).

### Q13: Bagaimana cara mengoreksi atau mengubah data laporan shift kasir yang sudah ditutup?
**A:** Jika terjadi kesalahan input saldo saat penutupan shift:
1. Pada tabel Riwayat Shift (tab **Riwayat** di halaman Shift Kasir), cari baris shift yang ingin diubah.
2. Klik ikon pensil (edit) di kolom aksi sebelah kanan.
3. Lakukan penyesuaian nilai saldo akhir atau catatan, lalu klik simpan (memerlukan izin `shift.update` / level Owner/Admin).

---

## 📌 Topik: Pelanggan & Piutang

### Q14: Bagaimana cara mendaftarkan pelanggan baru ke sistem?
**A:** Ikuti langkah berikut (memerlukan izin `customer.create`):
1. Buka sidebar **Pelanggan > Pelanggan** (`/customers`).
2. Klik tombol hitam **Tambah Pelanggan** di kanan atas (atau **Import Excel** jika ingin menambah massal).
3. Isi data pelanggan pada formulir: Nama Pelanggan (wajib), Tipe Pelanggan (default UMUM, AGEN, INDUSTRI, atau PEMERINTAH), Nomor HP/WhatsApp, Email, Perusahaan, Alamat, dan Catatan.
4. Klik **Simpan**.

### Q15: Bagaimana cara mencatat pembayaran cicilan atau pelunasan piutang pelanggan?
**A:** Ada dua cara untuk mencatat pelunasan piutang:
- **Cara 1: Melalui Halaman Pelanggan (Tab Piutang):**
  1. Buka menu **Pelanggan > Pelanggan**, pilih tab **Piutang** di navigasi atas.
  2. Cari invoice yang ingin dilunasi atau dicicil, lalu klik tombol **Bayar Piutang** di kolom Aksi.
  3. Di modal pembayaran, pilih satu atau beberapa **Metode Pembayaran** sekaligus (Tunai, QRIS, Debit, atau Transfer).
  4. Masukkan **Nominal Bayar** untuk setiap metode pembayaran yang dipilih (atau klik tombol **Lunasi Sisa** untuk mengisi otomatis nominal sisa tagihan).
  5. Tambahkan **Catatan Pembayaran** jika diperlukan (misal: "Transfer via Bank Mandiri"), lalu klik **Proses Pembayaran**.
- **Cara 2: Melalui Halaman Riwayat Transaksi:**
  1. Cari faktur transaksi tempo yang berstatus *Belum Lunas* (DP) di menu **Riwayat**, buka panel detail rincian.
  2. Klik tombol **Bayar Cicilan**, masukkan nominal cicilan yang dibayarkan, lalu klik **Simpan**.
- **Piutang manual:** Di detail pelanggan atau tab **Piutang**, buka bagian **Piutang Manual**, lalu klik **Bayar Piutang Manual** pada catatan yang dituju. Isi nominal lebih dari nol hingga maksimal sisa piutang dan pilih **satu metode**: Tunai, Debit, Kartu Kredit, QRIS, atau Transfer. Tambahkan catatan bila perlu, klik **Simpan Pembayaran**, lalu buka **Riwayat pembayaran**. Pembayaran boleh sebagian atau lunas; catatan lunas tetap tersedia melalui filter **Semua piutang**. Melihat memerlukan `customer.read`, menambah dan membayar memerlukan `customer.update`.

---

## 📌 Topik: Inventaris & Supplier

### Q16: Bagaimana cara melaporkan barang yang rusak, hilang, atau menyusut di gudang?
**A:** Buka menu Inventaris untuk mencatat kerugian barang:
1. Masuk ke halaman **Inventaris** (`/inventory`) dan klik tombol menu **Input / Transaksi**.
2. Pilih opsi **Laporkan Barang Rusak**.
3. Pilih produk yang mengalami kerusakan, masukkan jumlah stok yang rusak, dan tambahkan catatan/alasan kerusakan secara jelas.
4. Klik **Pilih gambar bukti** untuk mengunggah foto ke R2. Jika penyimpanan R2 gagal, gunakan input prnt.sc yang muncul.
5. Klik **Submit** untuk menyimpan laporan. Laporan barang rusak akan diproses atau diajukan untuk disetujui agar mengurangi kuantitas stok di sistem.

### Q17: Bagaimana cara menyelesaikan tugas operasional mingguan (seperti Proof Kebersihan)?
**A:** Ikuti langkah berikut untuk merekam kepatuhan tugas mingguan:
1. Di halaman Inventaris, buka tab **Tugas**.
2. Pada bagian **Tugas Mingguan**, Anda akan melihat daftar tugas operasional seperti **Proof Kebersihan Gudang**.
3. Klik pada tugas tersebut atau tombol aksi yang tersedia.
4. Klik **Pilih gambar bukti** untuk mengunggah foto kebersihan ke R2. Jika penyimpanan R2 gagal, gunakan input prnt.sc yang muncul.
5. Klik **Submit** agar tugas tersebut tercatat sebagai selesai.

### Q18: Bagaimana cara mengajukan Penerimaan Barang (Inbound Receipt) dari supplier?
**A:** Buka menu Inventaris untuk mencatat barang fisik yang datang:
1. Buka **Transaksi > Penerimaan Barang**, klik **Terima barang**, lalu **Pilih Pembelian Barang** yang berstatus APPROVED atau BARANG DITERIMA SEBAGIAN.
2. Periksa supplier, jumlah dipesan, jumlah yang sudah diterima, penerimaan lain yang masih PENDING, dan sisa pesanan. Pembelian parsial boleh dipilih lagi hanya untuk sisanya.
3. Pada setiap produk, pilih **Sesuai** atau **Tidak Sesuai** dan isi **Jumlah Diterima** tanpa melebihi sisa pesanan. Untuk jumlah 0, barang belum diterima; jika seluruh jumlah 0, dokumen dapat disetujui tanpa menetapkan pembayaran atau mencatat Pengeluaran. Periksa seluruh satuan beserta **HPP Unit**, **Harga Jual**, **Harga Jual Agen**, dan **Harga Jual Dinas**. Untuk barang Tidak Sesuai, harga bersifat opsional. Perbaiki HPP satuan otomatis yang tidak dapat dibulatkan tepat atau menghasilkan HPP acuan berbeda antar satuan. Catatan wajib bila jumlah berbeda dari jumlah dipesan yang tersedia.
4. Pilih **Transfer** atau **Giro**, dan isi tanggal jatuh tempo untuk Giro. Klik **Ajukan ke Owner**. Dokumen masuk riwayat dengan status PENDING dan belum mengubah stok. Metode yang ditetapkan pada penerimaan pertama yang berisi barang dipakai untuk penerimaan berikutnya.
5. OWNER atau role dengan `inventory.inbound_receipt.approve:update` membuka **Proses**, lalu dapat mengubah kesesuaian, jumlah, catatan, dan harga sebelum menyetujui atau menghapus tiap produk. Periksa konfirmasi jika harga dapat memengaruhi produk lain dalam grup. Izin edit dokumen memakai `inventory.inbound_receipt.edit:update`.
6. Dokumen tetap PENDING selama ada produk **Belum Ada Aksi**. Role dengan `inventory.inbound_receipt.reject:update` dapat menolak seluruh dokumen dan wajib memberi alasan.
7. Setelah semua produk disetujui, penerimaan otomatis APPROVED dan stok bertambah atomik sesuai qty final. Barang Sesuai memperbarui HPP dan harga jual produk untuk satuan terkait; barang Tidak Sesuai tidak mengubah harga. Untuk Daftar Belanja baru, penerimaan pertama yang berisi barang dan disetujui mencatat satu Pengeluaran sebesar total pembelian penuh, termasuk penerimaan sebagian. Untuk satuan pengikut Auto, sistem menyesuaikan HPP satuan acuan dan menghitung ulang satuan terkait sesuai aturan grup. Dalam mode **stok bersama**, canonical dan semua varian ikut berubah sebagai satu **bundle** Log Stok.
8. Di Supplier > Pembelian Barang, gunakan **Barang Sudah Diterima?** untuk membuka modal dengan PB langsung terpilih, atau **Lihat Riwayat Penerimaan Barang** untuk membuka riwayat terfilter. Status PB menjadi **BARANG DITERIMA SEBAGIAN** atau **BARANG DITERIMA**; klik baris untuk membandingkan jumlah dipesan, diterima, pending, dan sisa.

### Q19: Bagaimana cara membuat Daftar Belanja kebutuhan toko ke supplier?
**A:** Daftar Belanja baru memakai satu persetujuan untuk menetapkan jumlah dan harga beli:
1. Buka menu **Supplier**, lalu pilih tab **Daftar Belanja** dan klik **Buat Daftar Belanja**.
2. Pilih supplier tujuan yang wajib diisi. Jika belum ada, isi nama dan tipe pada tambah supplier cepat; supplier baru otomatis terpilih.
3. Cari produk melalui nama atau SKU, isi jumlah, lalu pilih **Satuan** bila ingin memakai varian lain dalam grup stok yang sama. Pergantian tidak mengonversi angka: 12 pcs menjadi 12 dus.
4. Tambahkan catatan bila perlu, lalu klik **Simpan Daftar Belanja**. Status menjadi **Diajukan**; belum ada Pengeluaran atau perubahan stok.
5. Pemegang izin `supplier.shopping_request.edit:update` dapat memakai **Tindakan lainnya > Edit daftar** untuk mengubah supplier, produk, satuan, jumlah, atau catatan sebelum diputuskan.
6. Pemegang izin `supplier.goods_purchase.approve:update` membuka **Tinjau & Setujui**, lalu mengisi **Jumlah**, **Satuan**, dan **Harga Beli** aktual pada satu modal. **Perbarui HPP** tercentang secara default dan dapat dimatikan; HPP baru diterapkan setelah penerimaan barang yang sesuai disetujui.
7. Jumlah nol berarti barang tidak disetujui. Jumlah di atas kebutuhan memerlukan konfirmasi; minimal satu barang harus disetujui.
8. Klik **Setujui dan Catat Pembelian** sekali. Daftar dan Pembelian Barang langsung disetujui. Pilih pembayaran saat menerima barang; satu **Pengeluaran kategori Bahan** sebesar total pembelian penuh dicatat saat penerimaan pertama yang berisi barang disetujui. Stok berubah setelah Penerimaan Barang disetujui.
9. Pemegang izin `supplier.goods_purchase.reject:update` dapat menolak seluruh daftar dengan alasan. Penolakan tidak membuat Pembelian Barang atau Pengeluaran.
10. Pemegang izin `supplier.shopping_request.delete:delete` dapat memilih **Tindakan lainnya > Hapus daftar**, memeriksa stok yang akan dikurangi, mengisi alasan, lalu mengonfirmasi. Stok penerimaan yang disetujui dikurangi jika stok cukup dan riwayatnya dapat dipastikan. Pilih status **Dibatalkan** untuk melihat riwayat. Nama daftar bisa dipakai lagi. Pengeluaran dan pembayaran tetap tercatat; HPP dan harga jual tidak otomatis diubah. Pengembalian uang atau perubahan giro memerlukan proses terpisah.

### Q28: Bagaimana cara melakukan Check Out bagi staf gudang?
**A:** Tugas inventaris langsung tersedia sesuai izin akun. Di akhir hari, gunakan Check Out untuk menyimpan ringkasan pekerjaan:
1. Buka **Inventaris > Tugas** dan kerjakan tugas harian serta mingguan.
2. Klik **Check Out** pada panel penutupan hari di halaman Inventaris.
3. Periksa ringkasan pergerakan stok, status dokumen, dan tugas wajib. Selesaikan tugas wajib atau isi alasan pengecualian per kategori yang belum selesai.
4. Pada hari Sabtu (Asia/Jakarta), **Proof Kebersihan** termasuk tugas wajib; isi alasan pengecualian bila belum selesai.
5. Klik **Tutup Hari**. Sesi untuk toko dan tanggal bisnis tersebut otomatis dibuat atau diperbarui setelah validasi berhasil.
6. Buka **Riwayat > Riwayat Tugas Harian** untuk membaca snapshot Check Out.

### Q29: Bagaimana cara melakukan marking pada Surat Jalan (Delivery Order)?
**A:** Alur marking menggantikan verifikasi Surat Jalan untuk pencatatan internal gudang:
1. Buka halaman **Inventaris** (`/inventory`), pilih tab **Ringkasan** (atau tab **Transaksi > Surat Jalan**).
2. Temukan dokumen Surat Jalan yang berstatus **UNMARKED** (belum ditandai) pada antrean penanganan gudang.
3. Klik tombol **Marking** pada baris Surat Jalan tersebut.
4. Pada modal yang muncul, pilih salah satu status penanganan:
   - **Selesai (COMPLETED):** Surat jalan telah ditandatangani penerima, barang dikirim lengkap, dan stok sesuai.
   - **Belum Dikirim (NOT_DELIVERED):** Barang belum dikirim ke pelanggan. (Memerlukan catatan).
   - **Perlu Tanda Tangan (NEEDS_SIGNATURE):** Pengiriman selesai, namun bukti tanda tangan fisik belum lengkap. (Memerlukan catatan).
   - **Perlu Follow Up (NEEDS_FOLLOW_UP):** Ada masalah pengiriman yang perlu ditindaklanjuti. (Memerlukan catatan).
   - **Ditunda (POSTPONED):** Pemeriksaan barang ditunda. (Memerlukan catatan).
   - **Tidak Relevan (NOT_RELEVANT):** Surat jalan salah input atau tidak relevan untuk gudang. (Memerlukan catatan).
5. Klik **Simpan**. Surat Jalan dengan status pengecualian wajib menyertakan alasan pada kolom catatan yang disediakan. **Catatan:** Sesi Check Out harian staf gudang akan terblokir jika masih ada Surat Jalan berstatus **UNMARKED** di antrean.

---

## 📌 Topik: Keuangan & Pengaturan

### Q20: Bagaimana cara mencatat pengeluaran operasional toko?
**A:** Buka menu keuangan untuk mencatat pengeluaran harian:
1. Buka sidebar **Keuangan > Keuangan** (`/keuangan`).
2. Klik tombol **Tambah Pengeluaran** untuk memasukkan pengeluaran baru.
3. Isi nama pemohon, nominal, kategori, dan catatan bila perlu. Untuk membuat kategori baru, pilih **Tambah kategori**, isi nama, dan klik **Simpan kategori**. Kategori dapat digunakan kembali dan dipilih di **Filter kategori**.
4. **Unggah Bukti Pengeluaran:** Klik **Pilih gambar bukti** untuk mengunggah foto nota ke R2 dan periksa pratinjaunya. Jika penyimpanan R2 gagal, input prnt.sc akan muncul sebagai fallback. Setelah bukti siap, klik **Simpan**.
5. Kenali sumbernya: badge **Manual** berasal dari form, badge **Pembelian Barang** dibuat otomatis setelah approval final dan tidak dapat diedit atau dihapus dari Keuangan, sedangkan badge **Daftar Belanja (Legacy)** hanya menandai data lama.

### Q21: Bagaimana cara mengekspor data Laporan Keuangan ke format Excel atau PDF?
**A:** Anda dapat mengunduh salinan data laporan keuangan ke perangkat Anda:
1. Di bagian kanan atas halaman Laporan Keuangan, klik tombol **Ekspor**.
2. Untuk template Excel bulanan, pilih **bulan dan tahun**. Berkas berisi delapan sheet: **LAP KEU**, **BERSIH**, nama bulan, **RC [bulan]**, **RP [bulan]**, **PENGELUARAN BELANJA**, **PIUTANG & HUTANG**, dan **PANDUAN**.
   Sheet **PANDUAN** menjelaskan alur angka, contoh perhitungan, dan tautan ke bagian laporan. Tujuh sheet laporan memiliki warna dan ringkasan di atas tabel. Kolom kiri tidak dibekukan, sehingga seluruh tabel bebas digeser; header atas tetap terlihat pada sheet rincian.
3. Klik **Unduh Excel**. Modal awal dan stok akhir memakai nilai inventaris yang tersedia, sementara hutang memakai saldo yang tercatat. Stok negatif tidak dihitung; Stok bersama diurai dari satuan terbesar ke terkecil memakai HPP tiap satuan dan dihitung sekali. HPP kosong dikonversi otomatis dari satuan terkecil yang memiliki HPP; seluruh HPP kosong atau riwayat HPP belum tersedia ditandai belum lengkap. Jumlah harta = modal awal + piutang − hutang − stok akhir. Unduh ulang jika data aplikasi berubah.
   **RP bulan** berisi pengeluaran manual. **PENGELUARAN BELANJA** memuat transfer pembelian berdasarkan tanggal pengeluaran, transfer belanja terdahulu berdasarkan tanggal pembayaran, dan giro berdasarkan bulan jatuh tempo. **PIUTANG & HUTANG** memuat sisa giro dan hutang manual pada akhir periode. Kas memakai pembayaran aktual giro pada tanggal dibayar; jika riwayat giro belum diketahui, nilai terkait belum lengkap.
4. Untuk ekspor sebelumnya, buka **Jurnal transaksi · Excel / PDF**, pilih format serta periode **Harian**, **Mingguan**, **30 hari terakhir**, atau **Bulanan** (bulan berjalan), lalu unduh.
   *(Filter tanggal di halaman tidak mengubah berkas ekspor. Isi berkas mengikuti periode yang dipilih dalam dialog Ekspor.)*
5. Di halaman laporan, KPI **Pengeluaran** mencakup pengeluaran manual dan Pembelian Barang. **Laba Bersih (Estimasi)** adalah Laba Kotor dikurangi seluruh pengeluaran; angka ini bukan laba akrual formal atau bukti pembayaran supplier.
6. Anda dapat meminta Pak Teladan, misalnya **"ekspor laporan keuangan"**, untuk mengunduh jurnal transaksi. Jika periode dan format tidak disebutkan, Pak Teladan memakai **30 hari terakhir** dan **PDF**. Template delapan sheet diunduh melalui dialog **Ekspor** di halaman Laporan Keuangan.
7. Untuk permintaan analisis keuangan, Pak Teladan membaca seluruh bagian laporan dalam rentang yang sama: ringkasan, metode pembayaran, produk teratas, kategori, sales, shift, kehilangan stok, dan tren. Saran dibuat dari gabungan metrik tersebut, bukan dari omzet saja.
8. Ekspor dari chat menampilkan kartu tanpa mengunduh otomatis. Klik **Download PDF/Excel** saat siap; setelah berhasil tombol berubah menjadi **Download ulang** dan Pak Teladan menampilkan saran dari laporan yang sama. OWNER dapat memakai quick prompt **Rekap finansial bulanan**.

### Q22: Bagaimana cara mengubah informasi profil toko yang muncul di struk belanja?
**A:** Untuk memperbarui logo, nama, atau alamat di struk penjualan:
1. Buka sidebar **Lainnya > Pengaturan** (`/settings`), lalu pilih tab **Info Toko**.
2. Lakukan perubahan pada logo toko, nama toko, alamat, dan nomor telepon yang ingin ditampilkan pada struk/invoice.
3. Klik **Simpan** (memerlukan permission `settings.update`).

### Q23: Bagaimana pemilik toko mengatur hak akses atau izin bagi admin, kasir, dan staf gudang?
**A:** Pengaturan hak akses (RBAC) hanya dapat diakses oleh **OWNER**:
1. Buka sidebar **Lainnya > Pengaturan** (`/settings`), lalu pilih tab **RBAC**.
2. Periksa ringkasan statistik peran pada **Ringkasan Role** (menampilkan jumlah halaman aktif, aksi aktif, custom permission, dan total peringatan sensitif).
3. Bandingkan izin modul secara terpusat melalui tabel **Matrix Modul**.
4. Sesuaikan izin untuk masing-masing peran (ADMIN, CASHIER, SALES, INVENTORY) dalam dua lapisan di panel editor:
   - **Akses Halaman:** Menentukan apakah role boleh membuka halaman tertentu (seperti `/products`, `/customers`, atau `/inventory`).
   - **Aksi Resource:** Menentukan izin `create`, `read`, `update`, dan `delete` untuk resource tertentu.
5. Klik tombol **Review & Simpan** di pojok kanan atas.
6. Tinjau log ringkasan perubahan pada modal yang muncul. Jika terdapat perubahan pada permission sensitif (misalnya keuangan, RBAC, nomor WhatsApp, HPP, atau approval), Anda wajib memberikan konfirmasi persetujuan tambahan sebelum data disimpan secara resmi.
7. Untuk mengatur transaksi langsung final per role, buka modul **Auto Approve Transaksi** lalu aktifkan aksi **Buat**. Jika dimatikan, checkout role tersebut masuk `PENDING_APPROVAL`; permission ini tidak memberikan hak approve transaksi milik user lain.

---

## 📌 Topik: Produksi & Tim Sales

### Q24: Bagaimana cara memperbarui status pengerjaan pesanan cetak (Job Order)?
**A:** Operator produksi dapat memantau status pesanan di menu **Produksi** menggunakan Kanban Board:
- Pindahkan kartu pesanan dengan menyeret kartu pesanan (*drag-and-drop*) ke tahapan: **Baru** -> **Sedang Diproses (PRINTING)** -> **Siap Diambil (READY_PICKUP)** -> **Selesai (DELIVERED)**.

### Q25: Bagaimana cara mengirim notifikasi pengambilan barang kepada pelanggan?
**A:** Sistem dapat mengirimkan pesan WhatsApp ke pelanggan ketika pesanan telah masuk ke status "Siap Diambil":
- Pada papan Kanban, jika kartu pesanan berada di kolom **Siap Diambil**, klik tombol WhatsApp pada kartu tersebut untuk mengirim pesan pemberitahuan pengambilan barang otomatis ke nomor pelanggan yang terdaftar.

### Q26: Bagaimana cara mengelola daftar anggota Sales?
**A:** Buka menu **Tim Sales** di sidebar untuk mengelola anggota:
- **Tambah Sales:** Klik **Tambah Sales**, ketikkan nama anggota sales baru, lalu klik simpan.
- **Ubah Sales / Toggle Aktif:** Klik tombol edit untuk mengubah nama, atau gunakan tombol toggle cepat di daftar sales untuk merubah statusnya (Aktif/Nonaktif). Hanya sales dengan status "Aktif" yang muncul di halaman kasir (POS).

### Q27: Bagaimana cara melihat riwayat transaksi yang ditangani oleh Sales tertentu?
**A:** Untuk melacak kontribusi penjualan sales:
1. Buka menu **Tim Sales** di sidebar.
2. Klik pada baris/kartu nama sales bersangkutan.
3. Sistem akan memunculkan rincian profil sales beserta daftar maksimal 20 transaksi terbaru yang ditangani oleh sales tersebut.

### Q36: Bagaimana cara mengekspor rekap pelanggan per tipe ke Excel atau PDF?
**A:** Rekap pelanggan dapat diunduh berdasarkan periode dan tipe pelanggan:
1. Buka menu **Pelanggan**, lalu temukan bagian **Rekap Pelanggan**.
2. Klik tombol **Ekspor**.
3. Pilih periode **Harian**, **Mingguan**, **Bulanan**, atau **Tahunan**. Periode mingguan berjalan dari Senin sampai hari ini.
4. Pilih **Excel (.xlsx)** untuk mendapatkan sheet **Agen**, **Umum**, **Pemerintah**, **Industri**, dan **Ringkasan**, atau pilih **PDF** untuk section per tipe dan halaman **Ringkasan Semua Tipe**.
5. Setiap tipe memuat pelanggan yang bertransaksi pada periode tersebut, diurutkan berdasarkan Total Belanja, Produk Favorit, dan Top 10 Produk. Ringkasan terakhir memuat KPI dan Analisis AI.
6. Anda juga dapat meminta **"ekspor rekap pelanggan"** kepada Pak Teladan. Jika periode dan format tidak disebutkan, ekspor memakai **30 hari terakhir** dan **PDF**.
7. File tidak diunduh otomatis. Klik **Download PDF/Excel** pada kartu; setelah berhasil tombol berubah menjadi **Download ulang** dan Pak Teladan menampilkan saran berdasarkan dataset yang sama. OWNER dapat memakai quick prompt **Rekap pelanggan bulanan**.

### Q37: Bagaimana cara membaca notifikasi penting dari sistem dan Pak Teladan?
**A:** Setiap akun memiliki pusat notifikasi sendiri:
1. Periksa ikon **bell** di kanan atas. Badge merah menunjukkan jumlah notifikasi yang belum dibaca.
2. Klik bell untuk melihat update terbaru, termasuk Persetujuan Transaksi, permintaan stok tunggal atau massal, Daftar Belanja, dan Pembelian Barang.
3. Klik satu notifikasi untuk menandainya sebagai sudah dibaca sekaligus membuka halaman kerja terkait. Pembuat request tidak mendapat notifikasi untuk aksinya sendiri.
4. Klik **Tandai semua dibaca** setelah seluruh update direview. Badge hilang saat tidak ada unread, tetapi riwayat yang sudah dibaca tetap tersedia.
5. Tombol Pak Teladan memakai unread count yang sama. Saat dibuka, Pak Teladan memberi heads-up dan menampilkan hingga tiga shortcut notifikasi terbaru.
6. Inbox tetap tersimpan di server walaupun izin browser push tidak aktif. Browser push dan suara hanya menjadi channel tambahan sesuai pengaturan perangkat.

### Q39: Bagaimana cara melihat Catatan Perubahan aplikasi?

**A:** Buka **Lainnya → Catatan Perubahan**.

1. **Lihat pembaruannya.** Riwayat lengkap tersusun dari yang terbaru. Pilih **7 hari terakhir** untuk hari ini dan enam hari sebelumnya berdasarkan WIB.
2. **Kenali tampilannya.** Perbesar screenshot jika tersedia, atau lihat gambar berlabel **Ilustrasi fitur**. Ikuti tiga langkah di bawah setiap catatan. Tombol **Buka fitur** mengikuti izin akses Anda.
3. **Cek sorotan.** Klik **Sorotan 7 hari** untuk membuka popup **Apa yang baru**. Semua pembaruan tampil dalam satu daftar ringkas: nama fitur dan satu kalimat manfaat. Klik baris untuk membuka fitur sesuai izin akses, atau **Lihat semua catatan** untuk gambar dan alur lengkap. Tutup dengan **Sudah lihat**, **Tutup**, atau **Escape**. Popup otomatis hanya muncul untuk pembaruan yang belum dilihat pada akun dan browser tersebut.

### Q40: Bagaimana cara membuat dan memproses nota Percetakan?

**A:** Nota Percetakan dikerjakan langsung dari lembar nota di **Kasir > Percetakan**.

1. Pilih subtab **SPANDUK**, **PERCETAKAN**, **PLAT**, **STEMPEL**, atau **PRINT**. Daftar nota mengikuti subtab yang dipilih.
2. Klik **Buat Nota Kosong**. Nota langsung tersimpan sebagai draft; **No. Nota** terisi otomatis dan boleh diubah selama draft. **Judul nota** di atas lembar awalnya memakai nomor nota dan bisa diganti selama draft. Judul tersimpan otomatis sebagai penanda internal, tidak tampil pada cetakan/PDF, dan bisa dipakai untuk pencarian daftar bersama nomor atau pelanggan.
3. Isi pelanggan, nama item atau file, bahan, banyaknya, dan harga langsung di lembar nota. Nama item dan bahan boleh diketik bebas. Buka **Baris dan hubungan stok > Hubungkan stok** bila perlu; **Jumlah pemakaian** adalah total bahan untuk baris tersebut. Tunggu **Tersimpan** sebelum berpindah atau membayar. Jika **Gagal menyimpan**, pilih **Coba simpan lagi**; **Muat ulang versi tersimpan** meminta konfirmasi sebelum mengganti perubahan lokal.
4. Klik **Bayar / DP**, pilih metode dan pelunasan atau **DP**, lalu gunakan **Cetak / PDF > Cetak** atau **Unduh PDF**. Satu nota menjadi satu transaksi. Stok bahan terkait berkurang ketika transaksi berhasil; draft dan pencetakan draft tidak mengurangi stok. Pembayaran lanjutan mengikuti transaksi. Koreksi nota diproses memerlukan izin `printing_receipt.processed:update`, default hanya Owner dan dapat diberikan ke role lain melalui Hak Akses; ikuti **Q42**. Pada ponsel, buka **Daftar nota** untuk daftar tersimpan; gunakan **Perkecil nota** dan **Perbesar nota** untuk mengatur tampilan.
5. Buka **Riwayat**, pilih **Kategori transaksi: PERCETAKAN** lalu **Subkategori** asal nota, atau cari nomor nota. Penjualan barang berada di **ATK** dengan subkategori dari kategori produk. Mengganti kategori mengosongkan subkategori dan kembali ke halaman pertama; **Semua Kategori** menonaktifkan subkategori. Layanan cetak lama tanpa jenis tercatat tetap berada di PERCETAKAN tanpa subkategori. Buka transaksi untuk mencetak ulang menggunakan template asal.

### Q38: Bagaimana cara mengajukan dan memutuskan Pembelian Barang?
**A:** Pembelian Barang baru dibuat otomatis saat Daftar Belanja disetujui. Untuk menyelesaikan Pembelian Barang lama:
1. Buka **Supplier > Daftar Belanja**. Pada kartu daftar lama yang sudah disetujui tanpa pembelian, klik **Lengkapi Pembelian Lama**.
2. Pilih **Daftar Belanja yang sudah disetujui**. Supplier dan seluruh produk yang di-ACC muncul otomatis. Satu Daftar Belanja hanya dapat memiliki satu pembelian PENDING atau APPROVED; jika pembelian ditolak, daftar dapat dipilih kembali.
3. Periksa jumlah setiap produk. Nilai awal mengikuti jumlah yang di-ACC. Isi **harga produk terbaru** yang nilai awalnya memakai HPP master.
4. Jika harga terbaru berbeda dari HPP master, tentukan per produk apakah sistem perlu **update HPP**. Periksa **Total pengeluaran**, lalu klik **Ajukan Pembelian Barang**. Status awalnya **PENDING**.
5. Role dengan `supplier.goods_purchase.approve:update` membuka review dan memutuskan setiap produk lewat **Setujui**, **Edit**, atau **Hapus**. Produk baru dapat ditambahkan dari master produk toko selama memakai unit besar seperti dus, box, pak, karton, bal, atau sak.
6. Produk yang belum diputuskan ditandai **Belum Ada Aksi**. Mengedit produk yang sudah disetujui memerlukan konfirmasi dan mengembalikannya ke status tersebut. Perubahan tersimpan langsung, dan minimal satu produk harus tetap ada.
7. Ketika seluruh produk disetujui, Pembelian Barang otomatis menjadi **APPROVED**, modal tertutup, pilihan update HPP diterapkan, dan satu **Pengeluaran kategori Bahan** dibuat dari total final.
8. Role dengan `supplier.goods_purchase.reject:update` dapat menolak seluruh pembelian dengan alasan wajib. Default izin approve dan reject hanya OWNER serta dapat didelegasikan melalui RBAC.
9. Pengajuan, review, approval final, penolakan, dan retry Pembelian Barang **tidak mengubah stok**. Stok baru bertambah ketika Penerimaan Barang terkait selesai disetujui per item.
10. Pada pembelian APPROVED atau BARANG DITERIMA SEBAGIAN, klik **Barang Sudah Diterima?** untuk membuka modal penerimaan dengan PB langsung terpilih. Klik **Lihat Riwayat Penerimaan Barang** untuk membuka riwayat terfilter.
11. Setelah penerimaan disetujui, status PB menjadi **BARANG DITERIMA SEBAGIAN** atau **BARANG DITERIMA**. Klik baris PB untuk melihat perbandingan dipesan, diterima, pending, dan sisa. Finalisasi penerimaan menambah stok; pada mode stok bersama, canonical dan semua varian dicatat sebagai satu bundle Log Stok.

---

### Q41: Bagaimana cara mencatat piutang manual pelanggan?
**A:** Gunakan untuk utang lama atau tagihan di luar kasir tanpa membuat transaksi penjualan, order, atau mengubah stok. Melihat memerlukan `customer.read`; menambah dan membayar memerlukan `customer.update`.
Pelanggan yang memiliki riwayat piutang manual tidak dapat dihapus, termasuk yang sudah lunas, agar riwayat piutang dan pembayaran tetap tersimpan.
1. Buka **Pelanggan** (`/customers`), lalu buka detail pelanggan yang sudah terdaftar.
2. Di bagian **Piutang Manual**, klik **Tambah Piutang**. Pelanggan mengikuti profil yang dibuka.
3. Isi **Nominal piutang** lebih dari nol, **Tanggal utang** paling lambat hari ini dalam WIB, dan **Tanggal jatuh tempo** sama dengan atau setelah tanggal utang. Tambahkan **Catatan** bila perlu.
4. Klik **Simpan Piutang**. Catatan muncul pada detail pelanggan dan bagian **Piutang Manual** di tab **Piutang**.
5. Untuk cicilan atau pelunasan, klik **Bayar Piutang Manual**, isi nominal hingga maksimal sisa piutang, pilih satu metode, lalu klik **Simpan Pembayaran**. Buka **Riwayat pembayaran** untuk memeriksa pembayaran; catatan lunas tetap tersedia melalui filter **Semua piutang**.

### Q42: Bagaimana cara mengedit nota Percetakan yang sudah diproses?
**A:** Gunakan koreksi ketika isi nota, harga, tanggal, atau pemakaian bahan perlu diperbaiki. Izin `printing_receipt.processed:update` default hanya untuk Owner; izin dapat diberikan ke role lain melalui **Hak Akses**. Nota dibatalkan atau refund tidak dapat diedit.

1. Di **Riwayat**, klik **Edit nota diproses** di samping **Lihat Struk** pada transaksi Percetakan, atau buka nota tersimpan di **Kasir > Percetakan** dan pilih **Edit nota diproses**. Baca peringatan: nota yang sebelumnya lunas dapat kembali memiliki piutang jika total naik. Centang **Saya memahami dampaknya terhadap transaksi, stok, dan piutang.**, lalu klik **Tetap edit nota** untuk melanjutkan.
2. Koreksi nama pelanggan, tanggal, catatan, item, harga, atau hubungan bahan. Perubahan **tidak tersimpan otomatis**. Nomor nota dan pelanggan terdaftar tetap; riwayat pembayaran tidak dihapus. Total baru tidak boleh lebih kecil daripada pembayaran bersih yang sudah diterima, yaitu pembayaran setelah dikurangi kembalian. Jika keluar sebelum menyimpan, konfirmasikan pembuangan perubahan.
3. Klik **Tinjau perubahan**. Bandingkan total, pembayaran, piutang, status, dan pemakaian bahan **sebelum** serta **sesudah**. Kembali ke penyuntingan bila masih perlu diperbaiki.
4. Klik **Simpan dan perbarui transaksi**. Nota, transaksi, penyesuaian stok bahan beserta jurnalnya, piutang, dan status diperbarui bersama. Nota **menunggu persetujuan** tetap pending; stok dan piutang baru diterapkan setelah disetujui. Jika penyimpanan gagal, periksa pesan lalu tinjau ulang sebelum mencoba lagi.

---

### Q43: Bagaimana cara mengatur pembulatan harga jual?

**A:** Buka **Pengaturan > Pembulatan Harga**. Default izin pengelolaan hanya Owner; melalui RBAC, Owner dapat memberi izin **Lihat** atau **Ubah** pada `settings.price_rounding` kepada role lain yang memiliki akses halaman Pengaturan.

1. Atur saklar aktif, **Kelipatan** dan **Ambang naik**. Default kelipatan Rp500 dengan ambang Rp50: Rp4.049 menjadi Rp4.000, Rp4.050 menjadi Rp4.500, Rp4.500 tetap, Rp4.549 menjadi Rp4.500, dan Rp4.550 menjadi Rp5.000. Ambang dihitung dari sisa terhadap kelipatan bawah; kelipatan dan ambang dapat disesuaikan.
2. Cari dan centang satu atau beberapa **Kategori yang dikecualikan**, lalu klik **Simpan pengaturan**. Semua harga produk pada kategori terpilih, termasuk harga normal, Agen/Dinas, rumus, dan harga khusus nota, tidak dibulatkan. Kosongkan pilihan untuk menerapkan aturan ke semua kategori. Pratinjau langsung menunjukkan aturan untuk kategori yang tidak dikecualikan. Harga asal tetap disimpan; HPP, diskon, pajak, dan jasa percetakan tidak dibulatkan oleh aturan ini.
3. Buka **Produk** atau **Kasir**, lalu pilih badge **Dibulatkan ke atas** atau **Dibulatkan ke bawah** untuk melihat harga asal, harga final, dan selisih. Badge mendukung sentuhan, klik, serta keyboard; harga yang tidak berubah tidak memiliki badge. Transaksi final terdahulu tetap memakai harga yang tersimpan saat transaksi dilakukan.

Kebijakan terakhir yang berhasil dimuat disimpan untuk tampilan offline. Jika kebijakan belum pernah dimuat, pembayaran produk menunggu pengaturan tersedia. Saat sinkronisasi, server memeriksa ulang harga memakai kebijakan yang berlaku dan mengikuti mekanisme penyesuaian/approval yang sudah ada.

### Q44: Bagaimana cara mencatat hutang pemasok?

**A:** Buka **Keuangan**, lalu pilih **Tambahkan Hutang** pada bagian Hutang Pemasok. Isi pemasok, nominal, dan tanggal hutang. Jatuh tempo, catatan, dan pembayaran awal bersifat opsional.

Untuk pembayaran berikutnya, pilih **Catat pembayaran** pada hutang yang belum lunas. Pembayaran dapat sebagian atau sekaligus; nominal tidak boleh melebihi sisa hutang. Pencatatan awal memerlukan izin `expense:create`, dan pembayaran berikutnya memerlukan `expense:update`. Saldo hutang manual yang dicatat masuk laporan bulanan sesuai tanggal; pembayaran hutang tidak otomatis menjadi pengeluaran.

Di bagian **Giro Pembelian**, giro lama berstatus **Belum diketahui** sampai riwayatnya diperiksa. Pilih **Periksa riwayat**, hubungkan hutang manual yang sama bila ada, periksa pembayaran yang sudah tersimpan, dan tambahkan pembayaran sebelumnya beserta tanggalnya tanpa mengulang yang sudah ada. Centang bahwa riwayat pembayaran sudah lengkap, lalu simpan. Untuk giro yang sudah diperiksa, pilih **Catat pembayaran** dan isi nominal serta tanggal pembayaran aktual. Pembayaran dapat sebagian atau lunas. Melihat giro memerlukan `expense:read`; pemeriksaan dan pembayaran memerlukan `expense:update`.

Untuk menghubungkan giro yang sudah diperiksa dengan hutang manual yang benar-benar sama, pilih **Hubungkan hutang manual** dan pilih hutang bernominal sama. Periksa catatan kedua hutang, riwayat pembayaran, dan bukti, tentukan setiap pembayaran yang cocok sebagai pembayaran yang sama atau transaksi berbeda, lalu centang konfirmasi dan simpan. Pembayaran yang sama dihitung sekali dan catatan kedua hutang disimpan pada giro. Pembayaran yang dipindahkan masuk arus kas giro pada tanggal aslinya; periksa pengeluaran manual agar tidak tercatat dua kali.

### Q45: Bagaimana cara menyiapkan dan memeriksa transaksi offline?

1. Saat online, masuk sebagai kasir asal, buka **Kasir > Offline Sync**, buat dan ulangi PIN offline, lalu pilih **Siapkan POS offline**. Siapkan ulang sedikitnya setiap tujuh hari dan setelah pembaruan aplikasi. PIN mengenkripsi halaman POS; katalog dan antrean transaksi belum terenkripsi.
2. Saat offline, buka alamat POS, pilih akun, masukkan PIN dan pilih **Buka POS offline**. Transaksi tetap diperiksa server; jangan hapus data situs sebelum sinkronisasi.
3. Setelah terhubung, masuk sebagai kasir asal dan periksa **Offline Sync**. Owner dapat mengunduh transaksi yang belum tersimpan di server, termasuk transaksi lama tanpa identitas, untuk rekonsiliasi tanpa menetapkan asal otomatis.

### Q46: Bagaimana cara mereset hanya riwayat harga atau sub-data tertentu?

**A:** Fitur ini hanya untuk Owner dan hanya menghapus data toko yang sedang login. Penghapusan tidak dapat dikembalikan.

1. Buka **Pengaturan > Reset Database**. Klik **Hapus Semua Pilihan** bila perlu, lalu centang hanya **Katalog Produk > Riwayat Harga**. Produk, stok, dan harga saat ini tetap tersimpan. Checkbox kategori memilih atau melepas seluruh sub-data; tanda sebagian berarti beberapa sub-data dipilih. **Pilih Semua** mencentang semua pilihan.
2. Klik **Lihat Dampak Reset** dan periksa jumlah data serta data terkait dengan ikon kunci yang wajib ikut terhapus. Pilih sub-data dependensi yang diwajibkan. Jika **Transaksi Penjualan** terhubung ke nota, pilih juga **Penjualan & Keuangan > Nota Percetakan**. Memilih **Nota Percetakan** saja mempertahankan transaksi; urutan nomor nota tetap berlanjut. Pelanggan dengan piutang manual tetap dilindungi dan tidak dapat di-reset. Pengeluaran yang terhubung ke giro atau belanja terdahulu, termasuk giro yang belum memiliki catatan hutang, serta pembelian yang terhubung ke catatan hutang yang dilindungi, tidak dapat di-reset. Mengubah pilihan membatalkan preview serta teks konfirmasi; lihat dampak kembali.
3. Tutup shift kasir dan tunggu import atau operasi batch selesai. Ketik **RESET DATABASE** persis, lalu klik **Reset Data Terpilih**. Akun pengguna, pengaturan toko, RBAC, kategori global, dan chat assistant tetap dipertahankan. Pak Teladan hanya memandu; Owner memilih dan menjalankan reset sendiri.

### Q47: Bagaimana cara membaca Nilai Inventaris dari HPP?

1. Buka **Produk** dan lihat kartu **Nilai Inventaris**. Pencarian dan kategori menyaring grup yang dihitung; satu grup tetap masuk sekali meskipun hanya satu satuannya yang cocok. Produk dengan nama sama dalam satu toko, termasuk akhiran -new pada nama, otomatis dinilai sekali meskipun ID atau grup stoknya berbeda. Sumber saldo mengikuti perubahan stok nyata terakhir; edit harga tidak mengganti sumber dan saldo yang habis tetap nol. Angka, ukuran, dan model tetap dibedakan; akhiran -new pada SKU saja tidak menyatukan produk berbeda.
2. Stok bersama diurai otomatis dari satuan terbesar ke terkecil, lalu tiap bagian memakai HPP satuannya. HPP kosong dihitung lewat konversi dari satuan terkecil yang memiliki HPP. Contoh 25 pcs dengan 1 dus = 10 pcs, HPP dus Rp9.000 dan pcs Rp1.000 bernilai **Rp23.000**. Jika HPP dus kosong, nilainya **Rp25.000**. HPP nol tetap terisi; penghitungan berjalan tanpa memilih acuan harga atau memperbaiki satuan dasar.
3. **Nilai sebagian · HPP belum tersedia** menandai produk yang seluruh HPP-nya kosong. Stok nol atau negatif tidak menambah nilai. Laporan bulanan menggunakan metode yang sama; saldo historis HPP yang belum tercatat atau belum lengkap dibiarkan kosong, dan jumlah harta menunggu saldo lengkap.

### Q48: Bagaimana cara mencatat pemasukan tanpa transaksi?

1. Buka **Keuangan**, lalu klik **Tambah Pemasukan** di bagian **Pemasukan tanpa transaksi**.
2. Isi tanggal, keterangan / sumber, nominal, dan kategori RC: **ATK, Cetak, Spanduk, Print, Stempel**. Pilih satu atau beberapa metode pembayaran; jumlah masing-masing metode harus sesuai total nominal. Klik **Simpan**.
3. Gunakan **Ubah/Hapus** sesuai izin bila perlu. **Unduh ulang** Excel bulanan agar RC serta ringkasan memuat data terbaru. File lama tidak berubah otomatis.

### Q49: Bagaimana cara mencatat belanja manual via transfer?

1. Buka **Keuangan** dan klik **Tambah Belanja Transfer** pada bagian Pengeluaran.
2. Isi tanggal transfer, penerima / supplier, keterangan, dan nominal; bukti transfer opsional. Klik **Simpan** untuk mencatat keuangan tanpa menambah stok.
3. Gunakan menu aksi pada badge **Belanja Transfer Manual** untuk koreksi sesuai izin. **Unduh ulang** Excel untuk melihat **PENGELUARAN BELANJA → VIA TRANSFER** dan RP. Pengeluaran dihitung sekali pada total.

### Q50: Bagaimana Owner memeriksa perubahan nota oleh Sales?

1. Klik notifikasi perubahan nota, atau buka **Riwayat**, cari transaksi, lalu pilih menu tiga titik > **Riwayat perubahan nota**.
2. Pilih revisi di **Jejak perubahan**, atau pemilih **Jejak versi** pada ponsel. Lihat nama Sales, waktu penyimpanan, total sebelum dan sesudah, serta selisihnya. **Yang berubah** menampilkan rincian **Sebelum** dan **Sesudah** per bagian atau barang.
3. Buka **Nota asli** untuk memeriksa rincian sebelum perubahan Sales pertama, atau **Versi lengkap** untuk kedua nota pada revisi terpilih. Identitas data tersedia dalam rincian tambahan. Pencatatan dimulai setelah fitur tersedia, untuk nota yang sudah diproses termasuk DP dan Tempo serta pembayaran piutang oleh Sales. Draft dan nota menunggu persetujuan tidak termasuk. Riwayat hanya dapat dibuka Owner pada toko yang sama.

### Q51: Bagaimana cara Void atau Hapus transaksi beserta surat jalan terkait?

**A:** Buka **Riwayat** dan menu tiga titik pada baris komputer atau kartu ponsel. Semua jenis transaksi, termasuk ATK, Percetakan, nota penawaran, dan transaksi dengan surat jalan, mengikuti izin akun serta statusnya.

1. Pilih **Void** untuk membatalkan transaksi aktif, termasuk draft atau pending. Aksi memerlukan `transaction.update` bagi role yang diberi izin; tinjau dampaknya lalu konfirmasi. Transaksi **VOIDED/REFUNDED** tidak dapat di-void ulang. Seluruh surat jalan terkait berstatus **PENDING/CONFIRMED** menjadi **CANCELLED**; yang sudah **CANCELLED/REJECTED** tetap pada statusnya.
2. Pilih **Hapus** untuk menghapus permanen transaksi, seluruh surat jalan terkait, dan item dokumennya. Pada transaksi Percetakan, nota sumbernya juga dihapus; snapshot dokumen tetap tersimpan dalam audit. Aksi memerlukan `transaction.delete` bagi role yang diberi izin. Jurnal stok tetap tersimpan. **Void** mempertahankan nota Percetakan sumber pada transaksi yang dibatalkan.
3. Periksa dampak stok sebelum mengonfirmasi. Stok yang terbukti keluar dikembalikan paling banyak sekali berdasarkan mutasi yang tercatat; **Hapus setelah Void** tidak mengembalikannya lagi. Dampak keuangan invoice tetap diproses saat Hapus; masalah keuangan atau kegagalan sistem tetap perlu diselesaikan.
4. Semua jenis transaksi, termasuk ATK, Percetakan, dan nota penawaran yang sudah atau belum menjadi invoice, tetap dapat dihapus bila riwayat stok kosong atau tidak konsisten. Peringatan tercatat di audit; pemeriksaan izin dan dampak keuangan tetap berlaku. Baca peringatan yang juga muncul **setelah penghapusan berhasil** dan tindak lanjuti bila perlu pemeriksaan. Sistem tidak menebak jumlah stok yang harus dikembalikan.

### Q52: Bagaimana cara melihat pemasukan per tanggal?
1. Buka Laporan Keuangan.
2. Pilih hari ini atau tanggal sebelumnya dalam WIB.
3. Baca total, ATK/Percetakan, subkategori, dan metode pembayaran sesuai izin.

### Q53: Bagaimana cara mengoreksi daftar belanja yang sudah diproses?

1. Di **Supplier > Daftar Belanja**, buka **Tindakan lainnya > Edit daftar**. Izin `supplier.shopping_request.correct_processed:update` tersedia untuk Owner secara bawaan dan dapat diberikan kepada role lain.
2. Ubah data yang diperlukan, isi alasan, dan tinjau dampak terhadap barang diterima, stok, pembayaran, serta tanggal laporan. Bila harga beli berubah, pilih secara terpisah apakah HPP dan harga jual katalog perlu diperbarui.
3. Simpan setelah memeriksa ringkasan. **Kelebihan pembayaran** ditampilkan sebagai peringatan, bukan pengembalian uang otomatis. Badge **Diubah** atau **Stok berubah** membuka riwayat perubahan.

### Q54: Bagaimana cara melanjutkan saat sesi perangkat berakhir?

1. Masuk seperti biasa di perangkat tambahan. Tombol **Keluar** mengakhiri sesi pada perangkat yang digunakan.
2. Saat koneksi sedang dipulihkan, biarkan tab tetap terbuka. Pemeriksaan izin akan diulang dan isian dapat dilanjutkan setelah berhasil.
3. Jika sesi berakhir, pilih **Masuk lagi**. Gunakan akun dan toko yang sama pada tab tersebut untuk melanjutkan item keranjang yang tersimpan.
