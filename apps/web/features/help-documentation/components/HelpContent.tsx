"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  Search,
  Bot,
  Sparkles
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

const ROLE_DESCRIPTIONS: Record<string, { desc: string; resps: string[] }> = {
  OWNER: {
    desc: "Pemilik atau pengelola utama sistem dengan akses penuh ke seluruh fitur dan pengaturan toko.",
    resps: ["Mengelola pengaturan sistem dan hak akses (RBAC)", "Melihat laporan keuangan dan performa bisnis secara keseluruhan", "Menyetujui permintaan inventaris, daftar belanja, dan transaksi"]
  },
  ADMIN: {
    desc: "Administrator toko yang bertugas mengelola katalog produk, data pelanggan, dan operasional harian.",
    resps: ["Mengelola data produk, supplier, dan pelanggan", "Membuat daftar belanja untuk stok", "Mengelola pengeluaran operasional"]
  },
  CASHIER: {
    desc: "Staf kasir yang bertugas melayani transaksi pembayaran langsung dengan pelanggan di area toko.",
    resps: ["Memulai dan mengakhiri shift kasir harian", "Memproses transaksi penjualan (POS)", "Menerima pembayaran cicilan dan memproses retur barang"]
  },
  SALES: {
    desc: "Tenaga penjual di lapangan yang melayani pelanggan, mengambil pesanan, dan mengurus pengiriman barang.",
    resps: ["Melayani pelanggan dan memilih pesanan produk", "Menyerahkan tagihan dan uang ke kasir", "Membuat dan mencetak Surat Jalan (Delivery Order)"]
  },
  INVENTORY: {
    desc: "Staf gudang yang bertanggung jawab atas ketersediaan stok fisik barang dan proses produksi.",
    resps: ["Mencatat penerimaan barang dan barang rusak", "Melakukan pengecekan stok fisik harian dan mingguan", "Memantau papan produksi (Kanban) dan jadwal pengiriman"]
  },
  AI_ASSISTANT: {
    desc: "Kenalan yuk dengan Pak Teladan, asisten AI pintar yang siap membantu memudahkan operasional toko Anda! Dari memantau stok hingga cek omzet harian, Anda bisa tanya langsung ke Pak Teladan lewat tombol robot biru di pojok kanan bawah layar.",
    resps: [
      "Menjawab panduan cara pakai menu dan fitur sistem secara langsung",
      "Mengecek sisa stok barang, info harga produk, dan daftar produk terlaris",
      "Mencari kontak supplier (pemasok) dan profil data pelanggan",
      "Menyajikan ringkasan keuangan harian toko, tagihan piutang, dan rekap belanja pelanggan"
    ]
  }
};

const ROLE_CONTENT: Record<string, AccordionItem[]> = {
  OWNER: [
    {
      id: "owner-rbac",
      title: "Mengelola Akses (RBAC)",
      description: "Menu ini dipakai untuk mengatur siapa saja yang boleh membuka halaman tertentu atau melakukan aksi di aplikasi. Kamu bisa atur akses per role biar sistem tetap aman dan rapi.",
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
      description: "Di sini kamu bisa pantau performa tokomu secara keseluruhan. Kamu bisa lihat rangkuman pemasukan, pengeluaran, laba rugi, sampai grafik penjualan harian.",
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
      description: "Yuk, cek seberapa aktif tim sales kamu di lapangan! Kamu bisa pantau jumlah transaksi yang mereka buat, total omzetnya, dan siapa sales yang paling rajin.",
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
      description: "Di sini tempatnya untuk setujui atau tolak setiap pengajuan stok masuk dan keluar dari anak buahmu di bagian gudang.",
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
      description: "Sebelum kas keluar untuk belanja stok ke supplier, kamu wajib periksa dan beri persetujuan (approve) dulu daftarnya di sini.",
      icon: <ShoppingCart className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Daftar Belanja", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Katalog', klik menu 'Supplier' (ikon truk), lalu pilih tab 'Daftar Belanja'.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Periksa Permintaan", description: "Klik pada baris dokumen pengajuan belanja di dalam tabel untuk membuka pop-up rincian nama barang, jumlah kuantitas, estimasi harga satuan, dan supplier tujuan.", icon: <Package className="w-8 h-8" /> },
        { title: "Beri Keputusan", description: "Klik tombol 'Setujui' (Approve) di pojok kanan bawah modal untuk mengesahkan pembelian, atau tombol 'Tolak' (Reject) dengan memasukkan catatan penolakan jika tidak disetujui.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-piutang",
      title: "Melihat Daftar Piutang",
      description: "Yuk pantau siapa saja pelanggan yang punya tagihan belum lunas (tempo) biar perputaran uang tokomu tetap sehat.",
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
      description: "Di sini kamu bisa lihat ranking sales terbaik berdasarkan total omzet dan nota penjualan yang berhasil mereka selesaikan.",
      icon: <TrendingUp className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Tim Sales", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Pelanggan', lalu klik menu 'Sales' (ikon tag).", icon: <Users className="w-8 h-8" /> },
        { title: "Lihat Diagram & Ranking", description: "Perhatikan dashboard visual di bagian atas halaman yang menampilkan grafik batang pencapaian omzet bulanan dan daftar peringkat sales terbaik.", icon: <TrendingUp className="w-8 h-8" /> },
        { title: "Analisis Detail Transaksi", description: "Gulir ke tabel sales di bawah, lalu klik nama sales yang ingin Anda evaluasi untuk memunculkan pop-up daftar seluruh nota penjualan yang diselesaikannya.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-approval-transaksi",
      title: "Approval Transaksi Pending",
      description: "Periksa dan sahkan pesanan yang dibuat tim sales di lapangan biar barangnya bisa dikirim dan stoknya berkurang otomatis.",
      icon: <ShieldCheck className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Filter Transaksi Pending", description: "Buka menu 'Riwayat' di sidebar kiri. Gunakan filter status 'Pending' pada bagian atas tabel (baris transaksi pending akan berwarna biru).", icon: <Search className="w-8 h-8" /> },
        { title: "Klik Aksi Approval", description: "Klik tombol 'Setujui' atau 'Tolak' langsung di sebelah kanan baris transaksi (atau melalui tombol titik tiga '...').", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Tentukan Metode & Jumlah", description: "Pada modal approval, pilih metode pembayaran (Cash, Transfer, Debit, Kredit, atau QRIS) dan masukkan nominal bayar. Jika tempo, pilih opsi 'Bayar Nanti (Tempo)'.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Konfirmasi", description: "Klik tombol hijau 'Setujui' untuk memfinalisasi transaksi dan mengurangi stok produk secara resmi. Jika menolak, klik 'Tolak' untuk membatalkan (VOID).", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-export-reports",
      title: "Ekspor Laporan Keuangan (Excel & PDF)",
      description: "Kamu bisa download laporan keuangan dan kas toko dalam bentuk file Excel (buat diolah lagi) atau PDF (siap dicetak).",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Laporan Keuangan", description: "Dari sidebar kiri, masuk ke menu 'Laporan Keuangan' (di bawah kategori Keuangan).", icon: <TrendingUp className="w-8 h-8" /> },
        { title: "Buka Menu Ekspor", description: "Di pojok kanan atas halaman, klik tombol 'Ekspor'.", icon: <FileText className="w-8 h-8" /> },
        { title: "Pilih Format", description: "Pilih 'Excel (.xlsx)' jika ingin mengolah kembali angka, atau pilih 'PDF' untuk cetak/bagikan dokumen rapi.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih Periode Ekspor", description: "Tentukan cakupan waktu ekspor: Harian (hari ini), Mingguan (7 hari terakhir), atau Bulanan (bulan berjalan). Berkas akan otomatis terunduh.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-expenses",
      title: "Mengelola Pengeluaran & Bukti Transaksi",
      description: "Catat semua biaya operasional tokomu di sini dan jangan lupa lampirkan foto struk belanjanya biar pembukuan rapi.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Menu Keuangan", description: "Dari sidebar kiri, buka menu 'Keuangan' (di bawah kategori Keuangan).", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Tambah Pengeluaran", description: "Klik tombol 'Tambah Pengeluaran' di bagian atas. Isi nama pemohon, pilih kategori, jumlah nominal, dan deskripsi tambahan.", icon: <Settings className="w-8 h-8" /> },
        { title: "Unggah Bukti (prnt.sc)", description: "Unggah foto nota belanja ke situs gratis prnt.sc. Setelah selesai, salin link URL gambar yang dihasilkan (misal: https://prnt.sc/...).", icon: <FileText className="w-8 h-8" /> },
        { title: "Tempel Link & Simpan", description: "Tempel link tersebut pada kolom 'URL Lampiran' di form pengeluaran, periksa pratinjau gambarnya, lalu klik 'Simpan'.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-shopping-request",
      title: "Membuat Daftar Belanja (Shopping Request)",
      description: "Buat list barang-barang apa saja yang perlu dibeli ke supplier untuk nambah stok toko.",
      icon: <ShoppingCart className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Tab Daftar Belanja", description: "Masuk ke menu 'Supplier' di sidebar, lalu klik tab 'Daftar Belanja' di bagian atas.", icon: <Truck className="w-8 h-8" /> },
        { title: "Buat Pengajuan", description: "Klik tombol 'Buat Daftar Belanja'. Pilih supplier tujuan pada menu dropdown jika sudah ditentukan.", icon: <Settings className="w-8 h-8" /> },
        { title: "Tambah Produk", description: "Gunakan kolom 'Cari & Tambah Produk' untuk mencari dan memasukkan barang kebutuhan belanja.", icon: <Package className="w-8 h-8" /> },
        { title: "Atur Jumlah & Simpan", description: "Isi nominal jumlah kebutuhan (requested quantity) per produk, ketik catatan internal bila perlu, lalu klik 'Simpan Draft Belanja'.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-change-price",
      title: "Mengubah Harga Produk & HPP",
      description: "Ubah harga jual produk dan harga modal (HPP) dengan gampang lewat form edit di menu ini.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Tab Produk", description: "Masuk ke menu 'Produk' di sidebar, pastikan Anda berada di tab 'Produk'.", icon: <Package className="w-8 h-8" /> },
        { title: "Ubah Harga Langsung", description: "Klik tombol aksi 'Ubah Harga' di kolom paling kanan tabel produk untuk mengubah harga jual secara langsung.", icon: <Settings className="w-8 h-8" /> },
        { title: "Ubah HPP & Detail", description: "Klik tombol edit (ikon pensil) untuk membuka formulir lengkap. Di sini Anda bisa mengedit Harga Jual dasar, Harga Dinas, atau Harga Modal/HPP.", icon: <FileText className="w-8 h-8" /> },
        { title: "Pantau Riwayat", description: "Buka tab 'Riwayat Harga' di bagian atas halaman untuk memantau grafik dan log perubahan harga barang dari waktu ke waktu.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-special-pricing",
      title: "Mengatur Harga Grup Pelanggan (Harga Khusus)",
      description: "Atur diskon otomatis untuk grup pelanggan tertentu (misal grup Agen dapat potongan khusus untuk kategori produk tertentu).",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Tab Harga Khusus", description: "Buka menu 'Produk' di sidebar, lalu klik tab 'Harga Khusus' di bagian atas (hanya diakses oleh Owner).", icon: <Settings className="w-8 h-8" /> },
        { title: "Isi Aturan Harga", description: "Di kolom aturan sebelah kanan, pilih Tipe Pelanggan (AGEN, INDUSTRI, PEMERINTAH [Dinas]), kategori produk, dan mode diskon (persen atau rupiah).", icon: <FileText className="w-8 h-8" /> },
        { title: "Masukkan Nilai Diskon", description: "Masukkan nominal atau persentase diskon yang ingin diberikan untuk grup tersebut, lalu klik 'Simpan'.", icon: <Settings className="w-8 h-8" /> },
        { title: "Hasil Transaksi POS", description: "Diskon akan otomatis memotong harga produk di kasir (POS) saat transaksi dibuat untuk pelanggan dengan grup tipe tersebut.", icon: <ShoppingCart className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-import-products",
      title: "Import Massal Produk & Stok (Excel)",
      description: "Nggak perlu input manual satu-satu, kamu bisa langsung masukin banyak produk atau stok sekaligus pakai file Excel.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Pilih Menu Import", description: "Di halaman Produk, klik tombol 'Import' (dropdown) di pojok kanan atas layar.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih Jenis Import", description: "Pilih 'Import Bulk Products' untuk mengunggah katalog produk baru/lama, atau 'Import Bulk Stock' khusus untuk menyesuaikan stok gudang.", icon: <FileText className="w-8 h-8" /> },
        { title: "Unggah File Excel", description: "Pilih file Excel (.xlsx) dari komputer Anda untuk diunggah ke sistem.", icon: <FileText className="w-8 h-8" /> },
        { title: "Mapping Kolom & Proses", description: "Petakan nama kolom Excel agar sesuai dengan kolom sistem, periksa ringkasan data, lalu klik simpan untuk memulai import massal.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-stock-group",
      title: "Mengatur Grup Stok (Stock Group)",
      description: "Gabungkan produk dengan kemasan/varian berbeda (misal Semen sak dan Semen eceran) biar mereka pakai satu stok fisik yang sama di gudang.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Aktivitas Grup", description: "Masuk ke menu 'Produk' di sidebar, lalu pilih tab 'Aktivitas Grup' di navigasi atas.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Buat Grup Stok Baru", description: "Klik tombol 'Atur Grup Stok' (atau Bulk Stock Group) untuk mendefinisikan kelompok stok baru.", icon: <Settings className="w-8 h-8" /> },
        { title: "Tentukan Produk Anggota", description: "Pilih produk utama dan tambahkan produk-produk anggota yang akan saling berbagi stok dasar secara otomatis.", icon: <Package className="w-8 h-8" /> },
        { title: "Pantau Log Grup", description: "Setiap mutasi stok di salah satu produk anggota akan otomatis mengubah stok produk lain dalam grup tersebut secara real-time.", icon: <History className="w-8 h-8" /> },
      ]
    }
  ],
  ADMIN: [
    {
      id: "admin-settings",
      title: "Pengaturan Toko",
      description: "Di sini kamu bisa atur nama tokomu, alamat, nomor WhatsApp aktif, dan info pembayaran yang bakal muncul di kertas struk pelanggan.",
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
      description: "Tempat buat kelola semua barang di tokomu. Kamu bisa tambah produk baru, pasang harga jual, dan atur variannya biar siap dijual kasir.",
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
      description: "Catat data alamat dan nomor kontak supplier-mu di sini biar gampang saat mau pesan barang atau cek riwayat belanja toko.",
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
      description: "Catat profil pelanggan tokomu untuk pantau riwayat belanja mereka serta cek sisa utang/tempo belanja mereka.",
      icon: <Users className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Pelanggan", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Pelanggan', lalu klik menu 'Pelanggan' (ikon kontak).", icon: <Users className="w-8 h-8" /> },
        { title: "Input Data Pelanggan", description: "Klik tombol hitam '+ Pelanggan Baru' di kanan atas tabel. Isi form pop-up Nama lengkap, No Handphone, dan Alamat, kemudian klik tombol 'Simpan'.", icon: <FileText className="w-8 h-8" /> },
        { title: "Lihat Detail Profil", description: "Pada tabel daftar pelanggan, klik nama pelanggan yang dituju. Ini akan membuka halaman profil pelanggan lengkap dengan tab 'Riwayat Transaksi' dan catatan sisa piutang/tempo belanja mereka.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-expenses",
      title: "Mengelola Pengeluaran & Bukti Transaksi",
      description: "Catat semua pengeluaran operasional tokomu di sini dan jangan lupa lampirkan foto struk belanjanya biar pembukuan rapi.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Halaman Keuangan", description: "Buka menu 'Keuangan' di sidebar kiri. Klik tombol 'Tambah Pengeluaran' di bagian atas.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Isi Data Pengeluaran", description: "Ketik nama pemohon, pilih kategori pengeluaran, masukkan jumlah nominal, dan keterangan pengeluaran.", icon: <Settings className="w-8 h-8" /> },
        { title: "Upload Bukti Gambar", description: "Unggah foto nota belanja ke prnt.sc. Tunggu hingga selesai dan salin link URL gambar yang dihasilkan.", icon: <FileText className="w-8 h-8" /> },
        { title: "Tempel Link & Simpan", description: "Tempel link URL prnt.sc ke kolom 'URL Lampiran', lalu klik 'Simpan' untuk memproses pengeluaran.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-export-reports",
      title: "Ekspor Laporan Keuangan (Excel & PDF)",
      description: "Kamu bisa download laporan keuangan dan kas toko dalam bentuk file Excel (buat diolah lagi) atau PDF (siap dicetak).",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Laporan Keuangan", description: "Dari sidebar kiri, masuk ke menu 'Laporan Keuangan' (di bawah kategori Keuangan).", icon: <TrendingUp className="w-8 h-8" /> },
        { title: "Buka Menu Ekspor", description: "Di pojok kanan atas halaman, klik tombol 'Ekspor'.", icon: <FileText className="w-8 h-8" /> },
        { title: "Pilih Format", description: "Pilih 'Excel (.xlsx)' jika ingin mengolah kembali angka, atau pilih 'PDF' untuk cetak/bagikan dokumen rapi.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih Periode Ekspor", description: "Tentukan cakupan waktu ekspor: Harian (hari ini), Mingguan (7 hari terakhir), atau Bulanan (bulan berjalan). Berkas akan otomatis terunduh.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-shopping-request",
      title: "Membuat Daftar Belanja (Shopping Request)",
      description: "Buat list barang-barang apa saja yang perlu dibeli ke supplier untuk nambah stok toko.",
      icon: <ShoppingCart className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Tab Daftar Belanja", description: "Masuk ke menu 'Supplier' di sidebar, lalu klik tab 'Daftar Belanja' di bagian atas.", icon: <Truck className="w-8 h-8" /> },
        { title: "Buat Pengajuan", description: "Klik tombol 'Buat Daftar Belanja'. Pilih supplier tujuan pada menu dropdown jika sudah ditentukan.", icon: <Settings className="w-8 h-8" /> },
        { title: "Tambah Produk", description: "Gunakan kolom 'Cari & Tambah Produk' untuk mencari dan memasukkan barang kebutuhan belanja.", icon: <Package className="w-8 h-8" /> },
        { title: "Atur Jumlah & Simpan", description: "Isi nominal jumlah kebutuhan (requested quantity) per produk, ketik catatan internal bila perlu, lalu klik 'Simpan Draft Belanja'.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-change-price",
      title: "Mengubah Harga Produk & HPP",
      description: "Ubah harga jual produk dan harga modal (HPP) dengan gampang lewat form edit di menu ini.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Tab Produk", description: "Masuk ke menu 'Produk' di sidebar, pastikan Anda berada di tab 'Produk'.", icon: <Package className="w-8 h-8" /> },
        { title: "Ubah Harga Langsung", description: "Klik tombol aksi 'Ubah Harga' di kolom paling kanan tabel produk untuk mengubah harga jual secara langsung.", icon: <Settings className="w-8 h-8" /> },
        { title: "Ubah HPP & Detail", description: "Klik tombol edit (ikon pensil) untuk membuka formulir lengkap. Di sini Anda bisa mengedit Harga Jual dasar, Harga Dinas, atau Harga Modal/HPP.", icon: <FileText className="w-8 h-8" /> },
        { title: "Pantau Riwayat", description: "Buka tab 'Riwayat Harga' di bagian atas halaman untuk memantau grafik dan log perubahan harga barang dari waktu ke waktu.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-import-products",
      title: "Import Massal Produk & Stok (Excel)",
      description: "Nggak perlu input manual satu-satu, kamu bisa langsung masukin banyak produk atau stok sekaligus pakai file Excel.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Pilih Menu Import", description: "Di halaman Produk, klik tombol 'Import' (dropdown) di pojok kanan atas layar.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih Jenis Import", description: "Pilih 'Import Bulk Products' untuk mengunggah katalog produk baru/lama, atau 'Import Bulk Stock' khusus untuk menyesuaikan stok gudang.", icon: <FileText className="w-8 h-8" /> },
        { title: "Unggah File Excel", description: "Pilih file Excel (.xlsx) dari komputer Anda untuk diunggah ke sistem.", icon: <FileText className="w-8 h-8" /> },
        { title: "Mapping Kolom & Proses", description: "Petakan nama kolom Excel agar sesuai dengan kolom sistem, periksa ringkasan data, lalu klik simpan untuk memulai import massal.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-stock-group",
      title: "Mengatur Grup Stok (Stock Group)",
      description: "Gabungkan produk dengan kemasan/varian berbeda (misal Semen sak dan Semen eceran) biar mereka pakai satu stok fisik yang sama di gudang.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Aktivitas Grup", description: "Masuk ke menu 'Produk' di sidebar, lalu pilih tab 'Aktivitas Grup' di navigasi atas.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Buat Grup Stok Baru", description: "Klik tombol 'Atur Grup Stok' (atau Bulk Stock Group) untuk mendefinisikan kelompok stok baru.", icon: <Settings className="w-8 h-8" /> },
        { title: "Tentukan Produk Anggota", description: "Pilih produk utama dan tambahkan produk-produk anggota yang akan saling berbagi stok dasar secara otomatis.", icon: <Package className="w-8 h-8" /> },
        { title: "Pantau Log Grup", description: "Setiap mutasi stok di salah satu produk anggota akan otomatis mengubah stok produk lain dalam grup tersebut secara real-time.", icon: <History className="w-8 h-8" /> },
      ]
    }
  ],
  CASHIER: [
    {
      id: "cashier-shift",
      title: "Memulai & Mengakhiri Shift",
      description: "Biar uang kas di laci kasir nggak selisih, selalu buka shift saat kamu mulai kerja dan tutup shift pas jam kerjamu selesai, ya!",
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
      description: "Layar utama kasir untuk melayani pembeli. Kamu bisa cari barang, pasang diskon, dan cetak struk pembayaran dengan cepat.",
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
      description: "Kalau ada pelanggan yang bayar belanjaan secara tempo/nyicil, catat pembayaran cicilan atau pelunasannya lewat menu ini.",
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
      description: "Jika pelanggan mau mengembalikan barang karena cacat atau salah beli, proses di sini agar stok gudang bertambah lagi dan uang bisa di-refund.",
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
      description: "Jika ada pengeluaran darurat pakai uang laci kasir (misal beli plastik atau bayar parkir), wajib dicatat di sini biar kas laci nggak tekor.",
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
      description: "Atas izin manajer, kamu bisa kasih diskon manual tambahan langsung di keranjang belanja pembeli.",
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
      description: "Urutan langkah kerja harian kasir dari mulai masuk kerja, melayani transaksi POS, hingga tutup shift kasir di akhir hari.",
      icon: <History className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Mulai Shift Kasir", description: "Buka menu 'Shift Kasir' di sidebar kiri -> kategori 'Lainnya'. Ketik jumlah modal kas awal di laci fisik, lalu klik tombol hitam 'Mulai Shift'.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Layani Transaksi POS", description: "Masuk ke menu 'Kasir' (POS) di sidebar kiri -> kategori 'Operasi'. Pilih produk pesanan pelanggan, klik 'Bayar', input uang diterima, lalu cetak struk.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Catat Pengeluaran Laci", description: "Jika ada pengeluaran kas dadakan, klik ikon dompet 'Pengeluaran' di bar atas layar POS, isi nominal dan alasan pengeluaran, lalu klik 'Simpan'.", icon: <FileText className="w-8 h-8" /> },
        { title: "Memeriksa Pending Transaksi", description: "Buka menu 'Riwayat' di sidebar kiri. Pada baris filter status di atas tabel, klik opsi 'Pending' untuk memfilter daftar transaksi yang membutuhkan persetujuan Anda.", icon: <Search className="w-8 h-8" /> },
        { title: "Menyetujui Pending Transaksi", description: "Pada baris transaksi pending yang sesuai, klik ikon titik tiga ('Aksi Lainnya') di ujung kanan, pilih 'Setujui', lalu pada modal yang muncul tentukan metode pembayaran dan jumlah bayar sebelum mengklik tombol hijau 'Setujui'.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Tutup Shift", description: "Di akhir hari, klik profil Anda di pojok kanan atas, klik 'Tutup Shift'. Hitung dan ketik nominal uang fisik di laci saat itu, lalu klik tombol merah 'Konfirmasi Akhiri Shift'.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "cashier-piutang-tab",
      title: "Mencatat Pembayaran Piutang (Tab Piutang)",
      description: "Bantu catat cicilan atau pelunasan sisa utang pembeli langsung dari daftar piutang di menu Pelanggan.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Halaman Pelanggan", description: "Buka menu samping 'Pelanggan' (di bawah kategori Pelanggan), lalu klik tab 'Piutang' di bagian atas.", icon: <Users className="w-8 h-8" /> },
        { title: "Cari Invoice Piutang", description: "Cari nomor invoice atau nama pelanggan yang ingin membayar piutang, lalu klik tombol 'Bayar Piutang' di kolom Aksi.", icon: <Search className="w-8 h-8" /> },
        { title: "Pilih Metode Pembayaran", description: "Pilih satu atau beberapa metode pembayaran sekaligus (Tunai, QRIS, Debit, atau Transfer) dan masukkan nominal uang yang dibayarkan.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Selesaikan Pembayaran", description: "Tambahkan catatan pembayaran jika diperlukan (misal bank pengirim), lalu klik 'Proses Pembayaran' untuk melunasi/mengurangi piutang.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "cashier-upload-bukti",
      title: "Mengunggah Bukti Transaksi (Pembayaran)",
      description: "Simpan bukti transfer bank atau struk pembayaran non-tunai pembeli biar gampang dicek nanti.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Menu Riwayat", description: "Masuk ke menu 'Riwayat' di sidebar kiri. Temukan transaksi yang ingin dilampirkan buktinya.", icon: <History className="w-8 h-8" /> },
        { title: "Pilih Upload Bukti", description: "Klik tombol titik tiga '...' di baris transaksi target, lalu pilih menu 'Upload Bukti Transaksi'.", icon: <Settings className="w-8 h-8" /> },
        { title: "Unggah Gambar ke prnt.sc", description: "Buka situs prnt.sc di browser. Unggah foto bukti transfer bank pelanggan, lalu salin URL link gambar yang dihasilkan.", icon: <FileText className="w-8 h-8" /> },
        { title: "Tempel Link & Simpan", description: "Tempel tautan prnt.sc ke kolom 'URL Lampiran' di modal, klik tombol '+ Tambah Gambar Lain' jika ada struk tambahan, lalu klik 'Simpan'.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    }
  ],
  SALES: [
    {
      id: "sales-draft",
      title: "Membuat Draft Transaksi",
      description: "Kalau ada pesanan tapi belum dibayar, simpan dulu sebagai Draft biar nanti bisa diproses dan diselesaikan oleh kasir.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka POS", description: "Buka menu samping (sidebar) sebelah kiri, pilih kategori 'Operasi', dan klik menu 'Kasir' (POS).", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Tambah Barang ke Keranjang", description: "Klik pada produk-produk yang dipesan oleh pelanggan di grid produk sebelah kiri agar masuk ke keranjang belanja sebelah kanan.", icon: <Package className="w-8 h-8" /> },
        { title: "Simpan Sebagai Draft", description: "Di bagian bawah keranjang belanja kanan, klik tombol abu-abu 'Simpan Draft' (ikon disket). Masukkan nama pelanggan dan catatan penting, lalu klik 'Simpan'.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "sales-invoice",
      title: "Mencetak Invoice / Struk",
      description: "Cetak invoice atau nota tagihan belanja untuk diserahkan ke pembeli sebagai bukti transaksi.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Riwayat Transaksi", description: "Buka menu samping (sidebar) sebelah kiri, pilih kategori 'Operasi', dan klik menu 'Riwayat'.", icon: <History className="w-8 h-8" /> },
        { title: "Pilih Transaksi", description: "Cari dan klik transaksi yang ingin Anda cetak invoice-nya pada tabel.", icon: <Search className="w-8 h-8" /> },
        { title: "Cetak Invoice", description: "Pada rincian transaksi di sebelah kanan, klik ikon printer atau tombol 'Cetak Invoice' di sudut kanan atas panel.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "sales-sj",
      title: "Membuat Surat Jalan (Delivery Order)",
      description: "Buat surat jalan pengiriman barang untuk pesanan yang sudah lunas atau sudah bayar DP.",
      icon: <Truck className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Cetak Surat Jalan", description: "Di halaman Riwayat Transaksi, cari transaksi lunas/DP. Klik tombol aksi titik tiga '...' di ujung kanan, pilih 'Cetak Surat Jalan'.", icon: <History className="w-8 h-8" /> },
        { title: "Mulai Buat Baru", description: "Pada modal Surat Jalan yang terbuka, klik tombol 'Buat Surat Jalan' (atau 'Buat Surat Jalan Baru').", icon: <Truck className="w-8 h-8" /> },
        { title: "Isi Jumlah & Detail Kurir", description: "Masukkan jumlah barang yang dikirim saat ini untuk tiap item. Isi detail pengiriman seperti kurir, pengemudi, pelat kendaraan, dan nama penerima.", icon: <Settings className="w-8 h-8" /> },
        { title: "Simpan & Cetak", description: "Klik tombol simpan/proses. Surat jalan baru akan tersimpan di sistem dan siap dicetak sebagai lampiran fisik pengiriman.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "sales-alur-kerja",
      title: "Alur Kerja Sales",
      description: "Alur kerja tim sales dari mulai melayani pembeli, cetak invoice, hingga serahkan nota dan uang belanja ke kasir.",
      icon: <Users className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Melayani Pelanggan", description: "Menyambut dan membantu pelanggan untuk mencari barang yang mereka butuhkan.", icon: <Users className="w-8 h-8" /> },
        { title: "Memilih Produk", description: "Memilih dan memasukkan produk-produk sesuai keinginan pelanggan ke dalam sistem.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Mengirim Permintaan Pembayaran", description: "Mengirimkan rekap permintaan pembayaran pesanan melalui sistem.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Mencetak 2 Invoice", description: "Mencetak 2 rangkap invoice tagihan pesanan dari sistem.", icon: <FileText className="w-8 h-8" /> },
        { title: "Menyerahkan Invoice ke Pelanggan", description: "Memberikan satu rangkap invoice kepada pelanggan sebagai bukti pesanan.", icon: <Users className="w-8 h-8" /> },
        { title: "Menyerahkan Uang & Invoice ke Kasir", description: "Menyerahkan rangkap invoice kedua beserta uang pembayaran dari pelanggan kepada Kasir untuk diproses (Checkout).", icon: <DollarSign className="w-8 h-8" /> },
      ]
    }
  ],
  INVENTORY: [
    {
      id: "inventory-stock",
      title: "Manajemen Stok Gudang",
      description: "Pantau jumlah stok fisik barang di gudang tokomu dan cek riwayat mutasi keluar-masuk barangnya.",
      icon: <Package className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Menu Inventaris", description: "Buka menu samping (sidebar) sebelah kiri layar Anda, gulir ke kategori 'Manajemen Inventaris', lalu klik menu 'Inventaris' (ikon paket).", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Cek Riwayat Log Stok", description: "Klik pada baris produk yang ingin dipantau. Pada panel jendela detail produk yang terbuka di sebelah kanan, klik tab 'Histori Stok' di bagian atas untuk melihat log mutasi keluar-masuk barang.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "inventory-alur-kerja",
      title: "Alur Kerja Inventory",
      description: "Alur kerja harian orang gudang dari mulai cek log mutasi, terima kiriman barang masuk, hingga lapor barang rusak.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Verifikasi Mutasi Log", description: "Buka menu 'Inventaris' di sidebar. Klik tab 'Riwayat' -> sub-tab 'Log Stok' di pagi hari untuk memastikan mutasi stok harian berjalan sesuai catatan.", icon: <History className="w-8 h-8" /> },
        { title: "Input Penerimaan Barang", description: "Saat kiriman supplier datang, klik tombol hitam 'Input / Transaksi' di kanan atas halaman, klik 'Penerimaan Barang'. Isikan detail item barang, nomor surat jalan supplier, kuantitas fisik, lalu klik 'Simpan'.", icon: <Package className="w-8 h-8" /> },
        { title: "Catat Barang Pecah/Rusak", description: "Jika ditemukan produk rusak, klik tombol 'Input / Transaksi' -> 'Laporkan Barang Rusak'. Masukkan kode barang, kuantitas yang rusak, isi alasan penyesuaian, lalu klik 'Simpan'.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "inventory-tugas-harian",
      title: "Menyelesaikan Tugas Harian",
      description: "Cek daftar pekerjaan harianmu di sini, seperti mencocokkan stok fisik harian dan memverifikasi log keluar barang.",
      icon: <TrendingUp className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Cek Tugas Aktif", description: "Buka menu 'Inventaris' di sidebar kiri, lalu klik tab 'Tugas' di bagian atas halaman untuk melihat checklist tugas harian.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Lakukan Matching Stok", description: "Klik tugas 'Matching Stok Harian' (atau tombol 'Input / Transaksi' -> 'Cocokkan Stok (Harian)'). Cocokkan stok fisik di gudang dengan angka sistem, isi form kecocokan, lalu klik 'Simpan'.", icon: <History className="w-8 h-8" /> },
        { title: "Input Laporan Kerusakan", description: "Klik tugas 'Laporan Barang Rusak' (atau 'Input / Transaksi' -> 'Laporkan Barang Rusak'), cari produk reject hari ini, ketik kuantitas rusak, dan klik tombol 'Kirim'.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Verifikasi Log OUT", description: "Klik tugas 'Log OUT Belum Diverifikasi' (atau klik tab 'Riwayat' -> 'Log Stok'), periksa daftar barang keluar hari ini, lalu klik tombol 'Verifikasi' pada kolom aksi log yang sesuai.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "inventory-tugas-mingguan",
      title: "Menyelesaikan Tugas Mingguan",
      description: "Cek tugas akhir pekanmu di sini, seperti upload foto kebersihan rak gudang dan melakukan stock opname (hitung stok besar).",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Tugas Mingguan", description: "Buka menu 'Inventaris' di sidebar kiri, klik tab 'Tugas' di bagian atas halaman, lalu pilih sub-tab 'Tugas Mingguan'.", icon: <Package className="w-8 h-8" /> },
        { title: "Upload Bukti Kebersihan", description: "Klik tugas 'Proof Kebersihan Gudang' (atau tombol 'Input / Transaksi' -> 'Proof Kebersihan (Mingguan)'). Klik tombol 'Pilih File/Foto', unggah foto kondisi kebersihan rak gudang terupdate, lalu klik 'Submit'.", icon: <Settings className="w-8 h-8" /> },
        { title: "Stock Opname & Rekonsiliasi", description: "Lakukan perhitungan stok fisik rak gudang. Jika ada selisih, klik 'Input / Transaksi' -> 'Stock Out Internal' (jika menyusut) atau 'Penerimaan Barang' (jika berlebih) senilai jumlah selisih agar data stok sistem kembali akurat setelah disetujui Owner.", icon: <Users className="w-8 h-8" /> },
      ]
    },
    {
      id: "inventory-production",
      title: "Memantau & Mengelola Produksi (Kanban)",
      description: "Pantau alur pengerjaan pesanan cetak pembeli pakai papan visual Kanban, dari pesanan baru sampai siap diambil.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Halaman Produksi", description: "Buka menu samping 'Produksi' (di bawah kategori Operasi) untuk menampilkan Papan Kanban Produksi.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Ubah Status Pesanan", description: "Pindahkan kartu Job Order antar kolom (Baru -> Sedang Diproses -> Siap Diambil -> Selesai) dengan melakukan seret-lepas (drag-and-drop).", icon: <Settings className="w-8 h-8" /> },
        { title: "Kirim Notifikasi Ambil", description: "Ketika pesanan dipindahkan ke kolom 'Siap Diambil', klik tombol WhatsApp pada kartu pesanan untuk mengirim notifikasi penjemputan barang ke nomor pelanggan.", icon: <Users className="w-8 h-8" /> },
        { title: "Lihat Riwayat Aktivitas", description: "Buka tab 'Aktivitas' di sebelah tab 'Kanban' untuk mencari riwayat pergerakan status pesanan berdasarkan nama pelanggan atau nomor invoice.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "inventory-bulk-stock-import",
      title: "Import Stok Massal (Excel)",
      description: "Nggak usah edit stok satu-satu, kamu bisa update ribuan stok barang sekaligus pakai file Excel.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Pilih Menu Import", description: "Di halaman Produk, klik tombol 'Import' (dropdown) di pojok kanan atas layar.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih Import Bulk Stock", description: "Pilih 'Import Bulk Stock' untuk masuk ke halaman penyesuaian kuantitas stok dari berkas Excel.", icon: <FileText className="w-8 h-8" /> },
        { title: "Upload Excel", description: "Pilih file Excel (.xlsx) dari komputer Anda yang berisi kolom kode barang/SKU dan kuantitas stok.", icon: <FileText className="w-8 h-8" /> },
        { title: "Mapping & Selesai", description: "Lakukan pemetaan kolom, verifikasi ringkasan item, lalu klik proses untuk memperbarui stok barang secara massal.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "inventory-stock-group",
      title: "Mengatur Grup Stok (Stock Group)",
      description: "Mengelompokkan produk-produk variasi atau kemasan berbeda agar berbagi satu stok fisik yang sama di gudang.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Aktivitas Grup", description: "Masuk ke menu 'Produk' di sidebar, lalu pilih tab 'Aktivitas Grup' di navigasi atas.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Buat Grup Stok Baru", description: "Klik tombol 'Atur Grup Stok' (atau Bulk Stock Group) untuk mendefinisikan kelompok stok baru.", icon: <Settings className="w-8 h-8" /> },
        { title: "Tentukan Produk Anggota", description: "Pilih produk utama dan tambahkan produk-produk anggota yang akan saling berbagi stok dasar secara otomatis.", icon: <Package className="w-8 h-8" /> },
        { title: "Pantau Log Grup", description: "Setiap mutasi stok di salah satu produk anggota akan otomatis mengubah stok produk lain dalam grup tersebut secara real-time.", icon: <History className="w-8 h-8" /> },
      ]
    }
  ],
  AI_ASSISTANT: [
    {
      id: "ai-assistant-system-help",
      title: "Tanya Cara Pakai Fitur & Menu POS",
      description: "Bingung cara pakai menu tertentu atau ingin tahu apa saja hak akses akun Anda? Tanya saja ke Pak Teladan! Asisten AI akan membacakan dokumentasi bantuan dan menjelaskan langkah-langkahnya untuk Anda.",
      icon: <Bot className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Klik Tombol Robot", description: "Ketuk tombol mengambang robot berwarna biru (Pak Teladan) di pojok kanan bawah layar.", icon: <Bot className="w-8 h-8" /> },
        { title: "Ketik Pertanyaan", description: "Tulis pertanyaan Anda dengan bahasa santai. Contoh: 'Bagaimana cara mendaftarkan barang baru?' atau 'Kasir bisa akses menu apa saja?'.", icon: <Search className="w-8 h-8" /> },
        { title: "Dapatkan Panduan Instan", description: "Pak Teladan akan merangkum langkah-langkah penggunaan fitur atau batasan akses menu yang Anda tanyakan.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-product-price",
      title: "Cek Harga Jual Barang secara Instan",
      description: "Ingin tahu harga jual suatu barang dengan cepat tanpa perlu mencarinya secara manual di menu produk? Cukup tanyakan langsung namanya pada Pak Teladan.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Harga", description: "Tanyakan harga barang tertentu ke Pak Teladan, misalnya: 'Berapa harga semen gresik?' atau 'Tolong cek harga pipa PVC 2 inch'.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Proses Pencarian", description: "AI akan langsung mencarikan data harga jual aktif dari katalog produk toko Anda secara real-time.", icon: <Search className="w-8 h-8" /> },
        { title: "Hasil Tampilan", description: "Harga jual terupdate akan langsung muncul di obrolan beserta detail nama barang dan satuannya.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-product-stock",
      title: "Cek Sisa Stok Barang di Gudang",
      description: "Butuh info sisa persediaan fisik suatu barang? Tidak perlu pergi ke gudang atau membuka laporan stok, Pak Teladan bisa langsung mengeceknya untuk Anda.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Stok", description: "Kirim pesan tentang stok barang, misalnya: 'Cek stok semen tiga roda' atau 'Apakah stok cat Avian masih ada?'.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Pengecekan Data", description: "Asisten AI memeriksa persediaan barang tersebut di gudang database secara real-time.", icon: <Search className="w-8 h-8" /> },
        { title: "Tampilan Stok", description: "Sisa kuantitas stok terupdate beserta satuannya (misal: sak, pcs, dus) akan langsung ditampilkan.", icon: <Package className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-low-stock",
      title: "Cari Barang yang Stoknya Hampir Habis",
      description: "Untuk menghindari kehabisan barang di toko, Anda bisa meminta asisten AI menyajikan daftar produk apa saja yang kuantitas stoknya sudah menyentuh batas minimum stok.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Minta Daftar Stok Tipis", description: "Ketik pesan seperti: 'Produk apa saja yang stoknya menipis?' atau 'Tampilkan barang yang perlu dibeli lagi'.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Penyaringan Otomatis", description: "AI akan menyaring seluruh produk yang stok fisiknya saat ini kurang dari atau sama dengan batas minimal stok gudang.", icon: <Search className="w-8 h-8" /> },
        { title: "Tabel Stok Rendah", description: "Daftar barang berstok tipis akan tersaji rapi sehingga Anda bisa segera membuat daftar belanja ke supplier.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-daily-sales",
      title: "Lihat Omzet Penjualan Toko",
      description: "Pantau pencapaian toko Anda dari mana saja! Asisten AI dapat menghitung total pendapatan (omzet), jumlah transaksi yang selesai, hingga laba kotor pada tanggal tertentu.",
      icon: <TrendingUp className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Penjualan", description: "Tulis tanggal penjualan yang ingin Anda pantau. Contoh: 'Berapa omzet hari ini?' atau 'Tampilkan ringkasan penjualan kemarin'.", icon: <TrendingUp className="w-8 h-8" /> },
        { title: "Perhitungan Data", description: "Pak Teladan akan merangkum seluruh nota penjualan yang berstatus selesai (Lunas/DP) pada tanggal tersebut.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Laporan Ringkas", description: "Anda akan menerima rincian total omzet uang masuk, laba kotor, serta jumlah transaksi yang berhasil diproses.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-top-products",
      title: "Cari Barang Paling Laku (Best Seller)",
      description: "Ketahui produk-produk apa saja yang menjadi penyumbang omzet terbesar atau paling diminati oleh pelanggan pada hari atau tanggal tertentu.",
      icon: <ShoppingCart className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Best Seller", description: "Ketik pertanyaan seperti: 'Apa produk terlaris hari ini?' atau 'Tampilkan 10 barang paling laku kemarin'.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Analisis Penjualan", description: "AI akan menyusun urutan produk berdasarkan jumlah kuantitas yang terjual dan total omzet yang dihasilkan.", icon: <Search className="w-8 h-8" /> },
        { title: "Daftar Terlaris", description: "Daftar 10 produk terbaik beserta jumlah unit terjual akan ditampilkan untuk membantu Anda merencanakan stok.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-supplier-search",
      title: "Cari Kontak & Alamat Pemasok (Supplier)",
      description: "Butuh menghubungi pemasok barang dengan cepat? Mintalah asisten AI untuk mencarikan kontak penanggung jawab (PIC) beserta alamat supplier Anda.",
      icon: <Truck className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Kontak Supplier", description: "Ketik nama supplier yang Anda cari, misalnya: 'Cari kontak supplier semen' atau 'Tampilkan detail alamat PT Logam Mulia'.", icon: <Truck className="w-8 h-8" /> },
        { title: "Pencarian Pemasok", description: "AI memindai daftar supplier aktif yang terdaftar di sistem toko Anda.", icon: <Search className="w-8 h-8" /> },
        { title: "Info Kontak Tampil", description: "Nama PIC, nomor telepon/WhatsApp, dan alamat pengiriman supplier akan langsung ditampilkan.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-customer-search",
      title: "Cari Nomor Telepon & Profil Pelanggan",
      description: "Temukan data profil pelanggan setia Anda untuk mengecek nomor WhatsApp atau nama perusahaan tempat mereka bekerja secara instan.",
      icon: <Users className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Pelanggan", description: "Cari berdasarkan nama atau nomor telepon. Contoh: 'Cari pelanggan bernama Budi' atau 'Tampilkan profil PT Maju Jaya'.", icon: <Users className="w-8 h-8" /> },
        { title: "Pemindaian Data", description: "AI mencari data di dalam database manajemen pelanggan (CRM) toko.", icon: <Search className="w-8 h-8" /> },
        { title: "Detail Pelanggan", description: "Hasil pencarian berupa nama lengkap, nomor HP, nama instansi/perusahaan, dan status keanggotaan akan ditampilkan.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-customer-debt",
      title: "Cek Sisa Utang (Piutang) Pelanggan",
      description: "Pantau sisa tagihan belanja tempo dari pelanggan tertentu agar tagihan dapat ditagih tepat waktu tanpa ada yang terlewat.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Piutang", description: "Tulis nama pelanggan yang ingin Anda cek utangnya. Contoh: 'Berapa total piutang Pak Bambang?' atau 'Apakah PT Jaya Baru punya utang belum lunas?'.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Cek Invoice Belum Lunas", description: "AI menelusuri riwayat transaksi tempo pelanggan bersangkutan yang masih berstatus 'Belum Lunas' (Pending/DP).", icon: <Search className="w-8 h-8" /> },
        { title: "Total Tagihan", description: "Jumlah sisa nominal piutang yang wajib dibayarkan akan ditampilkan dengan jelas di layar chat.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-customer-recap",
      title: "Lihat Ringkasan Belanja Pelanggan 30 Hari Terakhir",
      description: "Dapatkan analisis singkat mengenai keaktifan belanja pelanggan selama sebulan ke belakang untuk mengetahui loyalitas mereka.",
      icon: <History className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Minta Rekap Belanja", description: "Ketik perintah rekap, contoh: 'Rekap belanja Pak Andi selama 30 hari terakhir' atau 'Bagaimana riwayat belanja Toko Makmur?'.", icon: <History className="w-8 h-8" /> },
        { title: "Kompilasi Riwayat", description: "Pak Teladan mengumpulkan data total pesanan dibuat, jumlah uang belanja masuk, dan piutang yang sudah dicicil dalam 30 hari terakhir.", icon: <Search className="w-8 h-8" /> },
        { title: "Laporan Loyalitas", description: "Rangkuman transaksi disajikan sehingga Anda mengetahui seberapa besar kontribusi belanja pelanggan tersebut.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-pending-tx",
      title: "Lihat Daftar Transaksi Tertunda (Pending & Draft)",
      description: "Periksa kembali pesanan pelanggan yang pembayarannya masih tertunda (Pending Approval), transaksi cicilan (DP), atau nota yang masih disimpan sebagai Draft.",
      icon: <History className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Transaksi Pending", description: "Kirim pesan seperti: 'Tampilkan transaksi yang masih pending' atau 'Apakah ada nota draft hari ini?'.", icon: <History className="w-8 h-8" /> },
        { title: "Penyaringan Status", description: "AI mengelompokkan transaksi aktif yang belum diselesaikan atau sedang menunggu persetujuan (approval) kasir/owner.", icon: <Search className="w-8 h-8" /> },
        { title: "Daftar Transaksi", description: "Daftar nomor nota invoice, status transaksi, nama pelanggan, dan nominal belanja akan muncul untuk segera ditindaklanjuti.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    }
  ]
};

function searchInContent(item: AccordionItem, query: string): boolean {
  if (!query) return true;
  const lowerQuery = query.toLowerCase();

  // Search in title
  if (item.title.toLowerCase().includes(lowerQuery)) return true;

  // Search in description
  if (item.description?.toLowerCase().includes(lowerQuery)) return true;

  // Search in steps
  return item.steps.some(
    (step) =>
      step.title.toLowerCase().includes(lowerQuery) ||
      step.description.toLowerCase().includes(lowerQuery)
  );
}

export default function HelpContent({ targetRole, searchQuery = "" }: { targetRole: Role | "AI_ASSISTANT"; searchQuery?: string }) {
  const allContent = ROLE_CONTENT[targetRole] || [];
  const content = useMemo(() => {
    if (!searchQuery) return allContent;
    return allContent.filter((item) => searchInContent(item, searchQuery));
  }, [allContent, searchQuery]);

  const [openId, setOpenId] = useState<string | null>(null);

  // Auto-expand first item when search or role changes
  useEffect(() => {
    setOpenId(content[0]?.id ?? null);
  }, [content]);

  if (allContent.length === 0) {
    return (
      <div className="p-8 text-center text-surface-500 bg-surface-50 rounded-2xl border border-surface-200">
        Belum ada panduan khusus untuk peran ini.
      </div>
    );
  }

  if (searchQuery && content.length === 0) {
    return (
      <div className="p-8 text-center text-surface-500 bg-surface-50 rounded-2xl border border-surface-200">
        <Search className="w-12 h-12 mx-auto mb-3 text-surface-300" />
        <p className="font-semibold text-surface-700 mb-1">Tidak ada hasil</p>
        <p className="text-sm">Coba kata kunci lain atau periksa ejaan Anda.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!searchQuery && ROLE_DESCRIPTIONS[targetRole] && (
        <div className="bg-brand-50 border border-brand-100 rounded-2xl p-5 mb-2">
          <p className="text-brand-800 font-medium mb-3">{ROLE_DESCRIPTIONS[targetRole].desc}</p>
          <div className="bg-white/60 rounded-xl p-4">
            <h3 className="text-sm font-bold text-brand-900 mb-2">Tanggung Jawab Utama:</h3>
            <ul className="list-disc list-inside space-y-1.5 text-sm text-brand-700">
              {ROLE_DESCRIPTIONS[targetRole].resps.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
    </div>
  );
}
