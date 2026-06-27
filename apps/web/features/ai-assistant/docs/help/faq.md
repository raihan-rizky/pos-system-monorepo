# Frequently Asked Questions (FAQ) & Panduan Operasional (Cara-Cara)

Halaman ini berisi kumpulan tanya-jawab (FAQ) dan panduan langkah-demi-langkah (cara-cara) operasional untuk seluruh fitur di aplikasi POS dan Manajemen Toko.

---

## 📌 Topik: Produk & Harga

### Q1: Bagaimana cara menambahkan produk baru ke katalog toko?
**A:** Ikuti langkah berikut (memerlukan izin `product.create`):
1. Buka sidebar **Katalog > Produk** (`/products`).
2. Klik tombol hitam **Tambah Produk** di kanan atas.
3. Isi formulir pendaftaran produk:
   - **Informasi Utama:** Nama produk, SKU (harus unik), dan Kategori.
   - **Harga:** Harga Jual dasar, Harga Dinas (opsional), dan Harga Modal/HPP (opsional).
   - **Stok & Satuan:** Satuan/Unit (misal: pcs, box), Isi per Unit Terkecil, Stok Saat Ini, dan Batas Minimum Stok.
4. **Varian Unit Terkecil (Opsional):** Jika satu barang juga dijual dalam unit pecahan (misal: jual per box dan per pcs), gunakan opsi **Tambah Varian Unit Terkecil**. Masukkan nama unit, SKU baru yang unik, harga jual, dan barcode. Sistem otomatis membagi stok dasar berdasarkan faktor konversi unit.
5. Klik **Simpan**.

### Q2: Bagaimana cara mengubah harga jual produk agar tercatat di riwayat?
**A:** Sistem menyediakan pencatatan riwayat setiap kali harga produk berubah untuk menjaga transparansi:
1. **Ubah Harga Langsung:** Pada tabel produk (tab **Produk**), klik tombol aksi **Ubah Harga** di kolom paling kanan. Masukkan nominal harga jual baru pada modal yang tampil, lalu klik simpan. Perubahan harga akan tercatat di tab **Riwayat Harga**.
2. **Edit Detail Produk:** Klik tombol **Edit** (ikon pensil) pada baris produk untuk mengubah detail produk secara penuh, termasuk mengganti harga jual dasar dan nilai Harga Modal/HPP.

### Q3: Bagaimana cara mengatur harga khusus/diskon bagi grup pelanggan (Agen, Industri, Dinas)?
**A:** Anda dapat membuat kebijakan harga diskon khusus yang berlaku untuk satu kategori produk bagi kelompok pelanggan tertentu:
1. Buka halaman **Produk > Harga Khusus** (hanya dapat diakses oleh **OWNER**).
2. Pada form di sisi kanan layar, tentukan pengaturan aturan:
   - **Tipe Pelanggan:** Pilih kelompok pelanggan (**UMUM**, **AGEN**, **INDUSTRI**, atau **PEMERINTAH** [Dinas]).
   - **Kategori:** Pilih kategori produk yang ingin diberikan harga khusus.
   - **Mode Diskon:**
     - **Diskon (%):** Potongan dalam bentuk persentase dari harga dasar (misal: diskon 10%).
     - **Diskon Rp:** Potongan nominal tetap dalam rupiah (misal: potongan Rp 5.000).
   - **Nilai:** Isi persentase atau nominal Rupiah diskon.
3. Klik **Simpan**. Sistem akan otomatis menerapkan diskon ini ketika kasir memilih pelanggan dengan tipe grup tersebut saat transaksi di POS.

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
**A:** Grup stok digunakan untuk menggabungkan beberapa varian produk agar berbagi satu stok fisik yang sama:
1. Buka tab **Aktivitas Grup** di halaman Pusat Produk.
2. Klik tombol **Atur Grup Stok** (atau buka **Bulk Stock Group** dari menu import) untuk membuat grup stok baru.
3. Tentukan produk utama, dan tambahkan produk-produk anggota kelompok yang akan berbagi perhitungan stok secara otomatis.
4. Sistem akan mencatat riwayat pemakaian dan mutasi grup stok tersebut di tab aktivitas.

---

## 📌 Topik: Transaksi & POS Kasir

### Q6: Bagaimana alur memproses transaksi penjualan langsung di kasir (POS)?
**A:** Pastikan shift kasir Anda telah aktif terlebih dahulu, lalu ikuti alur berikut:
1. Buka sidebar **Operasi > Kasir** (`/pos`).
2. Pilih tab **Produk** atau **Layanan**. Cari item melalui kolom pencarian di bagian atas atau klik langsung pada gambar produk di grid sebelah kiri.
3. Jika ada varian (seperti warna/ukuran), pilih varian yang sesuai di pop-up, lalu masukkan item ke **Keranjang**.
4. Atur kuantitas atau hapus item di keranjang bila perlu, lalu klik tombol hijau besar **Bayar**.
5. Di modal Pembayaran, pilih Pelanggan Umum atau pelanggan terdaftar. Sales dapat dipilih secara opsional.
6. Pilih metode pembayaran: **Tunai**, **QRIS**, **Debit**, atau **Transfer** (maksimal 2 metode gabungan).
7. Pilih status pembayaran **Lunas** atau **Uang Muka (DP)**, lalu tentukan tipe transaksi **Beli Langsung** atau **Job Order**.
8. Isi jumlah uang yang dibayarkan, masukkan nominal diskon bila ada, klik **Konfirmasi Bayar** / **Bayar DP**, lalu cetak struk belanja pelanggan.

### Q7: Bagaimana cara menyetujui transaksi Pending (Approval Process) yang dikirim oleh sales lapangan?
**A:** Transaksi dengan status **Pending** memerlukan persetujuan dari kasir atau pemilik toko agar stok barang terpotong dan pembayaran terverifikasi:
1. Di halaman **Riwayat Transaksi**, gunakan filter status **Pending** untuk melihat semua transaksi yang menunggu persetujuan (baris transaksi akan berwarna biru).
2. Klik tombol **Setujui** atau **Tolak** di sebelah kanan baris transaksi (atau pilih dari menu tiga titik `...` -> **Setujui** / **Tolak**).
3. Di modal persetujuan:
   - **Bayar Instan:** Pilih metode pembayaran dan masukkan jumlah uang yang dibayar pelanggan.
   - **Bayar Nanti (Tempo):** Centang opsi **Bayar Nanti (Tempo)** jika transaksi berupa piutang/pembayaran bertahap (status transaksi akan otomatis menjadi **DP**).
4. Klik **Setujui** untuk memfinalisasi transaksi. Sistem akan segera mengurangi stok produk yang bersangkutan. Jika memilih **Tolak**, transaksi pending tersebut akan otomatis dibatalkan (VOID).

### Q8: Bagaimana cara membuat Surat Jalan Pengiriman (Delivery Order) barang ke pelanggan?
**A:** Surat Jalan digunakan untuk mengirimkan barang pesanan kepada pelanggan secara bertahap atau sekaligus, langsung dari transaksi penjualan yang ada:
1. Cari transaksi penjualan bersangkutan di halaman **Riwayat Transaksi** (harus berstatus **Lunas** atau **DP** serta memiliki produk fisik).
2. Klik ikon tiga titik `...` di ujung kanan baris transaksi, lalu pilih opsi **Cetak Surat Jalan**.
3. Pada modal yang muncul, klik tombol **Buat Surat Jalan** (atau **Buat Surat Jalan Baru** jika sebelumnya sudah pernah dibuatkan pengiriman sebagian).
4. Isi detail pengiriman:
   - **Jumlah Barang:** Masukkan jumlah barang yang dikirim saat ini untuk masing-masing produk (bisa dikirim sebagian jika stok belum lengkap).
   - **Form Pengiriman:** Isi nama kurir/ekspedisi, nama pengemudi, pelat kendaraan, nama penerima, dan catatan tambahan jika ada.
5. Klik proses untuk membuat Surat Jalan. Dokumen Surat Jalan baru akan tersimpan dan siap dicetak sebagai bukti pengiriman barang.

### Q9: Bagaimana cara mencetak invoice atau struk transaksi?
**A:** Anda dapat mencetak invoice dengan dua cara:
- **Melalui POS Kasir:** Setelah menyelesaikan pembayaran transaksi, klik tombol **Cetak Struk** pada halaman konfirmasi keberhasilan.
- **Melalui Riwayat Transaksi:** 
  1. Buka sidebar **Operasi > Riwayat**.
  2. Cari dan klik baris transaksi yang ingin dicetak invoice-nya.
  3. Pada panel detail transaksi di sebelah kanan, klik ikon printer atau tombol **Cetak Invoice/Struk** di sudut kanan atas panel.

### Q10: Bagaimana cara mengunggah foto nota pengeluaran atau struk bukti transaksi pelanggan?
**A:** Karena penyimpanan file POS menggunakan URL gambar, Anda perlu mengunggah gambar bukti transaksi ke layanan pihak ketiga terlebih dahulu:
1. Buka situs pengunggah gambar gratis seperti [prnt.sc](https://prnt.sc/) di browser Anda.
2. Klik **Browse Images** atau seret (*drag-and-drop*) file gambar bukti/nota Anda ke sana.
3. Setelah proses upload selesai, salin (*copy*) alamat tautan (link) gambar yang dihasilkan (misal: `https://prnt.sc/xxxxxx`).
4. Kembali ke modal aplikasi POS, tempel (*paste*) link tersebut di kolom **URL Lampiran** pada formulir pengeluaran atau modal upload bukti transaksi.
5. Klik **Simpan** untuk mengaitkan bukti tersebut dengan transaksi.

### Q11: Bagaimana cara memulai (buka) dan mengakhiri (tutup) shift kerja kasir?
**A:** Ikuti langkah berikut untuk mengelola laci uang kasir:
- **Membuka Shift Kasir:**
  1. Buka sidebar **Lainnya > Shift Kasir** (`/shift`) saat baru masuk kerja.
  2. Ketikkan nominal modal uang tunai awal yang ada di dalam laci kasir fisik pada kolom kas awal.
  3. Klik tombol hitam **Mulai Shift**.
- **Mengakhiri Shift Kasir:**
  1. Kembali ke menu **Shift Kasir** atau klik foto profil Anda di kanan atas dan pilih **Tutup Shift**.
  2. Hitung total nominal fisik uang tunai di laci kasir secara manual, lalu ketikkan nilainya pada kolom Uang Tutup Laci Fisik.
  3. Masukkan catatan bila diperlukan, lalu klik tombol merah **Konfirmasi Akhiri Shift**. Sistem akan langsung membandingkan dengan catatan kas masuk sistem dan menampilkan selisih kas (jika ada).

### Q12: Bagaimana cara mengoreksi atau mengubah data laporan shift kasir yang sudah ditutup?
**A:** Jika terjadi kesalahan input saldo saat penutupan shift:
1. Pada tabel Riwayat Shift (tab **Riwayat** di halaman Shift Kasir), cari baris shift yang ingin diubah.
2. Klik ikon pensil (edit) di kolom aksi sebelah kanan.
3. Lakukan penyesuaian nilai saldo akhir atau catatan, lalu klik simpan (memerlukan izin `shift.update` / level Owner/Admin).

---

## 📌 Topik: Pelanggan & Piutang

### Q13: Bagaimana cara mendaftarkan pelanggan baru ke sistem?
**A:** Ikuti langkah berikut (memerlukan izin `customer.create`):
1. Buka sidebar **Pelanggan > Pelanggan** (`/customers`).
2. Klik tombol hitam **Tambah Pelanggan** di kanan atas (atau **Import Excel** jika ingin menambah massal).
3. Isi data pelanggan pada formulir: Nama Pelanggan (wajib), Tipe Pelanggan (default UMUM, AGEN, INDUSTRI, atau PEMERINTAH), Nomor HP/WhatsApp, Email, Perusahaan, Alamat, dan Catatan.
4. Klik **Simpan**.

### Q14: Bagaimana cara mencatat pembayaran cicilan atau pelunasan piutang pelanggan?
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

---

## 📌 Topik: Inventaris & Supplier

### Q15: Bagaimana cara melaporkan barang yang rusak, hilang, atau menyusut di gudang?
**A:** Buka menu Inventaris untuk mencatat kerugian barang:
1. Masuk ke halaman **Inventaris** (`/inventory`) dan klik tombol menu **Input / Transaksi**.
2. Pilih opsi **Laporkan Barang Rusak**.
3. Pilih produk yang mengalami kerusakan, masukkan jumlah stok yang rusak, dan tambahkan catatan/alasan kerusakan secara jelas.
4. Klik **Submit** untuk menyimpan laporan. Laporan barang rusak akan diproses atau diajukan untuk disetujui agar mengurangi kuantitas stok di sistem.

### Q16: Bagaimana cara menyelesaikan tugas operasional mingguan (seperti Proof Kebersihan)?
**A:** Ikuti langkah berikut untuk merekam kepatuhan tugas mingguan:
1. Di halaman Inventaris, buka tab **Tugas**.
2. Pada bagian **Tugas Mingguan**, Anda akan melihat daftar tugas operasional seperti **Proof Kebersihan Gudang**.
3. Klik pada tugas tersebut atau tombol aksi yang tersedia.
4. Unggah bukti foto (proof) kebersihan rak gudang Anda, kemudian klik **Submit** agar tugas tersebut tercatat sebagai selesai.

### Q17: Bagaimana cara mengajukan Penerimaan Barang (Inbound Receipt) dari supplier?
**A:** Buka menu Inventaris untuk mencatat barang masuk:
1. Buka menu **Input / Transaksi** di halaman Inventaris, kemudian pilih **Penerimaan Barang**.
2. Isi detail dokumen seperti sumber barang (Supplier) dan nomor dokumen atau surat jalan terkait.
3. Tambahkan produk-produk yang masuk beserta kuantitasnya ke dalam daftar penerimaan.
4. Setelah draf lengkap, klik **Submit** (Ajukan). 
5. Pengajuan ini tidak akan langsung menambah stok. Statusnya akan menjadi *Pending* hingga disetujui (Approve) oleh pihak berwenang (seperti OWNER atau admin dengan izin `inventory.approve`). Stok baru bertambah setelah disetujui.

### Q18: Bagaimana cara membuat Daftar Belanja (Shopping Request) kebutuhan toko ke supplier?
**A:** Fitur Daftar Belanja digunakan untuk mencatat kebutuhan barang/produk yang perlu dibeli dari supplier:
1. Buka menu **Supplier** di sidebar, kemudian pilih tab **Daftar Belanja**.
2. Klik tombol **Buat Daftar Belanja** di sebelah kanan atas tabel.
3. Pilih nama supplier dari menu dropdown jika Anda sudah menentukan tempat pembelian (opsional).
4. Gunakan kolom pencarian produk untuk menambahkan barang-barang yang stoknya ingin ditambah.
5. Masukkan nominal kuantitas barang yang ingin diajukan (*requested quantity*) sesuai unitnya.
6. Tulis keterangan pendukung pada kolom **Catatan Internal** bila perlu, lalu klik **Simpan Draft Belanja**.

---

## 📌 Topik: Keuangan & Pengaturan

### Q19: Bagaimana cara mencatat pengeluaran operasional toko?
**A:** Buka menu keuangan untuk mencatat pengeluaran harian:
1. Buka sidebar **Keuangan > Keuangan** (`/keuangan`).
2. Klik tombol **Tambah Pengeluaran** untuk memasukkan pengeluaran baru.
3. Isi nominal pengeluaran, pilih kategori, dan tambahkan catatan pendukung (opsional).
4. **Unggah Bukti Pengeluaran (Attachment):** Upload foto nota belanja ke situs gratis seperti [prnt.sc](https://prnt.sc/), lalu salin tautan link gambar yang dihasilkan (misal: `https://prnt.sc/xxxxxx`). Tempel (*paste*) link tersebut di kolom **URL Lampiran** pada form pengeluaran, periksa pratinjau gambarnya, lalu klik **Simpan**.

### Q20: Bagaimana cara mengekspor data Laporan Keuangan ke format Excel atau PDF?
**A:** Anda dapat mengunduh salinan data laporan keuangan ke perangkat Anda:
1. Di bagian kanan atas halaman Laporan Keuangan, klik tombol **Ekspor**.
2. Pilih format dokumen:
   - **Excel (.xlsx):** Format tabel data angka mentah, cocok jika Anda ingin mengolah kembali data laporan.
   - **PDF:** Format dokumen siap cetak yang rapi dan terstruktur.
3. Setelah memilih format, tentukan rentang waktu laporan yang ingin diekspor: **Harian** (hari ini), **Mingguan** (7 hari terakhir), atau **Bulanan** (bulan berjalan).
4. Berkas laporan akan otomatis terunduh ke perangkat Anda.
   *(Pilihan rentang tanggal filter yang sedang aktif di layar visual tidak memengaruhi isi berkas yang diekspor. Berkas yang diunduh akan selalu murni mengikuti cakupan periode yang Anda pilih di dalam menu dropdown Ekspor).*

### Q21: Bagaimana cara mengubah informasi profil toko yang muncul di struk belanja?
**A:** Untuk memperbarui logo, nama, atau alamat di struk penjualan:
1. Buka sidebar **Lainnya > Pengaturan** (`/settings`), lalu pilih tab **Info Toko**.
2. Lakukan perubahan pada logo toko, nama toko, alamat, dan nomor telepon yang ingin ditampilkan pada struk/invoice.
3. Klik **Simpan** (memerlukan permission `settings.update`).

### Q22: Bagaimana pemilik toko mengatur hak akses atau izin bagi admin, kasir, dan staf gudang?
**A:** Pengaturan hak akses (RBAC) hanya dapat diakses oleh **OWNER**:
1. Buka sidebar **Lainnya > Pengaturan** (`/settings`), lalu pilih tab **RBAC**.
2. Tentukan izin untuk masing-masing peran (ADMIN, CASHIER, SALES, INVENTORY) dalam dua lapisan:
   - **Akses Halaman:** Menentukan apakah role boleh membuka halaman tertentu (seperti `/products`, `/customers`, atau `/inventory`).
   - **Aksi Resource:** Menentukan izin `create`, `read`, `update`, dan `delete` untuk resource tertentu (seperti transaksi, produk, pengeluaran, dll).
3. Setelah mengubah checkbox, klik **Simpan**. Perubahan akan langsung diterapkan di sistem.

---

## 📌 Topik: Produksi & Tim Sales

### Q23: Bagaimana cara memperbarui status pengerjaan pesanan cetak (Job Order)?
**A:** Operator produksi dapat memantau status pesanan di menu **Produksi** menggunakan Kanban Board:
- Pindahkan kartu pesanan dengan menyeret kartu pesanan (*drag-and-drop*) ke tahapan: **Baru** -> **Sedang Diproses (PRINTING)** -> **Siap Diambil (READY_PICKUP)** -> **Selesai (DELIVERED)**.

### Q24: Bagaimana cara mengirim notifikasi pengambilan barang kepada pelanggan?
**A:** Sistem dapat mengirimkan pesan WhatsApp ke pelanggan ketika pesanan telah masuk ke status "Siap Diambil":
- Pada papan Kanban, jika kartu pesanan berada di kolom **Siap Diambil**, klik tombol WhatsApp pada kartu tersebut untuk mengirim pesan pemberitahuan pengambilan barang otomatis ke nomor pelanggan yang terdaftar.

### Q25: Bagaimana cara mengelola daftar anggota Sales?
**A:** Buka menu **Tim Sales** di sidebar untuk mengelola anggota:
- **Tambah Sales:** Klik **Tambah Sales**, ketikkan nama anggota sales baru, lalu klik simpan.
- **Ubah Sales / Toggle Aktif:** Klik tombol edit untuk mengubah nama, atau gunakan tombol toggle cepat di daftar sales untuk merubah statusnya (Aktif/Nonaktif). Hanya sales dengan status "Aktif" yang muncul di halaman kasir (POS).

### Q26: Bagaimana cara melihat riwayat transaksi yang ditangani oleh Sales tertentu?
**A:** Untuk melacak kontribusi penjualan sales:
1. Buka menu **Tim Sales** di sidebar.
2. Klik pada baris/kartu nama sales bersangkutan.
3. Sistem akan memunculkan rincian profil sales beserta daftar maksimal 20 transaksi terbaru yang ditangani oleh sales tersebut.
