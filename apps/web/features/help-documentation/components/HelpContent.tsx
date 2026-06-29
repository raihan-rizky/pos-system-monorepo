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
import { motion, AnimatePresence } from "motion/react";
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
    desc: "Kenalan dulu yuk sama Pak Teladan! Asisten AI pintar yang siap sedia bantuin operasional toko biar makin gampang. Mulai dari ngecek stok barang sampai intip omzet harian, tinggal tanya aja ke Pak Teladan lewat tombol robot biru di pojok kanan bawah layar ya. Kalau pertanyaanmu bisa cocok ke beberapa panduan, Pak Teladan akan minta klarifikasi singkat dulu biar langkahnya tepat.",
    resps: [
      "Ngasih tau cara pakai menu dan fitur sistem secara instan, gak usah bingung lagi!",
      "Ngecek sisa stok barang, info harga produk, sampai daftar produk paling laris manis",
      "Nyari kontak supplier (pemasok) dan profil pelanggan dalam sekejap",
      "Ngerangkum keuangan harian toko, tagihan piutang pelanggan, sampai rekap belanja mereka"
    ]
  }
};

const ROLE_CONTENT: Record<string, AccordionItem[]> = {
  OWNER: [
    {
      id: "owner-rbac",
      title: "Mengelola Akses (RBAC)",
      description: "Menu ini dipakai untuk mengatur siapa saja yang boleh membuka halaman tertentu atau melakukan aksi di aplikasi. Tampilan ringkasan role dan matrix modul membantu Owner melihat perubahan permission sebelum disimpan.",
      icon: <ShieldCheck className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Pengaturan", description: "Buka menu samping (sidebar) sebelah kiri layar, gulir ke paling bawah lalu klik menu 'Pengaturan' (ikon gerigi) untuk masuk ke halaman pengaturan utama.", icon: <Settings className="w-8 h-8" /> },
        { title: "Buka Tab RBAC", description: "Pada halaman pengaturan yang terbuka, klik tab 'RBAC' (hanya terlihat oleh Owner). Owner selalu punya akses penuh dan tidak ikut diedit.", icon: <Users className="w-8 h-8" /> },
        { title: "Baca Ringkasan Role", description: "Lihat kartu ringkasan Admin, Kasir, Sales, dan Inventaris untuk mengetahui jumlah halaman, aksi, custom permission, dan perubahan sensitif pada tiap role.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Bandingkan Matrix Modul", description: "Gunakan matrix modul untuk membandingkan akses antar role. Matrix ini adalah ringkasan konfigurasi permission, bukan bukti enforcement route atau API.", icon: <FileText className="w-8 h-8" /> },
        { title: "Atur Izin per Modul", description: "Pilih role dan modul yang ingin diubah, lalu centang akses halaman atau aksi resource yang dibutuhkan. Status 'Belum disimpan' muncul saat ada perubahan lokal.", icon: <Settings className="w-8 h-8" /> },
        { title: "Review & Konfirmasi", description: "Klik 'Review & Simpan' untuk melihat daftar perubahan. Perubahan sensitif seperti RBAC, finance, WhatsApp, HPP, dan approval harus dikonfirmasi sebelum tersimpan.", icon: <ShieldCheck className="w-8 h-8" /> },
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
      description: "Catat semua biaya operasional toko di sini dan jangan lupa lampirkan foto struk belanjanya biar pembukuan rapi.",
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
      description: "Catat semua pengeluaran operasional toko di sini dan jangan lupa lampirkan foto struk belanjanya biar pembukuan rapi.",
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
        { title: "Verifikasi Mutasi Log", description: "Buka menu 'Inventaris' di sidebar. Klik tab 'Riwayat' -> sub-tab 'Log Stok' di pagi hari untuk memastikan mutasi stok harian berjalan sesuai catatan. Di layar HP, geser bar sub-tab Riwayat secara horizontal dan baca log sebagai kartu ringkas.", icon: <History className="w-8 h-8" /> },
        { title: "Input Penerimaan Barang", description: "Saat kiriman supplier datang, klik tombol hitam 'Input / Transaksi' di kanan atas halaman, klik 'Penerimaan Barang'. Isikan detail item barang, nomor surat jalan supplier, kuantitas fisik, lalu klik 'Simpan'.", icon: <Package className="w-8 h-8" /> },
        { title: "Catat Barang Pecah/Rusak", description: "Jika ditemukan produk rusak, klik tombol 'Input / Transaksi' -> 'Laporkan Barang Rusak'. Masukkan kode barang, kuantitas yang rusak, isi alasan penyesuaian, lalu klik 'Simpan'.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "inventory-tugas-harian",
      title: "Menyelesaikan Tugas Harian",
      description: "Cek daftar pekerjaan harianmu di sini, seperti mencocokkan stok fisik harian dan memverifikasi log keluar barang. Catatan: Anda wajib melakukan Check In terlebih dahulu pada widget harian agar panel tugas harian (Pusat Kerja Hari Ini) tidak terkunci/buram.",
      icon: <TrendingUp className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Cek Tugas Aktif", description: "Lakukan Check In terlebih dahulu pada widget harian. Buka menu 'Inventaris' di sidebar kiri, lalu klik tab 'Tugas' di bagian atas halaman untuk melihat checklist tugas harian.", icon: <ShoppingCart className="w-8 h-8" /> },
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
      description: "Bingung cara pakai menu tertentu atau mau tahu apa aja hak akses akunmu? Tanya aja langsung ke Pak Teladan. Untuk panduan operasional FAQ, jawabannya tampil sebagai diagram langkah yang aman sesuai akses role kamu.",
      icon: <Bot className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Klik Tombol Robot", description: "Pencet tombol robot bulat warna biru (Pak Teladan) yang ngambang di pojok kanan bawah layar.", icon: <Bot className="w-8 h-8" /> },
        { title: "Ketik Pertanyaan", description: "Tulis pertanyaanmu pakai bahasa santai sehari-hari. Contoh: 'Cara tambah barang gimana sih?' atau 'Kasir bisa buka menu apa aja?'.", icon: <Search className="w-8 h-8" /> },
        { title: "Baca Diagram Langkah", description: "Kalau pertanyaanmu cocok dengan panduan FAQ, Pak Teladan menampilkan stepper berisi langkah terpercaya, sumber FAQ, dan tombol buka halaman yang sesuai aksesmu.", icon: <Sparkles className="w-8 h-8" /> },
        { title: "Tetap Kamu yang Konfirmasi", description: "Pak Teladan cuma bantu navigasi dan penjelasan. Ia tidak mengisi form, menekan tombol, atau menyimpan data operasional secara otomatis.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-product-price",
      title: "Cek Harga Jual Barang Super Cepat",
      description: "Pengen tahu harga jual suatu barang tanpa perlu ribet nyari manual di menu produk? Tinggal tanya aja nama barangnya ke Pak Teladan.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Harga", description: "Tanya aja harga barang yang kamu mau ke Pak Teladan, contohnya: 'Berapa sih harga semen gresik?' atau 'Cek harga pipa PVC 2 inch dong'.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Proses Pencarian", description: "Pak Teladan bakal langsung gercep nyari data harga jual terupdate dari katalog tokomu.", icon: <Search className="w-8 h-8" /> },
        { title: "Hasil Tampilan", description: "Harga jual terbarunya langsung muncul di layar chat lengkap dengan detail nama barang dan satuannya.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-product-stock",
      title: "Intip Sisa Stok Barang di Gudang",
      description: "Butuh info sisa stok barang? Gak usah repot-repot ke gudang atau buka laporan stok yang panjang, Pak Teladan bisa langsung cek stoknya buat kamu.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Stok", description: "Kirim chat nanyain stok barang, misalnya: 'Stok semen tiga roda sisa berapa?' atau 'Cat Avian masih ada gak ya?'.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Pengecekan Data", description: "Pak Teladan bakal langsung meluncur buat meriksa sisa stok barang itu di database gudang secara real-time.", icon: <Search className="w-8 h-8" /> },
        { title: "Tampilan Stok", description: "Jumlah sisa stok paling baru beserta satuannya (kayak sak, pcs, atau dus) bakalan langsung muncul di chat.", icon: <Package className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-low-stock",
      title: "Cari Barang yang Stoknya Mau Habis",
      description: "Biar gak kecolongan kehabisan barang di toko, kamu bisa minta Pak Teladan buat ngelist barang apa aja yang stoknya udah tipis dan hampir habis.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Minta Daftar Stok Tipis", description: "Ketik aja chat kayak: 'Stok barang apa aja nih yang udah mau abis?' atau 'List barang yang harus di-restock dong'.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Penyaringan Otomatis", description: "Pak Teladan bakal langsung nyaring produk-produk yang stoknya udah di bawah batas minimal gudang.", icon: <Search className="w-8 h-8" /> },
        { title: "Tabel Stok Rendah", description: "Daftar barang berstok tipis bakal tersaji rapi, jadi kamu bisa gercep bikin daftar belanja ke supplier!", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-daily-sales",
      title: "Pantau Omzet & Cuan Toko",
      description: "Pantau performa tokomu dari mana aja dengan gampang! Pak Teladan bisa bantu hitung total omzet harian, jumlah transaksi, sampai laba kotor toko.",
      icon: <TrendingUp className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Penjualan", description: "Tanya aja omzet pada tanggal tertentu, misalnya: 'Hari ini dapet omzet berapa?' atau 'Rangkuman penjualan kemarin dong'.", icon: <TrendingUp className="w-8 h-8" /> },
        { title: "Perhitungan Data", description: "Pak Teladan bakal langsung ngumpulin semua data nota penjualan yang udah beres (Lunas atau DP) di tanggal itu.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Laporan Ringkas", description: "Kamu bakal dapet rincian total omzet uang masuk, laba kotor, dan total transaksi yang sukses diproses hari itu.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-top-products",
      title: "Cek Produk Paling Laris Manis",
      description: "Mau tau produk apa aja yang paling laku keras atau jadi penyumbang cuan terbesar buat tokomu? Tanya langsung aja ke Pak Teladan.",
      icon: <ShoppingCart className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Best Seller", description: "Ketik pertanyaan kayak: 'Hari ini barang apa yang paling laris?' atau 'Cari produk best seller minggu ini dong'.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Analisis Penjualan", description: "Pak Teladan bakal langsung mengurutkan barang-barang berdasarkan jumlah yang paling banyak terjual.", icon: <Search className="w-8 h-8" /> },
        { title: "Daftar Terlaris", description: "Daftar produk paling laku bakal ditampilkan biar kamu bisa gampang ngerencanain stok barang ke depannya.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-supplier-search",
      title: "Cari Kontak & Alamat Supplier",
      description: "Butuh hubungi supplier buru-buru? Minta Pak Teladan aja buat nyariin nomor HP penanggung jawab (PIC) beserta alamat lengkap supplier tokomu.",
      icon: <Truck className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Kontak Supplier", description: "Ketik nama supplier yang kamu cari, misalnya: 'Cari kontak supplier semen' atau 'Alamat PT Logam Mulia di mana ya?'.", icon: <Truck className="w-8 h-8" /> },
        { title: "Pencarian Pemasok", description: "Pak Teladan bakal gercep nyisir daftar supplier aktif yang terdaftar di database toko.", icon: <Search className="w-8 h-8" /> },
        { title: "Info Kontak Tampil", description: "Nama PIC, nomor HP/WhatsApp, dan alamat lengkap si supplier langsung keliatan di obrolan chat.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-customer-search",
      title: "Cari Kontak & Profil Pelanggan",
      description: "Mau nyari info kontak pelanggan setia? Tanya Pak Teladan aja buat cek nomor WhatsApp atau nama perusahaan mereka dalam sekejap.",
      icon: <Users className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Pelanggan", description: "Tanya aja nama atau nomor HP-nya, contoh: 'Cari pelanggan namanya Budi dong' atau 'PT Maju Jaya nomor teleponnya berapa?'.", icon: <Users className="w-8 h-8" /> },
        { title: "Pemindaian Data", description: "Pak Teladan bakal langsung nyari data pelanggan tersebut di sistem database pelanggan (CRM) toko.", icon: <Search className="w-8 h-8" /> },
        { title: "Detail Pelanggan", description: "Hasilnya berupa nama lengkap, nomor HP, nama instansi/toko, dan status member-nya bakalan langsung ditampilkan.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-customer-debt",
      title: "Cek Sisa Utang/Bon Pelanggan",
      description: "Pantau sisa tagihan belanja tempo pelanggan biar gampang nagihnya dan gak ada bon yang kelupaan atau terlewat.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Piutang", description: "Tulis aja nama pelanggan yang mau kamu cek utangnya. Contoh: 'Bon Pak Bambang sisa berapa?' atau 'PT Jaya Baru ada utang gak ya?'.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Cek Invoice Belum Lunas", description: "Pak Teladan bakal langsung nelusurin riwayat nota-nota belanja tempo pelanggan yang statusnya masih 'Belum Lunas'.", icon: <Search className="w-8 h-8" /> },
        { title: "Total Tagihan", description: "Jumlah sisa nominal piutang yang harus dibayar bakalan langsung keliatan jelas di layar obrolan.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-customer-recap",
      title: "Cek Rekap Belanja Bulanan Pelanggan",
      description: "Pengen tau seberapa sering pelanggan setiamu belanja sebulan terakhir? Cari tahu tingkat keaktifan dan loyalitas mereka lewat Pak Teladan.",
      icon: <History className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Minta Rekap Belanja", description: "Ketik aja pesan kayak: 'Rekap belanja Pak Andi sebulan ini dong' atau 'Gimana riwayat belanjanya Toko Makmur?'.", icon: <History className="w-8 h-8" /> },
        { title: "Kompilasi Riwayat", description: "Pak Teladan bakal ngerangkum total orderan, jumlah uang masuk, dan sisa piutang mereka dalam 30 hari belakangan.", icon: <Search className="w-8 h-8" /> },
        { title: "Laporan Loyalitas", description: "Rangkuman belanjanya langsung tersaji rapi biar kamu tau seberapa setia pelanggan tersebut.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "ai-assistant-pending-tx",
      title: "Cek Transaksi Pending & Draft",
      description: "Periksa lagi transaksi pelanggan yang nunggu disetujui (Pending Approval), transaksi cicilan (DP), atau nota yang disimpen jadi Draft.",
      icon: <History className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Transaksi Pending", description: "Kirim chat kayak: 'Ada transaksi pending gak hari ini?' atau 'Tunjukin list nota draft dong'.", icon: <History className="w-8 h-8" /> },
        { title: "Penyaringan Status", description: "Pak Teladan langsung nyaring nota-nota aktif yang nunggu persetujuan kasir/owner atau yang masih draft.", icon: <Search className="w-8 h-8" /> },
        { title: "Daftar Transaksi", description: "Daftar nomor nota, status, nama pelanggan, dan total nominal belanjanya langsung muncul biar bisa langsung kamu proses.", icon: <Sparkles className="w-8 h-8" /> },
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
  const allContent = useMemo(() => ROLE_CONTENT[targetRole] || [], [targetRole]);
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

            <AnimatePresence initial={false}>
              {openId === item.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="overflow-hidden border-t border-surface-100"
                >
                  <div className="p-6">
                    {item.description && (
                      <p className="text-surface-600 mb-6 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                    <HelpDiagramStepper steps={item.steps} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}
