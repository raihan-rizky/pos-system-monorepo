"use client";

import React, { useState } from "react";
import {
  ChevronDown,
  Settings,
  ShoppingCart,
  Package,
  DollarSign,
  Users,
  FileText,
  Truck,
  ShieldCheck,
  TrendingUp,
  History,
  Warehouse,
  Search
} from "lucide-react";
import HelpDiagramStepper, { Step } from "./HelpDiagramStepper";
import type { Role } from "@/features/rbac/helpers/rbac-core";

interface AccordionItem {
  id: string;
  title: string;
  description?: string;
  icon: React.ReactNode;
  steps: Step[];
}

const ROLE_CONTENT: Record<string, AccordionItem[]> = {
  OWNER: [
    {
      id: "owner-rbac",
      title: "Mengelola Akses (RBAC)",
      description: "Fitur ini memungkinkan Anda untuk mengontrol akses dan izin setiap pengguna. Anda dapat menentukan menu apa saja yang bisa dilihat dan aksi apa yang bisa dilakukan oleh tiap peran (Role) untuk menjaga keamanan sistem.",
      icon: <ShieldCheck className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Pengaturan", description: "Buka menu samping (sidebar) sebelah kiri layar, gulir ke paling bawah lalu klik menu 'Pengaturan' (ikon gerigi) untuk masuk ke halaman pengaturan utama.", icon: <Settings className="w-8 h-8" /> },
        { title: "Buka Tab RBAC", description: "Pada halaman pengaturan yang terbuka, lihat menu navigasi vertikal di sebelah kiri, kemudian klik tab 'RBAC' (hanya terlihat oleh Owner) untuk menampilkan tabel daftar peran pengguna.", icon: <Users className="w-8 h-8" /> },
        { title: "Pilih Role & Atur Izin", description: "Klik tombol peran di baris atas (Admin, Kasir, Sales, atau Inventaris). Pada tabel 'Akses Halaman' dan 'Aksi Resource' yang muncul di bawah, centang kotak (checkbox) untuk memberikan izin, atau hapus centang untuk mencabut izin akses.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Simpan Perubahan", description: "Setelah selesai mencentang izin yang diinginkan, klik tombol 'Simpan' berwarna biru yang berada di pojok kanan atas halaman.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-reports",
      title: "Laporan Keuangan & Penjualan",
      description: "Gunakan menu ini untuk memantau performa bisnis Anda secara keseluruhan. Laporan ini memberikan ringkasan pendapatan, pengeluaran, laba rugi, dan tren penjualan dari waktu ke waktu.",
      icon: <TrendingUp className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Laporan Keuangan", description: "Dari menu samping (sidebar) sebelah kiri layar, gulir ke bawah pada kategori 'Keuangan', lalu klik menu 'Laporan Keuangan' (ikon grafik batang).", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Pilih Rentang Waktu", description: "Di bagian atas halaman laporan, klik pada kolom pemilih tanggal (kalender), tentukan rentang tanggal mulai dan tanggal akhir yang ingin dipantau, lalu klik tombol 'Terapkan'.", icon: <History className="w-8 h-8" /> },
        { title: "Cetak atau Ekspor", description: "Jika ingin menyimpan file laporan, klik tombol 'Ekspor' di pojok kanan atas layar, lalu klik format yang Anda inginkan (Excel atau PDF) untuk mengunduhnya ke perangkat Anda.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-performance",
      title: "Laporan Performa Karyawan",
      description: "Pantau produktivitas dan kontribusi setiap anggota tim Sales. Fitur ini membantu Anda melacak jumlah transaksi yang ditangani oleh tiap Sales (Top Performer).",
      icon: <Users className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Menu", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Pelanggan', lalu klik menu 'Sales' (ikon tag).", icon: <Users className="w-8 h-8" /> },
        { title: "Lihat Statistik", description: "Perhatikan bagian paling atas dari halaman tersebut untuk melihat kartu ringkasan Top Performer, total omzet penjualan, dan jumlah keseluruhan transaksi.", icon: <TrendingUp className="w-8 h-8" /> },
        { title: "Detail Transaksi", description: "Scroll ke tabel daftar sales di bagian bawah, lalu klik langsung pada baris nama karyawan sales untuk membuka panel detail yang berisi daftar faktur yang diselesaikan oleh sales tersebut.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-approval-stock",
      title: "Approval Stock Logs",
      description: "Menyetujui atau menolak permintaan masuk dan keluar barang yang diajukan oleh tim inventory.",
      icon: <ShieldCheck className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Inventory", description: "Buka menu samping (sidebar) sebelah kiri layar Anda, masuk ke kategori 'Manajemen Inventaris', lalu klik menu 'Inventaris' (ikon paket).", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Pilih Tab Permintaan", description: "Di baris navigasi tab atas, klik tab 'Riwayat' kemudian pilih sub-tab 'Log Stok' untuk melihat riwayat mutasi. Atau jika ada notifikasi badge angka oranye di sidebar, klik badge tersebut untuk langsung menuju log tertunda.", icon: <FileText className="w-8 h-8" /> },
        { title: "Setujui/Tolak", description: "Cari pengajuan yang berstatus 'Pending' (warna kuning) di tabel, lalu klik tombol 'Setuju' (hijau) untuk mengesahkan stok, atau tombol 'Tolak' (merah) untuk membatalkannya.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Masukkan Alasan Penolakan", description: "Jika Anda mengklik 'Tolak', ketikkan alasan penolakan pada kolom pop-up yang muncul (misalnya: 'Foto bukti rusak tidak jelas'), kemudian klik tombol 'Tolak Permintaan'.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-approval-belanja",
      title: "Approval Daftar Belanja",
      description: "Menyetujui daftar belanja (Purchase Requests) yang diajukan sebelum proses pembelian dilakukan ke supplier.",
      icon: <ShoppingCart className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Daftar Belanja", description: "Buka menu samping (sidebar) sebelah kiri, klik menu 'Inventaris' (ikon paket), lalu pilih tab 'Transaksi' -> klik sub-tab 'Penerimaan Barang' / 'Daftar Belanja'.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Periksa Permintaan", description: "Klik pada baris dokumen pengajuan belanja di dalam tabel untuk membuka pop-up rincian nama barang, jumlah kuantitas, estimasi harga satuan, dan supplier tujuan.", icon: <Package className="w-8 h-8" /> },
        { title: "Beri Keputusan", description: "Klik tombol 'Setujui' (Approve) di pojok kanan bawah modal untuk mengesahkan pembelian, atau tombol 'Tolak' (Reject) dengan memasukkan catatan penolakan jika tidak disetujui.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-piutang",
      title: "Melihat Daftar Piutang",
      description: "Memantau sisa tagihan atau piutang pelanggan yang belum lunas agar arus kas tetap sehat.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Daftar Pelanggan", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Pelanggan', lalu klik menu 'Pelanggan' (ikon kontak).", icon: <History className="w-8 h-8" /> },
        { title: "Filter Piutang", description: "Perhatikan kolom 'Piutang' pada tabel pelanggan. Di atas tabel, Anda juga bisa mengklik tombol 'Filter' dan memilih opsi 'Memiliki Piutang' untuk menyaring data.", icon: <Settings className="w-8 h-8" /> },
        { title: "Cek Rincian Tagihan", description: "Klik langsung pada nama pelanggan yang memiliki nominal piutang berwarna merah, lalu klik tab 'Riwayat Transaksi' di profilnya untuk melihat faktur belanja mana saja yang belum lunas.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-performa-sales",
      title: "Melihat Performa Sales",
      description: "Mengevaluasi kontribusi setiap tenaga penjualan (sales) berdasarkan total transaksi dan omzet.",
      icon: <TrendingUp className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Tim Sales", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Pelanggan', lalu klik menu 'Sales' (ikon tag).", icon: <Users className="w-8 h-8" /> },
        { title: "Lihat Diagram & Ranking", description: "Perhatikan dashboard visual di bagian atas halaman yang menampilkan grafik batang pencapaian omzet bulanan dan daftar peringkat sales terbaik.", icon: <TrendingUp className="w-8 h-8" /> },
        { title: "Analisis Detail Transaksi", description: "Gulir ke tabel sales di bawah, lalu klik nama sales yang ingin Anda evaluasi untuk memunculkan pop-up daftar seluruh nota penjualan yang diselesaikannya.", icon: <FileText className="w-8 h-8" /> },
      ]
    }
  ],
  ADMIN: [
    {
      id: "admin-settings",
      title: "Pengaturan Toko",
      description: "Menu ini digunakan untuk mengatur informasi dasar toko seperti nama, alamat, nomor kontak, dan  metode pembayaran yang akan muncul di struk pelanggan.",
      icon: <Settings className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Pengaturan", description: "Buka menu samping (sidebar) sebelah kiri, gulir ke paling bawah lalu klik menu 'Pengaturan' (ikon gerigi).", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih Tab Info Toko", description: "Pada halaman pengaturan, klik tab menu 'Info Toko' di sebelah kiri. Isikan data Nama Toko, Alamat, dan Nomor WhatsApp aktif toko pada kolom form yang disediakan.", icon: <FileText className="w-8 h-8" /> },
        { title: "Simpan Perubahan", description: "Setelah data terisi dengan benar, klik tombol 'Simpan Perubahan' berwarna biru di sudut kanan bawah halaman.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-products",
      title: "Kelola Produk",
      description: "Pusat manajemen data barang Anda. Di sini Anda bisa mendaftarkan produk baru, menetapkan harga jual dasar, dan mengatur varian (seperti warna atau ukuran) sebelum barang bisa dijual di POS.",
      icon: <Package className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Produk", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Katalog', kemudian klik menu 'Produk' (ikon paket).", icon: <Package className="w-8 h-8" /> },
        { title: "Tambah Produk Baru", description: "Klik tombol hitam '+ Tambah Produk' di pojok kanan atas. Pada modal formulir yang muncul, ketikkan Nama Produk, Kategori, Harga Jual, Stok Awal, dan kode SKU/Barcode, lalu klik tombol 'Simpan'.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Ubah Data Produk", description: "Cari produk yang ingin diubah di tabel, lalu klik tombol ikon 'Edit' (pensil) di kolom aksi paling kanan. Lakukan penyesuaian data pada form pop-up, kemudian klik 'Simpan'.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-suppliers",
      title: "Kelola Pemasok (Supplier)",
      description: "Catat dan kelola data seluruh pemasok barang Anda. Dengan data yang terpusat, Anda dapat dengan mudah membuat pesanan pembelian (Purchase Order) dan melacak riwayat pasokan dari masing-masing supplier.",
      icon: <Truck className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Menu Supplier", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Katalog', lalu klik menu 'Supplier' (ikon truk).", icon: <Truck className="w-8 h-8" /> },
        { title: "Buka Form Tambah", description: "Klik tombol hitam '+ Tambah Supplier' di pojok kanan atas halaman untuk memunculkan form input data.", icon: <FileText className="w-8 h-8" /> },
        { title: "Simpan Data Supplier", description: "Ketik Nama Perusahaan Supplier, Nama Contact Person (PIC), No WhatsApp, dan Alamat lengkap, lalu klik tombol 'Simpan' di pojok kanan bawah modal.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-crm",
      title: "Kelola Data Pelanggan (CRM)",
      description: "Simpan data pelanggan setia untuk meningkatkan layanan. Anda dapat melacak poin loyalitas, riwayat belanja, dan hutang (piutang) mereka.",
      icon: <Users className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Pelanggan", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Pelanggan', lalu klik menu 'Pelanggan' (ikon kontak).", icon: <Users className="w-8 h-8" /> },
        { title: "Input Data Pelanggan", description: "Klik tombol hitam '+ Pelanggan Baru' di kanan atas tabel. Isi form pop-up Nama lengkap, No Handphone, dan Alamat, kemudian klik tombol 'Simpan'.", icon: <FileText className="w-8 h-8" /> },
        { title: "Lihat Detail Profil", description: "Pada tabel daftar pelanggan, klik nama pelanggan yang dituju. Ini akan membuka halaman profil pelanggan lengkap dengan tab 'Riwayat Transaksi' dan catatan sisa piutang/tempo belanja mereka.", icon: <History className="w-8 h-8" /> },
      ]
    }
  ],
  CASHIER: [
    {
      id: "cashier-shift",
      title: "Memulai & Mengakhiri Shift",
      description: "Pencatatan shift memastikan perhitungan uang kas di laci akurat. Selalu mulai shift saat Anda masuk kerja dan tutup shift saat selesai agar selisih penjualan dapat terlacak dengan transparan.",
      icon: <History className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Shift Kasir", description: "Saat baru login ke aplikasi, Anda akan diarahkan ke halaman awal shift. Jika tidak, buka sidebar kiri, masuk ke kategori 'Lainnya', dan klik menu 'Shift Kasir' (ikon koper).", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Mulai Shift", description: "Ketikkan nominal modal uang tunai awal yang ada di dalam laci kasir fisik pada kolom kas awal, kemudian klik tombol hitam 'Mulai Shift'.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Akhiri Shift", description: "Saat jam kerja selesai, kembali ke menu 'Shift Kasir' atau klik foto profil Anda di kanan atas dan pilih 'Tutup Shift'. Masukkan total nominal fisik uang tunai di laci, lalu klik tombol merah 'Konfirmasi Akhiri Shift'.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "cashier-pos",
      title: "Memproses Penjualan (POS)",
      description: "Ini adalah layar utama Kasir untuk melayani pelanggan. Anda bisa mencari produk, menambahkan diskon, dan mencetak struk secara cepat dan akurat.",
      icon: <ShoppingCart className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka POS Kasir", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Operasi', lalu klik menu 'Kasir' (POS - ikon kalkulator).", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Pilih & Tambah Produk", description: "Cari produk melalui kolom pencarian di bagian atas atau klik langsung pada gambar produk di grid sebelah kiri. Jika ada varian (seperti warna/ukuran), pilih varian yang sesuai di pop-up, lalu produk akan masuk ke keranjang kanan.", icon: <Package className="w-8 h-8" /> },
        { title: "Proses Pembayaran", description: "Klik tombol hijau besar 'Bayar' di bawah keranjang. Pilih metode pembayaran (misal: Tunai), masukkan nominal uang yang diterima dari pelanggan, klik 'Konfirmasi Pembayaran', lalu klik tombol 'Cetak Struk'.", icon: <DollarSign className="w-8 h-8" /> },
      ]
    },
    {
      id: "cashier-credit",
      title: "Menerima Pembayaran Cicilan / Piutang",
      description: "Terkadang pelanggan setia boleh membayar secara tempo. Anda dapat mencatat pembayaran cicilan atau melunasi sisa tagihan dari menu ini.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Cari Faktur Tempo", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Operasi', klik menu 'Riwayat' (ikon kartu dompet), lalu ketikkan nama pelanggan di kolom pencarian tabel.", icon: <Users className="w-8 h-8" /> },
        { title: "Proses Bayar Cicilan", description: "Klik baris transaksi pelanggan yang berstatus merah 'Belum Lunas'. Pada rincian transaksi di panel kanan, klik tombol 'Bayar Cicilan', ketik nominal uang cicilan yang dibayarkan, lalu klik 'Simpan'.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Cetak Bukti Pembayaran", description: "Setelah pembayaran tercatat berhasil, klik ikon printer ('Cetak Struk') di bagian pojok kanan atas detail transaksi untuk memberikan struk bukti cicilan.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "cashier-return",
      title: "Retur / Pengembalian Barang",
      description: "Jika pembeli mengembalikan barang yang cacat atau salah beli, proses retur ini agar stok kembali ke sistem dan uang bisa dikembalikan atau ditukar.",
      icon: <History className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Cari Struk Transaksi", description: "Buka menu 'Riwayat' dari sidebar kiri, lalu masukkan kode struk belanja pelanggan (misal: TRX-001) di kolom pencarian tabel.", icon: <History className="w-8 h-8" /> },
        { title: "Pilih Retur Barang", description: "Buka detail transaksi tersebut, klik tombol abu-abu 'Retur Barang' di bawah rincian produk. Centang produk yang ingin diretur, isi kuantitas pengembalian, dan ketikkan alasan retur.", icon: <Package className="w-8 h-8" /> },
        { title: "Selesaikan Refund", description: "Pilih opsi pengembalian 'Kembalikan Uang Tunai' (Refund), klik 'Konfirmasi Retur'. Stok barang otomatis akan ditambahkan kembali ke inventaris gudang.", icon: <DollarSign className="w-8 h-8" /> },
      ]
    },
    {
      id: "cashier-expense",
      title: "Pencatatan Pengeluaran Kasir (Kasbon)",
      description: "Jika ada pengeluaran darurat menggunakan uang di laci (misal: bayar parkir atau beli plastik), wajib dicatat agar saldo akhir saat tutup shift bisa sesuai.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Modal Pengeluaran", description: "Pada layar kasir 'POS', lihat baris tombol utilitas di bagian atas layar, lalu klik tombol ikon dompet ('Pengeluaran' atau 'Expense').", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Input Nominal & Catatan", description: "Ketik nominal uang tunai yang dikeluarkan dari laci kasir fisik pada kolom jumlah, dan tulis alasan pengeluarannya (misal: 'Beli plastik packing') di kolom catatan.", icon: <FileText className="w-8 h-8" /> },
        { title: "Simpan Pengeluaran", description: "Klik tombol hitam 'Simpan Pengeluaran'. Uang kas di laci kasir pada sistem akan otomatis terpotong sesuai nominal tersebut.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "cashier-discount",
      title: "Menerapkan Diskon Manual",
      description: "Atas izin manajer, Kasir dapat memberikan diskon manual tambahan untuk pelanggan tertentu (misal: keluarga teman atau barang sedikit cacat).",
      icon: <TrendingUp className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Pilih Item di Keranjang", description: "Pada layar kasir 'POS', setelah memasukkan produk ke keranjang, klik langsung pada nama produk di dalam keranjang belanja sebelah kanan.", icon: <Package className="w-8 h-8" /> },
        { title: "Input Diskon Tambahan", description: "Di modal opsi produk yang terbuka, cari opsi 'Diskon Tambahan'. Pilih tipe diskon ('Rp' atau '%'), ketik angkanya, lalu klik tombol biru 'Terapkan Diskon'.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Selesaikan POS", description: "Periksa apakah nominal total belanjaan di keranjang sudah berkurang, lalu lanjutkan proses pembayaran dengan mengklik tombol hijau 'Bayar'.", icon: <ShoppingCart className="w-8 h-8" /> },
      ]
    },
    {
      id: "kasir-alur-kerja",
      title: "Alur Kerja Kasir",
      description: "Panduan lengkap siklus kerja harian seorang kasir, dari memulai shift hingga menutup laporan harian.",
      icon: <History className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Mulai Shift Kasir", description: "Buka menu 'Shift Kasir' di sidebar kiri -> kategori 'Lainnya'. Ketik jumlah modal kas awal di laci fisik, lalu klik tombol hitam 'Mulai Shift'.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Layani Transaksi POS", description: "Masuk ke menu 'Kasir' (POS) di sidebar kiri -> kategori 'Operasi'. Pilih produk pesanan pelanggan, klik 'Bayar', input uang diterima, lalu cetak struk.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Catat Pengeluaran Laci", description: "Jika ada pengeluaran kas dadakan, klik ikon dompet 'Pengeluaran' di bar atas layar POS, isi nominal dan alasan pengeluaran, lalu klik 'Simpan'.", icon: <FileText className="w-8 h-8" /> },
        { title: "Memeriksa Pending Transaksi", description: "Buka menu 'Riwayat' di sidebar kiri. Pada baris filter status di atas tabel, klik opsi 'Pending' untuk memfilter daftar transaksi yang membutuhkan persetujuan Anda.", icon: <Search className="w-8 h-8" /> },
        { title: "Menyetujui Pending Transaksi", description: "Pada baris transaksi pending yang sesuai, klik ikon titik tiga ('Aksi Lainnya') di ujung kanan, pilih 'Setujui', lalu pada modal yang muncul tentukan metode pembayaran dan jumlah bayar sebelum mengklik tombol hijau 'Setujui'.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Tutup Shift", description: "Di akhir hari, klik profil Anda di pojok kanan atas, klik 'Tutup Shift'. Hitung dan ketik nominal uang fisik di laci saat itu, lalu klik tombol merah 'Konfirmasi Akhiri Shift'.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    }
  ],
  SALES: [
    {
      id: "sales-draft",
      title: "Membuat Draft Transaksi",
      description: "Sales lapangan sering menerima pesanan tanpa pembayaran langsung. Gunakan fitur Draft untuk mencatat pesanan sementara sebelum diproses lebih lanjut oleh admin atau kasir.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka POS", description: "Buka menu samping (sidebar) sebelah kiri, pilih kategori 'Operasi', dan klik menu 'Kasir' (POS).", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Tambah Barang ke Keranjang", description: "Klik pada produk-produk yang dipesan oleh pelanggan di grid produk sebelah kiri agar masuk ke keranjang belanja sebelah kanan.", icon: <Package className="w-8 h-8" /> },
        { title: "Simpan Sebagai Draft", description: "Di bagian bawah keranjang belanja kanan, klik tombol abu-abu 'Simpan Draft' (ikon disket). Masukkan nama pelanggan dan catatan penting, lalu klik 'Simpan'.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "sales-sj",
      title: "Membuat Surat Jalan",
      description: "Saat mengirim barang pesanan ke pelanggan, Surat Jalan berfungsi sebagai bukti pengiriman resmi. Pastikan semua barang telah sesuai sebelum mencetak dokumen ini.",
      icon: <Truck className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Cari Transaksi", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Operasi', klik menu 'Riwayat'. Ketikkan nama pelanggan atau cari kode transaksi di tabel.", icon: <History className="w-8 h-8" /> },
        { title: "Buka Menu Surat Jalan", description: "Klik transaksi yang dituju untuk membuka panel rincian di sebelah kanan. Klik tombol opsi titik tiga di pojok kanan atas panel detail, lalu klik 'Buat Surat Jalan'.", icon: <Truck className="w-8 h-8" /> },
        { title: "Cetak Dokumen Fisik", description: "Pada halaman pratinjau surat jalan yang terbuka, klik tombol biru 'Cetak Surat Jalan' di pojok atas untuk menyambungkan ke printer dan mencetaknya.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "sales-alur-kerja",
      title: "Alur Kerja Sales",
      description: "Siklus kerja tenaga penjual di lapangan, mulai dari mencari pesanan hingga pengiriman barang.",
      icon: <Users className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Koleksi Order (POS Draft)", description: "Di halaman POS, masukkan barang pesanan pelanggan ke keranjang, lalu klik tombol 'Simpan Draft' di bawah keranjang kanan agar terekam di sistem.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Ubah Draft Menjadi Tagihan", description: "Pergi ke menu 'Riwayat' di sidebar kiri. Klik draft transaksi yang ingin diproses, buka detailnya, lalu klik tombol 'Proses ke Tagihan' (tentukan status pembayaran tempo jika piutang).", icon: <FileText className="w-8 h-8" /> },
        { title: "Buat & Cetak Surat Jalan", description: "Pada detail invoice transaksi tersebut di menu 'Riwayat', klik tombol titik tiga di sudut kanan atas panel rincian, klik 'Buat Surat Jalan', kemudian klik 'Cetak Surat Jalan'.", icon: <Truck className="w-8 h-8" /> },
      ]
    }
  ],
  INVENTORY: [
    {
      id: "inventory-stock",
      title: "Manajemen Stok Gudang",
      description: "Pantau dan kelola ketersediaan fisik barang di gudang Anda. Fitur ini membantu Anda mengetahui riwayat barang keluar-masuk.",
      icon: <Package className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Menu Inventaris", description: "Buka menu samping (sidebar) sebelah kiri layar Anda, gulir ke kategori 'Manajemen Inventaris', lalu klik menu 'Inventaris' (ikon paket).", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Cek Riwayat Log Stok", description: "Klik pada baris produk yang ingin dipantau. Pada panel jendela detail produk yang terbuka di sebelah kanan, klik tab 'Histori Stok' di bagian atas untuk melihat log mutasi keluar-masuk barang.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "inventory-alur-kerja",
      title: "Alur Kerja Inventory",
      description: "Siklus keseluruhan penjagaan stok barang, dari menerima kiriman hingga pelaporan barang rusak.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Verifikasi Mutasi Log", description: "Buka menu 'Inventaris' di sidebar. Klik tab 'Riwayat' -> sub-tab 'Log Stok' di pagi hari untuk memastikan mutasi stok harian berjalan sesuai catatan.", icon: <History className="w-8 h-8" /> },
        { title: "Input Penerimaan Barang", description: "Saat kiriman supplier datang, klik tombol hitam '+ Input / Transaksi' di kanan atas halaman, klik 'Penerimaan Barang'. Isikan detail item barang, nomor surat jalan supplier, kuantitas fisik, lalu klik 'Simpan'.", icon: <Package className="w-8 h-8" /> },
        { title: "Catat Barang Pecah/Rusak", description: "Jika ditemukan produk rusak, klik tombol '+ Input / Transaksi' -> 'Laporkan Barang Rusak'. Masukkan kode barang, kuantitas yang rusak, isi alasan penyesuaian, lalu klik 'Simpan'.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "inventory-tugas-harian",
      title: "Menyelesaikan Tugas Harian",
      description: "Rutinitas sehari-hari yang harus dilakukan staf gudang untuk memastikan keakuratan sistem.",
      icon: <TrendingUp className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Cek Tugas Aktif", description: "Buka menu 'Inventaris' di sidebar kiri, lalu klik tab 'Tugas' di bagian atas halaman untuk melihat checklist tugas harian.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Lakukan Matching Stok", description: "Klik tugas 'Pencocokan Stok Harian' (atau tombol '+ Input / Transaksi' -> 'Cocokkan Stok (Harian)'). Cocokkan stok fisik di gudang dengan angka sistem, isi form kecocokan, lalu klik 'Simpan'.", icon: <History className="w-8 h-8" /> },
        { title: "Input Laporan Kerusakan", description: "Klik tugas 'Laporan Barang Rusak' (atau '+ Input / Transaksi' -> 'Laporkan Barang Rusak'), cari produk reject hari ini, ketik kuantitas rusak, dan klik tombol 'Kirim'.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Verifikasi Log OUT", description: "Klik tugas 'Log OUT Belum Diverifikasi' (atau klik tab 'Riwayat' -> 'Log Stok'), periksa daftar barang keluar hari ini, lalu klik tombol 'Verifikasi' pada kolom aksi log yang sesuai.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "inventory-tugas-mingguan",
      title: "Menyelesaikan Tugas Mingguan",
      description: "Pekerjaan berkala setiap akhir pekan untuk merekap dan memvalidasi stok keseluruhan.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Tugas Mingguan", description: "Buka menu 'Inventaris' di sidebar kiri, klik tab 'Tugas' di bagian atas halaman, lalu pilih sub-tab 'Tugas Mingguan'.", icon: <Package className="w-8 h-8" /> },
        { title: "Upload Bukti Kebersihan", description: "Klik tugas 'Proof Kebersihan Gudang' (atau tombol '+ Input / Transaksi' -> 'Proof Kebersihan (Mingguan)'). Klik tombol 'Pilih File/Foto', unggah foto kondisi kebersihan rak gudang terupdate, lalu klik 'Submit'.", icon: <Settings className="w-8 h-8" /> },
        { title: "Stock Opname & Rekonsiliasi", description: "Lakukan perhitungan stok fisik rak gudang. Jika ada selisih, klik '+ Input / Transaksi' -> 'Stock Out Internal' (jika menyusut) atau 'Penerimaan Barang' (jika berlebih) senilai jumlah selisih agar data stok sistem kembali akurat setelah disetujui Owner.", icon: <Users className="w-8 h-8" /> },
      ]
    }
  ]
};

export default function HelpContent({ targetRole }: { targetRole: Role }) {
  const content = ROLE_CONTENT[targetRole] || [];
  const [openId, setOpenId] = useState<string | null>(content[0]?.id || null);

  if (content.length === 0) {
    return (
      <div className="p-8 text-center text-surface-500 bg-surface-50 rounded-2xl border border-surface-200">
        Belum ada panduan khusus untuk peran ini.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {content.map((item) => (
        <div key={item.id} className="bg-white border border-surface-200 rounded-2xl overflow-hidden shadow-sm transition-all duration-200">
          <button
            onClick={() => setOpenId(openId === item.id ? null : item.id)}
            className="w-full flex items-center justify-between p-5 bg-white hover:bg-surface-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center">
                {item.icon}
              </div>
              <h2 className="text-lg font-bold text-surface-900">{item.title}</h2>
            </div>
            <ChevronDown
              className={`w-5 h-5 text-surface-400 transition-transform duration-300 ${openId === item.id ? 'rotate-180' : ''}`}
            />
          </button>

          <div
            className={`transition-all duration-300 ease-in-out overflow-hidden ${openId === item.id ? "max-h-[800px] opacity-100 border-t border-surface-100" : "max-h-0 opacity-0"
              }`}
          >
            <div className="p-6">
              {item.description && (
                <p className="text-surface-600 mb-6 leading-relaxed">
                  {item.description}
                </p>
              )}
              <HelpDiagramStepper steps={item.steps} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
