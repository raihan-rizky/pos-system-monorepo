"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  Settings,
  ShoppingCart,
  Package,
  DollarSign,
  Users,
  FileText,
  FileSpreadsheet,
  Download,
  Truck,
  ShieldCheck,
  TrendingUp,
  History,
  Pencil,
  GitCompareArrows,
  Warehouse,
  Search,
  Bot,
  Sparkles,
  Tag,
  ZoomIn,
  Database
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import HelpDiagramStepper, { Step } from "./HelpDiagramStepper";
export { resolveHelpStepVisual } from "./help-visual-registry";
import { AUDITED_HELP_STEP_TARGETS } from "./audited-help-step-targets";
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
    desc: "Kenalan dulu yuk sama Pak Teladan! Asisten AI pintar yang siap sedia bantuin operasional toko biar makin gampang. Mulai dari ngecek stok, menganalisis laporan, mengekspor rekap, sampai membuka modal inti, tinggal tanya lewat tombol robot biru di pojok kanan bawah layar ya. Kalau pertanyaanmu bisa cocok ke beberapa panduan, Pak Teladan akan minta klarifikasi singkat dulu biar langkahnya tepat.",
    resps: [
      "Ngasih tau cara pakai menu dan fitur sistem secara instan, gak usah bingung lagi!",
      "Ngecek sisa stok barang, info harga produk, sampai daftar produk paling laris manis",
      "Nyari kontak supplier (pemasok) dan profil pelanggan dalam sekejap",
      "Ngerangkum keuangan harian toko sekaligus menganalisis seluruh metrik serta mengekspor laporan dan rekap pelanggan; default-nya 30 hari terakhir dalam PDF jika periode atau format tidak disebutkan"
    ]
  }
};

const CATEGORY_HELP = {
  manage: "Buka tab Kategori di halaman Produk. Pilih Tambah kategori untuk mengisi beberapa baris sekaligus, atau pilih kategori lalu klik Ubah kategori. Editor tampil sebagai tabel ringkas di komputer dan kartu di ponsel. Cari nama kategori untuk menemukan baris; perubahan tetap tersimpan di editor meski baris tersembunyi oleh pencarian. Klik pilihan ikon untuk melihat gambar ikon, cari dengan kata Indonesia atau Inggris, lalu pilih, ganti, atau hapus ikon. Pilih warna dari palet, masukkan warna khusus, atau reset agar memakai warna bawaan. Buka pengaturan tambahan pada baris untuk mengubah urutan dan kelompok penjualan. Periksa jumlah kategori yang berubah dan klik Simpan di area bawah yang tetap terlihat; baris tersembunyi yang berubah juga ikut disimpan. Seluruh baris disimpan bersama; jika ada kesalahan, perbaiki baris tersebut lalu simpan kembali. Tambah memerlukan product.create, sedangkan edit memerlukan product.update. Kategori merupakan data bersama seluruh toko.",
  move: "Di daftar Produk, centang produk yang ingin dipindahkan lalu pilih Pindahkan Kategori. Pemindahan mencakup semua satuan dalam grup stok, termasuk satuan yang tidak aktif. Periksa kategori asal dan kategori tujuan, jumlah produk yang dipindahkan, serta produk yang sudah berada di tujuan. Jika grup tujuan memiliki identitas yang sama, periksa grup tersebut sebelum mencoba lagi. Aksi memerlukan product.update dan mengikuti lingkup toko. Harga pelanggan dan pengelompokan penjualan dapat berubah mengikuti aturan kategori tujuan; stok, satuan, dan harga dasar tidak diubah. Saat mengedit satu produk, ubah kategori dan nama, ukuran, atau bahan secara terpisah.",
  remove: "Di tab Kategori, pilih kategori lalu Hapus kategori. Tentukan kategori tujuan untuk setiap kategori asal yang masih berisi produk; kategori kosong tidak memerlukan tujuan dan tujuan tidak boleh ikut dihapus. Jika satu grup stok sudah memiliki kategori yang berbeda, pindahkan seluruh grup ke satu kategori terlebih dahulu. Tinjau hitungan produk aktif/nonaktif dan aturan harga aktif/nonaktif di seluruh toko beserta rincian toko, kelompok pelanggan, satuan, merek, mode dan nilai aturan. Aturan harga kategori asal ikut dihapus, tidak disalin ke tujuan, dan tidak dapat dipulihkan melalui fitur ini. Penghapusan memerlukan product.delete dan product.update. Hanya Owner dapat menghapus kategori yang memiliki aturan harga atau memindahkan produk lintas toko; Admin dapat menghapus kategori tanpa aturan harga dengan seluruh produk dalam lingkup tokonya.",
  confirm: "Perhatikan bahwa harga pelanggan dan pengelompokan penjualan dapat berubah. Centang Saya memahami dampak pemindahan produk dan penghapusan aturan harga ini, lalu ketik HAPUS N KATEGORI dengan N sesuai jumlah kategori terpilih, termasuk HAPUS 1 KATEGORI untuk satu kategori. Klik Pindahkan Produk dan Hapus Kategori, atau Hapus Kategori bila tidak ada produk. Jika dampak berubah, muat ulang pratinjau dan konfirmasi kembali sebelum melanjutkan. Produk dipindah, aturan asal dihapus, lalu kategori dihapus bersama; jika gagal, seluruh perubahan dibatalkan. Setelah berhasil, periksa jumlah aktual kategori terhapus, produk dipindah, dan aturan terhapus.",
};

const CATEGORY_HELP_STEPS: Step[] = [
  { title: "Tambah atau ubah kategori", description: CATEGORY_HELP.manage, icon: <Tag className="w-8 h-8" /> },
  { title: "Pindahkan produk terpilih", description: CATEGORY_HELP.move, icon: <Package className="w-8 h-8" /> },
  { title: "Tinjau dampak penghapusan", description: CATEGORY_HELP.remove, icon: <AlertTriangle className="w-8 h-8" /> },
  { title: "Konfirmasi lalu periksa hasil", description: CATEGORY_HELP.confirm, icon: <ShieldCheck className="w-8 h-8" /> },
];

const RAW_HELP_ROLE_CONTENT: Record<string, AccordionItem[]> = {
  OWNER: [
    {
      id: "owner-price-rounding",
      title: "Mengatur Pembulatan Harga Jual",
      description: "Samakan pembulatan hasil akhir harga jual produk, lalu lihat arah dan selisihnya pada harga produk atau kasir. Pengaturan awal aktif dengan kelipatan Rp500 dan ambang naik Rp50.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Pembulatan Harga", description: "Masuk ke Pengaturan > Pembulatan Harga. Secara default hanya Owner yang dapat mengelola tab ini. Owner dapat mendelegasikan izin Lihat dan Ubah pada resource settings.price_rounding melalui RBAC, bersama akses halaman Pengaturan.", icon: <Settings className="w-8 h-8" /> },
        { title: "Atur dan Periksa Pratinjau", description: "Pilih apakah pembulatan aktif, isi Kelipatan (Rp) dan Ambang naik (Rp), lalu periksa pratinjau langsung. Cari dan centang satu atau beberapa kategori yang tidak ingin dibulatkan; semua harga produk dalam kategori tersebut tetap tanpa pembulatan. Kosongkan pilihan untuk menerapkan aturan ke semua kategori. Dengan kelipatan Rp500 dan ambang Rp50, Rp4.049 turun ke Rp4.000 sedangkan Rp4.050 naik ke Rp4.500 pada kategori yang tidak dikecualikan.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Simpan dan Baca Badge Harga", description: "Klik Simpan pengaturan dan tunggu konfirmasi berhasil. Pada produk atau POS, klik badge Dibulatkan ke atas / Dibulatkan ke bawah, atau fokuskan lalu tekan Enter, untuk melihat harga asal, harga final, dan selisih pembulatan. Harga yang tidak berubah tidak menampilkan badge; transaksi final yang sudah tersimpan tetap memakai harga saat transaksi.", icon: <ShoppingCart className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-rbac",
      title: "Mengelola Akses (RBAC)",
      description: "Menu ini dipakai untuk mengatur siapa saja yang boleh membuka halaman tertentu atau melakukan aksi di aplikasi. Tampilan ringkasan role dan matrix modul membantu Owner melihat perubahan permission sebelum disimpan. Update operasional muncul di ikon bell dengan badge merah sesuai jumlah yang belum dibaca, termasuk Persetujuan Transaksi, permintaan stok, Daftar Belanja, dan Pembelian Barang. Klik item untuk membaca sekaligus membuka halaman terkait, atau pilih Tandai semua dibaca agar badge hilang. Ikon notifikasi awalnya disembunyikan di balik tab > pada tepi layar. Klik tab untuk menampilkan bell, geser bell atau tab ke posisi yang nyaman lalu lepas agar otomatis menempel ke sisi kiri atau kanan terdekat. Gunakan tombol sembunyikan di samping bell jika ingin menciutkannya lagi; sisi dan posisi terakhir tetap tersimpan setelah halaman dimuat ulang.",
      icon: <ShieldCheck className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Pengaturan", description: "Buka menu samping (sidebar) sebelah kiri layar, gulir ke paling bawah lalu klik menu 'Pengaturan' (ikon gerigi) untuk masuk ke halaman pengaturan utama.", icon: <Settings className="w-8 h-8" /> },
        { title: "Buka Tab RBAC", description: "Pada halaman pengaturan yang terbuka, klik tab 'RBAC' (hanya terlihat oleh Owner). Owner selalu punya akses penuh dan tidak ikut diedit.", icon: <Users className="w-8 h-8" /> },
        { title: "Baca Ringkasan Role", description: "Lihat kartu ringkasan Admin, Kasir, Sales, dan Inventaris untuk mengetahui jumlah halaman, aksi, custom permission, dan perubahan sensitif pada tiap role.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Bandingkan Matrix Modul", description: "Gunakan matrix modul untuk membandingkan konfigurasi akses antar role. Harga khusus di nota terpisah dari edit master produk. Atur Pemasukan manual, Pengeluaran dan transfer manual, Pembayaran utang supplier, serta Pencairan giro sesuai tugas role; Lihat pengeluaran tetap diperlukan untuk daftar dan ringkasan Keuangan Harian. Ekspor laporan keuangan diatur terpisah dari melihat dashboard. Pada Impor produk, Mulai impor mencakup produk, pratinjau, dan ekstraksi gambar; Perbarui impor mengatur kode supplier. Perubahan stok massal mencakup perubahan manual, impor stok, dan grup stok.", icon: <FileText className="w-8 h-8" /> },
        { title: "Atur Izin per Modul", description: "Pilih role lalu cari modul. Baca pratinjau akses dan prasyaratnya; akses halaman, data, dan tindakan diatur terpisah. Untuk mengubah Riwayat, izinkan halaman Riwayat serta Lihat dan Ubah transaksi; approval berdiri sendiri. Sales berizin dapat mengedit status yang didukung. Void mengikuti izin Ubah transaksi; Hapus mengikuti izin Hapus transaksi. Refund tetap terkunci untuk Sales. Izin Lihat progres impor atau stok massal hanya memantau; batal dan coba ulang memerlukan izin tindakan terkait. Memulai impor latar belakang memerlukan izin tindakan dan Lihat progres; tombol menjelaskan prasyarat yang kurang. Kontrol Khusus Owner dan approval stok umum tetap terkunci; izin Setujui, Tolak, dan Edit Penerimaan Barang tetap dapat didelegasikan. Belum disimpan menandai edit lokal.", icon: <Settings className="w-8 h-8" /> },
        { title: "Review & Konfirmasi", description: "Klik Review & Simpan untuk meninjau perubahan. Konfirmasikan izin sensitif sebelum menyimpan. Konfigurasi lama mewarisi izin umum yang sesuai sampai simpan pertama menetapkan nilai fitur tersebut; penolakan eksplisit tetap berlaku. Catatan perubahan hak akses menampilkan Owner, waktu WIB, dan izin yang diubah. Jika versi berubah di sesi lain, edit lokal tetap tersedia; muat versi terbaru hanya setelah meninjaunya, karena pemuatan ulang mengganti edit yang belum disimpan.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-shift-settings",
      title: "Mengatur Shift Kasir",
      description: "Owner dapat mematikan kewajiban shift jika kasir perlu bertransaksi tanpa membuka shift. Shift yang sedang terbuka akan dipause, bukan ditutup, sehingga history tetap aman.",
      icon: <Settings className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Pengaturan", description: "Masuk ke menu Pengaturan dari sidebar, lalu pilih tab 'Shift Kasir'. Tab ini hanya terlihat oleh Owner.", icon: <Settings className="w-8 h-8" /> },
        { title: "Matikan Shift Kasir", description: "Gunakan toggle 'Gunakan Shift Kasir', baca peringatan bahwa shift terbuka akan dipause, lalu klik 'Lanjutkan' untuk mengonfirmasi.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Kasir Bertransaksi", description: "Saat setting OFF, popup shift tidak muncul dan kasir dapat langsung membuka pembayaran tanpa active shift.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Nyalakan Kembali", description: "Saat toggle dinyalakan kembali, shift yang paused otomatis resume. Durasi pause tidak dihitung sebagai waktu kerja shift.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-reports",
      title: "Laporan Keuangan & Penjualan",
      description: "Di sini kamu bisa pantau performa tokomu secara keseluruhan. Kamu bisa lihat rangkuman pemasukan, pengeluaran, laba rugi, sampai grafik penjualan harian.",
      icon: <TrendingUp className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Laporan Keuangan", description: "Dari menu samping (sidebar) sebelah kiri layar, gulir ke bawah pada kategori 'Keuangan', lalu klik menu 'Laporan Keuangan' (ikon grafik batang).", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Pilih Tampilan dan Tanggal", description: "Di Laporan Lengkap, pilih rentang tanggal yang ingin dipantau. Pilih Lihat sebagai Sales untuk meninjau pemasukan harian dan Outstanding DP sesuai izin Sales yang tersimpan di Hak Akses. Jika Sales diberi akses laporan penuh, pratinjau juga menampilkan laporan penuh. Pilih satu tanggal WIB di tampilan harian; Outstanding DP memakai sisa pembayaran terkini dari nota hingga tanggal pilihan, bukan saldo historis. Pilih Laporan Lengkap untuk kembali.", icon: <History className="w-8 h-8" /> },
        { title: "Cetak atau Ekspor", description: "Jika ingin menyimpan file laporan, klik tombol 'Ekspor' di pojok kanan atas layar, lalu pilih Excel atau PDF. File Excel menyertakan ringkasan revenue per kategori produk.", icon: <FileText className="w-8 h-8" /> },
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
      title: "Menyetujui Daftar Belanja",
      description: "Satu persetujuan menetapkan jumlah dan harga beli serta mencatat Pembelian Barang. Pengeluaran dicatat saat penerimaan pertama yang berisi barang disetujui.",
      icon: <ShoppingCart className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Daftar Belanja", description: "Buka menu Supplier, lalu pilih tab 'Daftar Belanja'. Gunakan kartu Perlu Diproses dan Qty Menunggu untuk melihat antrean yang perlu ditangani, lalu cari dokumen berstatus 'Diajukan'.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Edit sebelum diproses", description: "Buka Tindakan lainnya > Edit daftar untuk mengganti supplier, barang, satuan, jumlah, atau catatan. Ganti satuan hanya dalam grup stok yang sama; angka jumlah tetap, misalnya 12 pcs menjadi 12 dus. Aksi ini memerlukan izin supplier.shopping_request.edit:update.", icon: <Settings className="w-8 h-8" /> },
        { title: "Periksa jumlah dan harga", description: "Dengan izin supplier.goods_purchase.approve:update, klik Tinjau & Setujui. Isi Jumlah, Satuan, dan Harga Beli aktual untuk setiap barang. Jumlah nol berarti barang tidak disetujui. Perbarui HPP tercentang secara default dan dapat dimatikan; HPP diterapkan setelah barang yang sesuai diterima dan disetujui.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Setujui sekaligus", description: "Klik Setujui dan Catat Pembelian. Pembelian Barang langsung disetujui; satu Pengeluaran sebesar total pembelian penuh dicatat saat penerimaan pertama yang berisi barang disetujui, termasuk jika barang datang sebagian. Jumlah di atas kebutuhan perlu konfirmasi. Stok bertambah setelah Penerimaan Barang disetujui.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Pilih pembayaran saat menerima", description: "Pada Penerimaan Barang, pilih Transfer atau Giro. Untuk Giro, isi Tanggal Jatuh Tempo. Metode yang ditetapkan pada penerimaan pertama yang berisi barang digunakan untuk penerimaan berikutnya.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Pantau penerimaan barang", description: "Di Daftar Belanja, pembelian yang disetujui memiliki badge BARANG BELUM DITERIMA, BARANG DITERIMA SEBAGIAN, atau BARANG SUDAH DITERIMA sesuai status penerimaannya. Gunakan filter penerimaan: Belum diterima, Diterima sebagian, atau Sudah diterima. Filter ini dapat digabungkan dengan pencarian dan status persetujuan; pilih Semua penerimaan untuk melihat seluruh daftar lagi.", icon: <Package className="w-8 h-8" /> },
        { title: "Tolak bila perlu", description: "Dengan izin supplier.goods_purchase.reject:update, buka Tinjau Daftar, tulis alasan penolakan, lalu tolak seluruh daftar. Penolakan tidak mencatat pembelian atau Pengeluaran.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-goods-purchase",
      title: "Menyelesaikan Pembelian Barang lama",
      description: "Dokumen Pembelian Barang lama tetap dapat diselesaikan dari tab Daftar Belanja. Permohonan baru memakai satu persetujuan di atas.",
      icon: <ShoppingCart className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka riwayat lama", description: "Masuk ke Supplier > Daftar Belanja. Pembelian Barang lama berstatus PENDING dapat diproses dari kartu daftar terkait. Untuk daftar lama yang sudah disetujui tanpa pembelian, pilih Lengkapi Pembelian Lama.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Pilih Daftar Belanja", description: "Pilih Daftar Belanja yang sudah disetujui. Nama supplier dan semua produk yang di-ACC akan tampil otomatis. Opsi bertanda ⚠ LAMA berasal dari alur lama; baca peringatan amber lalu centang konfirmasi bahwa stok sudah berubah dan expense lama akan diganti sebelum mengajukan.", icon: <FileText className="w-8 h-8" /> },
        { title: "Periksa jumlah & harga", description: "Jumlah awal mengikuti nilai yang di-ACC dan harga pembelian mengikuti biaya pada produk. Periksa Total pengeluaran sebelum mengajukan; persetujuan Pembelian Barang diperlukan sebelum membuat Penerimaan Barang.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Ajukan pembelian", description: "Klik 'Ajukan Pembelian Barang'. Dokumen masuk ke riwayat dengan status PENDING; langkah ini belum membuat Pengeluaran dan tidak mengubah stok.", icon: <FileText className="w-8 h-8" /> },
        { title: "Review per produk", description: "Dengan izin supplier.goods_purchase.approve:update, pilih Setujui, Edit, Hapus, atau tambah produk unit besar di bawah daftar. Saat Edit, unit dapat diganti ke varian satuan besar dalam grup stok yang sama. Produk yang belum diputuskan ditandai Belum Ada Aksi.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Edit keputusan", description: "Jika produk sudah disetujui, konfirmasi edit akan mengembalikannya menjadi Belum Ada Aksi. Perubahan tersimpan langsung dan minimal satu produk harus tersisa.", icon: <Settings className="w-8 h-8" /> },
        { title: "Selesaikan atau tolak", description: "Setelah semua produk diputuskan, Pembelian Barang menjadi APPROVED dan satu Pengeluaran kategori Bahan dibuat. Opsi pembaruan HPP yang sudah tersedia tetap mengikuti pilihan dan izin pada form pembelian; harga pada penerimaan dicatat dan diperbarui sesuai satuan setelah penerimaan disetujui. Penolakan memerlukan alasan dan izin supplier.goods_purchase.reject:update. Persetujuan pembelian belum menambah stok.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Terima barang", description: "Pada Pembelian Barang APPROVED, klik Catat Penerimaan. Pilih kesesuaian dan isi jumlah, lalu periksa seluruh satuan beserta HPP Unit, Harga Jual, Harga Jual Agen, dan Harga Jual Dinas. Untuk barang Tidak Sesuai, harga bersifat opsional. Pilih Transfer atau Giro dan isi tanggal jatuh tempo untuk Giro bila pembayaran belum ditetapkan. Ajukan ke Owner; harga barang yang sesuai diperbarui bersama stok setelah disetujui.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Pantau penerimaan", description: "Gunakan 'Lihat Riwayat Penerimaan Barang' untuk membuka Inventaris > Transaksi > Penerimaan Barang dengan filter PB terkait. Status Pembelian Barang berubah menjadi BARANG DITERIMA SEBAGIAN atau BARANG DITERIMA. Klik barisnya untuk membandingkan jumlah dipesan, diterima, pending, dan sisa.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-piutang",
      title: "Melihat Daftar Piutang",
      description: "Pantau piutang transaksi dan manual pelanggan. Pelanggan yang memiliki riwayat piutang manual tidak dapat dihapus, termasuk yang sudah lunas, agar catatan pembayaran tetap tersimpan.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Pelanggan", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Pelanggan', lalu klik menu 'Pelanggan' (ikon kontak). Buka detail satu pelanggan, lalu pilih Rentang Detail 7 Hari, 14 Hari, atau 30 Hari. Kartu Piutang Belum Lunas menampilkan sisa piutang transaksi dan manual yang dibuat pada periode itu. Piutang Dilunasi menampilkan nilai piutang yang lunas pada periode itu, termasuk piutang lama. Rata-rata Waktu Pelunasan dihitung per piutang yang lunas dengan selisih tanggal WIB; jika belum ada, tampil Belum ada pelunasan. Produk Teratas mengikuti periode yang sama.", icon: <Users className="w-8 h-8" /> },
        { title: "Catat Piutang Manual", description: "Piutang manual mencatat utang lama atau tagihan di luar kasir tanpa menambah penjualan, order, atau mengubah stok. Buka detail pelanggan > Piutang Manual > Tambah Piutang. Isi nominal lebih dari nol, tanggal utang paling lambat hari ini dalam WIB, tanggal jatuh tempo sama atau setelah tanggal utang, dan catatan bila perlu. Klik Simpan Piutang; pelanggan mengikuti profil yang dibuka. Melihat memerlukan customer.read, sedangkan menambah dan membayar memerlukan customer.update.", icon: <Settings className="w-8 h-8" /> },
        { title: "Cek dan Bayar Tagihan", description: "Tab Piutang menampilkan invoice DP/Tempo serta bagian Piutang Manual. Pada catatan manual, klik Bayar Piutang Manual, isi nominal hingga maksimal sisa piutang, pilih satu metode (Tunai, Debit, Kartu Kredit, QRIS, atau Transfer), lalu Simpan Pembayaran. Riwayat pembayaran menyimpan cicilan dan pelunasan; pilih filter Semua piutang untuk melihat catatan lunas. Pembayaran invoice tetap dapat memakai beberapa metode.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-receipt-changes",
      title: "Memeriksa perubahan nota Sales",
      description: "Owner menerima pemberitahuan ketika Sales mengubah nota yang sudah diproses, termasuk DP dan Tempo, lalu dapat membandingkan setiap perubahan dengan nota asli. Pembayaran piutang oleh Sales juga tercatat.",
      icon: <History className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka perubahan nota", description: "Klik notifikasi perubahan nota, atau buka Riwayat, cari transaksi, lalu pilih menu tiga titik dan Riwayat perubahan nota.", icon: <History className="w-8 h-8" /> },
        { title: "Bandingkan versi", description: "Pilih revisi pada Jejak perubahan (Jejak versi di ponsel). Periksa Sales, waktu, selisih total, dan rincian Sebelum/Sesudah di Yang berubah. Buka Nota asli untuk rincian awal atau Versi lengkap untuk kedua nota. Riwayat mulai tercatat setelah fitur tersedia; nota pending dan draft tidak termasuk.", icon: <FileText className="w-8 h-8" /> },
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
      title: "Approval, Void, dan Hapus Transaksi",
      description: "Periksa transaksi pending atau gunakan Void dan Hapus dari menu tiga titik di Riwayat. Semua jenis transaksi, termasuk ATK, Percetakan, nota penawaran, dan transaksi dengan surat jalan, mengikuti izin akun serta statusnya. Owner mengatur Auto Approve Transaksi di Pengaturan > RBAC agar checkout role langsung final dan stok langsung berkurang.",
      icon: <ShieldCheck className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Filter Transaksi Pending", description: "Buka menu 'Riwayat' di sidebar kiri. Gunakan filter status 'Pending' pada bagian atas tabel (baris transaksi pending akan berwarna biru).", icon: <Search className="w-8 h-8" /> },
        { title: "Klik Aksi Approval", description: "Klik tombol 'Setujui' atau 'Tolak' langsung di sebelah kanan baris transaksi (atau melalui tombol titik tiga '...').", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Review dan sesuaikan barang", description: "Sebelum menyetujui nota sementara, Anda dapat menambah barang, mengubah jumlah, atau menghapus barang. Periksa harga modal, normal, Agen, Dinas, Harga Khusus, serta harga efektif; server menghitung ulang harga dan total saat disimpan.", icon: <Package className="w-8 h-8" /> },
        { title: "Tentukan metode & jumlah", description: "Pilih metode pembayaran aktual atau Tempo/Tagihan. Tempo terpisah dari DP, memerlukan pelanggan terdaftar, dan boleh dimulai tanpa pembayaran atau dengan cicilan awal yang dicatat memakai metode yang benar-benar diterima. Tanggal default memakai waktu server dalam WIB; Owner/Admin dapat mengubah tanggal atau jam invoice bila diperlukan.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Konfirmasi atau pilih Void/Hapus", description: "Setujui memfinalisasi transaksi dan mengurangi stok; Tolak nota yang belum final tidak mengubah stok. Void memerlukan transaction.update dan tersedia bagi role yang diberi izin, termasuk pada draft atau pending. Baca dampaknya lalu konfirmasi. Transaksi VOIDED/REFUNDED tidak dapat di-void ulang. Seluruh surat jalan PENDING/CONFIRMED terkait dibatalkan; CANCELLED/REJECTED tetap. Hapus memerlukan transaction.delete bagi role yang diberi izin; transaksi beserta seluruh surat jalan terkait dan itemnya ikut dihapus. Jurnal stok dan audit tetap tersimpan. Stok yang terbukti keluar dikembalikan paling banyak sekali; Hapus setelah Void tidak mengembalikannya lagi. Semua jenis transaksi, termasuk ATK, Percetakan, dan nota penawaran yang sudah atau belum menjadi invoice, tetap dapat dihapus bila riwayat stok kosong atau tidak konsisten. Peringatan tetap terlihat setelah berhasil dan tercatat di audit; stok yang tidak dapat dipastikan tidak dikembalikan. Pemeriksaan izin dan dampak keuangan tetap berlaku. Baca dampak seluruh dokumen pada konfirmasi sebelum melanjutkan.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-custom-invoice-date",
      title: "Mengubah Tanggal Invoice",
      description: "Owner dan Admin bisa mengatur tanggal bisnis invoice tanpa mengubah waktu audit sistem. Alasan perubahan tercatat di riwayat, lalu cetak ulang invoice final setelah nomor atau tanggal berubah.",
      icon: <History className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Riwayat", description: "Masuk ke menu 'Riwayat'. Tanggal utama di tabel adalah Tanggal Invoice, sedangkan label 'Dibuat' menunjukkan waktu record dibuat sistem. Gunakan filter Metode pembayaran untuk mencari transaksi; transaksi dengan beberapa metode berbeda memiliki badge Multi-payment.", icon: <History className="w-8 h-8" /> },
        { title: "Pilih Ubah Tanggal Invoice", description: "Klik menu titik tiga pada transaksi target, lalu pilih 'Ubah Tanggal Invoice'. Menu ini hanya muncul untuk Owner/Admin.", icon: <Settings className="w-8 h-8" /> },
        { title: "Isi Tanggal, Jam, dan Alasan", description: "Pilih tanggal invoice baru. Jam boleh dikosongkan agar sistem mempertahankan jam invoice sebelumnya. Tulis alasan perubahan sebelum menyimpan.", icon: <FileText className="w-8 h-8" /> },
        { title: "Cetak Ulang Invoice", description: "Setelah disimpan, nomor invoice/draft akan disesuaikan dengan tanggal baru. Buka detail transaksi untuk melihat timeline perubahan, lalu cetak ulang invoice final.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-export-reports",
      title: "Ekspor Laporan Keuangan (Excel & PDF)",
      description: "Unduh laporan bulanan Excel 8 sheet atau jurnal transaksi Excel/PDF. Saldo inventaris dan hutang tercatat diisi otomatis.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Laporan Keuangan", description: "Dari sidebar kiri, masuk ke menu 'Laporan Keuangan' (di bawah kategori Keuangan).", icon: <TrendingUp className="w-8 h-8" /> },
        { title: "Buka Menu Ekspor", description: "Di pojok kanan atas halaman, klik tombol 'Ekspor'.", icon: <FileText className="w-8 h-8" /> },
        { title: "Pilih bulan dan tahun", description: "Laporan bulanan · Excel 8 sheet menjadi pilihan awal. Pilih bulan dan tahun, lalu periksa rentang WIB dan daftar sheet; bulan berjalan memuat data sampai hari ini. Di RP bulan, hanya kategori Gaji/Mingguan masuk kolom Gaji / Mingguan. Kategori Gaji bawaan dan kategori lainnya masuk Nilai; rekap mengikuti pembagian yang sama dan total dihitung sekali. Setelah mengubah kategori di Keuangan, unduh ulang Excel.", icon: <Settings className="w-8 h-8" /> },
        { title: "Unduh laporan", description: "Klik Unduh Excel. Modal awal memakai inventaris bulan sebelumnya dan stok akhir memakai nilai periode. Stok negatif tidak dihitung; Stok bersama diurai dari satuan terbesar ke terkecil memakai HPP tiap satuan dan dihitung sekali. Produk dengan nama sama dalam satu toko, termasuk akhiran -new pada nama, otomatis dinilai sekali meskipun ID atau grup stoknya berbeda. Sumber saldo mengikuti perubahan stok nyata terakhir; edit harga tidak mengganti sumber dan saldo yang habis tetap nol. Angka, ukuran, dan model tetap dibedakan; akhiran -new pada SKU saja tidak menyatukan produk berbeda. HPP kosong dikonversi otomatis dari satuan terkecil yang memiliki HPP; seluruh HPP kosong atau riwayat HPP belum tersedia ditandai belum lengkap. RP bulan berisi pengeluaran manual. Pengeluaran Belanja memuat transfer pembelian berdasarkan tanggal pengeluaran, transfer belanja terdahulu berdasarkan tanggal pembayaran, dan giro berdasarkan bulan jatuh tempo. Piutang & Hutang memuat sisa giro serta hutang manual. Kas menghitung pembayaran aktual giro pada tanggal dibayar. Jika riwayat giro belum diketahui, nilai terkait belum lengkap. Buka PANDUAN untuk melihat alur dan rumus.", icon: <Download className="w-8 h-8" /> },
        { title: "Ekspor jurnal atau PDF", description: "Pilih Jurnal transaksi · Excel / PDF untuk memakai format dan periode Harian, Mingguan, 30 hari terakhir, atau Bulanan. Klik Unduh; jika gagal, gunakan Coba lagi dengan pilihan yang sama.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-expenses",
      title: "Mengelola Pengeluaran & Bukti Transaksi",
      description: "Catat semua biaya operasional toko di sini dan jangan lupa lampirkan foto struk belanjanya biar pembukuan rapi.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Menu Keuangan", description: "Dari sidebar kiri, buka menu 'Keuangan' (di bawah kategori Keuangan). Pada bagian Pengeluaran, pilih Filter kategori untuk menyaring daftar, atau Semua kategori untuk menampilkan semuanya. Jumlah dan grafik tetap mencakup seluruh bulan.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Periksa dan bayar giro", description: "Di Hutang Pemasok, buka Giro Pembelian. Giro lama berstatus Belum diketahui: pilih Periksa riwayat, hubungkan hutang manual yang sama bila ada, periksa pembayaran yang sudah tercatat, dan tambahkan pembayaran sebelumnya beserta tanggalnya. Centang bahwa riwayat pembayaran sudah lengkap lalu simpan. Untuk giro yang sudah diperiksa, pilih Catat pembayaran dan isi nominal serta tanggal pembayaran aktual; pembayaran boleh sebagian atau lunas. Jika hasil belum pasti, gunakan Pastikan pembayaran pada peramban dan akun yang sama. Jika data peramban terhapus, periksa riwayat sebelum mencatat lagi. Untuk giro yang sudah diperiksa, pilih Hubungkan hutang manual untuk hutang yang benar-benar sama dan bernominal sama. Periksa catatan kedua hutang, riwayat pembayaran, dan bukti; tentukan pembayaran yang sama atau transaksi berbeda untuk setiap pasangan yang cocok, lalu centang konfirmasi dan simpan. Pembayaran yang sama dihitung sekali dan catatan kedua hutang disimpan pada giro. Periksa pengeluaran manual agar pembayaran yang dipindahkan tidak tercatat dua kali dalam arus kas. Melihat memerlukan expense:read dan perubahan memerlukan expense:update.", icon: <History className="w-8 h-8" /> },
        { title: "Tambah Pengeluaran", description: "Klik tombol 'Tambah Pengeluaran' di bagian atas. Isi nama pemohon, pilih kategori, jumlah nominal, dan deskripsi tambahan. Untuk kategori baru, pilih Tambah kategori, isi namanya, lalu klik Simpan kategori. Kategori tersimpan dapat digunakan kembali dan dipilih di Filter kategori.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih & Putar Gambar Bukti", description: "Klik 'Pilih gambar bukti', lalu gunakan 'Putar kiri' atau 'Putar kanan' sampai orientasinya benar. Klik 'Unggah foto' untuk menyimpan hasilnya ke R2.", icon: <FileText className="w-8 h-8" /> },
        { title: "Fallback & Simpan", description: "Jika penyimpanan R2 gagal, input prnt.sc akan muncul sebagai fallback. Setelah bukti siap, klik 'Simpan'.", icon: <Settings className="w-8 h-8" /> },
        { title: "Kompresi & Hapus Foto", description: "Gambar otomatis dikompresi sebelum masuk R2. OWNER dapat memakai 'Hapus foto'; role lain memerlukan izin proof_upload:delete dari pengaturan RBAC. Foto R2 dihapus permanen, sedangkan prnt.sc hanya dikosongkan tautannya.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Tambah Pemasukan", description: "Pada Pemasukan tanpa transaksi, klik Tambah Pemasukan. Isi tanggal, keterangan / sumber, nominal, dan kategori RC: ATK, Cetak, Spanduk, Print, Stempel. Pilih satu atau beberapa metode pembayaran; jika lebih dari satu, isi setiap jumlah hingga sama dengan nominal. Simpan, lalu gunakan Ubah atau Hapus sesuai izin. Unduh ulang Excel agar RC memuat perubahan.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Tambah Belanja Transfer", description: "Klik Tambah Belanja Transfer pada Pengeluaran. Isi tanggal transfer, penerima / supplier, keterangan, dan nominal; bukti opsional. Simpan untuk mencatat keuangan tanpa menambah stok. Badge Belanja Transfer Manual menyediakan Ubah/Hapus sesuai izin. Unduh ulang Excel: catatan masuk PENGELUARAN BELANJA pada VIA TRANSFER dan dihitung sekali dalam RP.", icon: <FileSpreadsheet className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-shopping-request",
      title: "Membuat Daftar Belanja",
      description: "Buat daftar barang yang perlu dibeli, lengkap dengan supplier, foto produk, jumlah kebutuhan, dan catatan.",
      icon: <ShoppingCart className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Daftar Belanja", description: "Masuk ke menu Supplier lalu klik tab 'Daftar Belanja'. Kartu ringkasan menampilkan antrean aktif, total qty menunggu, jumlah yang sudah disetujui, dan rasio qty di-ACC. Pilih filter Transfer atau Giro; untuk Giro, isi tanggal jatuh tempo bila perlu. Tanggal yang tercatat tampil pada badge kartu. Klik Hapus filter untuk melihat semua daftar, atau Buat Daftar Belanja untuk membuat pengajuan baru.", icon: <Truck className="w-8 h-8" /> },
        { title: "Pilih atau Tambah Supplier", description: "Supplier tujuan wajib dipilih. Jika belum tersedia, gunakan tambah supplier cepat dengan mengisi nama dan tipe.", icon: <Settings className="w-8 h-8" /> },
        { title: "Tambah Produk", description: "Cari produk melalui nama atau SKU, lalu isi jumlah kebutuhan. Setelah barang masuk daftar, pilihan Satuan dapat diganti ke varian dalam grup stok yang sama. Angka jumlah tetap, misalnya 12 pcs menjadi 12 dus.", icon: <Package className="w-8 h-8" /> },
        { title: "Isi Kebutuhan & Simpan", description: "Nama default mengikuti nomor dokumen; Anda dapat menggantinya dengan nama unik di toko. Klik Simpan Daftar Belanja untuk mengajukan. Gunakan Tindakan lainnya untuk edit, batal, atau cetak. Harga beli ditetapkan saat persetujuan final; Pengeluaran dicatat saat penerimaan pertama yang berisi barang disetujui. Stok berubah saat penerimaan disetujui.", icon: <Settings className="w-8 h-8" /> },
        { title: "Hapus daftar dan periksa riwayat", description: "Dengan izin supplier.shopping_request.delete:delete, pilih Tindakan lainnya > Hapus daftar, periksa stok yang akan dikurangi, isi alasan, lalu konfirmasi. Stok dari penerimaan yang disetujui dikurangi; jika stok tidak cukup atau riwayatnya tidak dapat dipastikan, penghapusan ditolak. Pilih status Dibatalkan untuk melihat riwayat. Nama daftar bisa dipakai lagi. Pengeluaran dan pembayaran tetap tercatat; HPP dan harga jual tidak otomatis diubah.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-backdated-purchases",
      title: "Mencatat Belanja Terdahulu",
      description: "Catat pembelian bulan sebelumnya dan pantau pembayaran yang belum lunas tanpa mengubah stok.",
      icon: <ShoppingCart className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka formulir", description: "Buka Supplier > Daftar Belanja lalu pilih Catat Belanja Terdahulu. Pembuatan memerlukan izin supplier:create dan expense:create.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Isi pembelian", description: "Isi tanggal pembelian dari bulan sebelumnya, metode Giro atau Transfer, tanggal jatuh tempo, nomor Giro atau transaksi, dan nominal. Tambahkan nominal serta tanggal untuk setiap pembayaran yang sudah dilakukan, lalu simpan.", icon: <FileText className="w-8 h-8" /> },
        { title: "Catat pembayaran berikutnya", description: "Cari nomor atau gunakan filter jenis catatan dan status pembayaran. Buka Riwayat pembayaran, isi nominal dan tanggal, lalu simpan. Pencatatan pembayaran memerlukan izin expense:update.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Pahami pengeluaran", description: "Pembayaran pada atau sebelum jatuh tempo masuk ke Keuangan pada tanggal pembayaran. Sisa tagihan pada tanggal jatuh tempo masuk otomatis; pembayaran setelahnya mengurangi tagihan tanpa mencatat pengeluaran dua kali.", icon: <ShieldCheck className="w-8 h-8" /> },
      ],
    },
    {
      id: "owner-categories",
      title: "Mengelola Kategori dan Memindahkan Produk",
      description: "Tambah atau ubah kategori sekaligus, pindahkan produk pilihan, dan tinjau dampak penghapusan kategori terhadap seluruh toko serta harga pelanggan.",
      icon: <Tag className="w-5 h-5 text-brand-600" />,
      steps: CATEGORY_HELP_STEPS,
    },
    {
      id: "owner-change-price",
      title: "Mengubah Harga Produk & HPP",
      description: "Ubah harga jual produk, harga modal (HPP), Harga Dinas, dan Harga Agen dengan gampang lewat form edit di menu ini.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Tab Produk", description: "Masuk ke menu 'Produk' di sidebar, pastikan Anda berada di tab 'Produk'. Gunakan Sebelumnya atau Berikutnya di atas maupun bawah daftar untuk berpindah halaman. Setelah menggulir satu layar, tombol Kembali ke atas (panah ke atas) muncul di kanan bawah untuk kembali dengan mulus; gerakannya mengikuti pengaturan perangkat. Nilai inventaris memakai HPP tiap satuan aktif. Stok bersama diurai dari satuan terbesar ke terkecil dan setiap bagian dihitung sekali. Produk dengan nama sama dalam satu toko, termasuk akhiran -new pada nama, otomatis dinilai sekali meskipun ID atau grup stoknya berbeda. Sumber saldo mengikuti perubahan stok nyata terakhir; edit harga tidak mengganti sumber dan saldo yang habis tetap nol. Angka, ukuran, dan model tetap dibedakan; akhiran -new pada SKU saja tidak menyatukan produk berbeda. HPP kosong dihitung otomatis melalui konversi dari satuan terkecil yang memiliki HPP. Jika seluruh HPP kosong, nilainya ditandai belum lengkap. Riwayat HPP yang belum tersedia tetap kosong, bukan nol.", icon: <Package className="w-8 h-8" /> },
        { title: "Atur Harga Grup", description: "Klik Ubah Harga atau Edit pada produk, lalu Atur harga grup / Manual. Periksa Sumber harga: harga jual dan HPP sumber menjadi acuan pengikut Auto; gunakan diskon/markup untuk harga jual pengikut atau pilih Manual untuk mengisi sendiri. Klik Pratinjau harga, periksa dampak seluruh satuan, lalu Terapkan harga grup.", icon: <Settings className="w-8 h-8" /> },
        { title: "Harga Agen, Dinas & Transaksi", description: "Harga Agen dan Dinas mengikuti harga jual secara default, termasuk saat harga grup berubah. Isi manual untuk harga tetap produk/satuan ini; harga ini ditandai badge Harga manual. Klik Ikuti harga jual atau kosongkan kolom, lalu Simpan Harga, untuk kembali otomatis. Harga manual lama tetap ada. Untuk diskon atau tambahan otomatis, Owner memakai Atur diskon / tambahan menuju Produk > Harga Khusus; pengguna lain meminta Owner mengaturnya. Di POS, harga custom nota hanya berlaku untuk transaksi tersebut; harga grup tidak mengubah harga transaksi yang sudah ada di keranjang. Jika data grup berubah, buat pratinjau baru sebelum menerapkan.", icon: <FileText className="w-8 h-8" /> },
        { title: "Pantau Riwayat", description: "Buka tab 'Riwayat Harga' di bagian atas halaman untuk memantau grafik dan log perubahan harga barang dari waktu ke waktu.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-change-stock-individual",
      title: "Mengubah Stok Individual Produk",
      description: "Ubah jumlah stok fisik untuk satu produk tertentu secara langsung melalui formulir edit produk.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Menu Produk", description: "Buka menu samping (sidebar) sebelah kiri layar Anda, masuk ke kategori 'Katalog', kemudian klik menu 'Produk' (ikon paket).", icon: <Package className="w-8 h-8" /> },
        { title: "Cari Produk", description: "Cari produk yang ingin diubah stoknya di dalam tabel daftar produk. Untuk mencari kemasan tertentu, klik 'Filter', lalu pilih 'Satuan', misalnya dus atau pcs. Pilihan satuan berasal dari semua produk aktif toko dan bisa digabung dengan pencarian, kategori, serta status stok. Saat satuan diganti, daftar kembali ke halaman pertama. Pilih 'Semua satuan' atau klik Reset untuk menghapus filter satuan.", icon: <Search className="w-8 h-8" /> },
        { title: "Klik Tombol Ubah Produk", description: "Klik tombol aksi 'Ubah Produk' (ikon pensil/edit) di kolom paling kanan untuk membuka modal edit produk.", icon: <Settings className="w-8 h-8" /> },
        { title: "Ubah Stok Saat Ini", description: "Pada form modal 'Ubah Produk' yang muncul, cari input 'Stok Saat Ini', lalu ketikkan jumlah stok terbaru yang Anda inginkan.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Simpan Perubahan", description: "Klik tombol 'Simpan Produk' di pojok kanan bawah modal untuk memperbarui stok produk secara langsung di sistem.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-update-stok-massal",
      title: "Update Stok",
      description: "Update satu produk atau banyak produk dari tombol Update Stok di halaman Inventaris. Pilihan massal sebelumnya dikenal sebagai Banyak Produk (Bulk). Thumbnail/foto produk tampil di pencarian, kartu pilihan, dan preview dengan foto produk/varian.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Update Stok", description: "Masuk ke menu 'Inventaris' di sidebar kiri, lalu klik tombol 'Update Stok' di sebelah tombol 'Input / Transaksi'.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Pilih Satu Produk (Single) / Banyak Produk (Massal) - Update Stok Massal", description: "Pilih 'Satu Produk (Single)' untuk update satu produk dengan tampilan ringkas, atau pilih 'Banyak Produk (Massal)' untuk membuka workflow Update Stok Massal yang sudah ada.", icon: <Settings className="w-8 h-8" /> },
        { title: "Cari Produk", description: "Di jalur Satu Produk, cari dan pilih satu produk. Di jalur Banyak Produk (Massal), gunakan kolom 'Cari produk' untuk menambahkan beberapa produk atau varian ke daftar. Thumbnail/foto produk muncul di hasil pencarian dan kartu pilihan agar barang mudah dicek.", icon: <Search className="w-8 h-8" /> },
        { title: "Atur Aksi & Jumlah", description: "Pilih aksi (Tambah stok, Kurangi stok, atau Set stok akhir) dan masukkan jumlah kuantitas stok yang baru.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih Mode Stok", description: "Pilih 'Stok Bersama' untuk membagikan perubahan stok ke seluruh varian dalam grup, atau 'Stok Produk Ini' untuk mengubah stok produk tersebut saja tanpa memengaruhi varian lain.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Cek Preview", description: "Pada Satu Produk, cek ringkasan sebelum dan sesudah. Pada Banyak Produk (Massal), perhatikan tabel preview dengan foto produk/varian dan pastikan tidak ada produk duplikat.", icon: <FileText className="w-8 h-8" /> },
        { title: "Ajukan Perubahan", description: "Ketik catatan jika diperlukan, lalu klik tombol 'Ajukan Update Stok'. Pengajuan akan dikirim ke Owner untuk disetujui (Status Pending) sebelum stok resmi diperbarui.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-special-pricing",
      title: "Mengatur Harga Grup Pelanggan (Harga Khusus)",
      description: "Buat aturan harga per kategori dan pelanggan. Pilih sumber HPP, lalu periksa laba dan margin setiap satuan sebelum menyimpan.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tambah Aturan", description: "Harga Khusus nonaktif secara default. Buka Produk > Harga Khusus; saat nonaktif Owner melihat daftar buram dan terkunci, lalu dapat memilih Buka Pengaturan, mengaktifkan fitur, dan Simpan pengaturan. Pengguna lain dapat menghubungi Owner. Saat nonaktif, aturan tidak diterapkan dan input Harga Khusus di pembayaran untuk pelanggan Industri/Pemerintah tidak tersedia. Harga Agen/Dinas di atas 0 dan Ubah Harga Nota tetap tersedia sesuai izin.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih Produk & Pelanggan", description: "Pilih kategori, lalu pilih Semua satuan agar diskon atau rumus modal berlaku untuk seluruh satuan dalam kategori tersebut, termasuk satuan yang ditambahkan nanti. Centang satu atau beberapa satuan untuk membatasi aturan. Centang satu atau beberapa tipe pelanggan, misalnya Umum dan Agen. Pilih Semua pelanggan jika aturan berlaku untuk setiap tipe.", icon: <Users className="w-8 h-8" /> },
        { title: "Pilih Cara Menghitung Harga", description: "Pilih Diskon rupiah, Diskon persen, HPP satuan terkecil + rupiah, HPP satuan terkecil + persen, atau HPP masing-masing satuan + persen − persen. Untuk tambahan 35% dari HPP setiap satuan, pilih metode terakhir, isi tambahan 35% dan potongan 0%; margin hasilnya 25,93%. Contoh dua persentase: Rp12.000/dus +10% lalu −5% menghasilkan Rp12.540/dus. Dua metode HPP satuan terkecil tetap tanpa konversi: Rp700/pcs + Rp4.000 menghasilkan Rp4.700/rim.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Periksa Contoh & Simpan", description: "Periksa harga aturan, HPP satuan, laba, dan margin pada contoh satuan yang tersedia. Harga di bawah HPP diberi peringatan merah; margin memakai HPP satuan jual meskipun sumber rumusnya satuan terkecil. Pratinjau menampilkan contoh hasil aturan ini; aturan yang lebih spesifik dapat diprioritaskan saat transaksi. Periksa juga aturan khusus pelanggan, termasuk Agen, dan aturan satuan seperti Rim. Buka Pengaturan tambahan untuk merek dan status aktif, lalu klik Simpan aturan setelah sesuai. Nonaktifkan menghentikan penerapan tanpa menghapus aturan; aktifkan kembali lewat Ubah. Jika sumber HPP belum tersedia, harga member atau normal tetap dipakai.", icon: <FileText className="w-8 h-8" /> },
        { title: "Periksa Referensi Harga", description: "Setiap baris produk menampilkan Harga Normal, Harga Agen, dan Harga Dinas. Harga Agen/Dinas yang kosong atau 0 mengikuti harga jual.", icon: <DollarSign className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-import-products",
      title: "Impor Massal Produk, Stok, & Kode Supplier",
      description: "Nggak perlu input manual satu-satu, kamu bisa langsung masukin banyak produk atau stok sekaligus pakai file Excel. Panduan ini juga dapat dicari dengan istilah lama Import Massal Produk.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Pilih Menu Import", description: "Di halaman Produk, klik tombol 'Import' (dropdown) di pojok kanan atas layar.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih Jenis Import", description: "Pilih 'Impor Produk Massal' untuk mengunggah katalog produk baru/lama, atau 'Impor Stok Massal' khusus untuk menyesuaikan stok gudang.", icon: <FileText className="w-8 h-8" /> },
        { title: "Impor Kode Supplier Massal", description: "Untuk menghubungkan produk dan supplier tanpa mengubah data produk lain, pilih 'Impor Kode Supplier Massal'. Unggah CSV/XLSX dengan kolom SKU dan Kode Supplier. Beberapa kode supplier dapat dipisahkan dengan koma; relasi supplier produk akan diganti sesuai isi berkas.", icon: <FileText className="w-8 h-8" /> },
        { title: "Unggah File Excel", description: "Pilih file .xlsx atau .csv, maksimal 5 MB. Impor produk memerlukan nama, SKU, harga, dan satuan; kategori opsional. Produk baru tanpa kategori masuk ke Tanpa Kategori, sedangkan produk lama tetap memakai kategorinya jika kolom kosong. Untuk produk dalam grup stok, ubah kategori grup melalui Produk sebelum mengimpor. Impor stok hanya memerlukan nama, satuan, dan stok; pilih produk di pratinjau jika beberapa produk cocok.", icon: <FileText className="w-8 h-8" /> },
        { title: "Mapping Harga Jual & HPP", description: "Petakan nama kolom Excel agar sesuai dengan kolom sistem, terutama Harga Jual dan HPP. Kolom opsional seperti Harga Agen, Harga Dinas, dan Kode Supplier bisa ikut diisi. Harga Agen/Dinas di atas 0 dari file diprioritaskan. Jika kolomnya tidak ada, kosong, atau bernilai 0, masing-masing mengikuti harga jual; pratinjau menampilkan alasan tersebut. Di preview, sistem otomatis memilih aksi untuk duplikat SKU yang sudah jelas sebagai varian dan memilih satu baris harga terbaik untuk konflik harga satuan yang sama. Jika mayoritas Harga Jual lebih rendah daripada HPP, sistem menghentikan import agar mapping bisa diperiksa kembali. Setelah dikonfirmasi, import berjalan di antrean background; jika muncul pesan antrean belum mulai, buka progress import lalu klik Coba Lagi.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-stock-group",
      title: "Mengatur Grup Stok (Stock Group)",
      description: "Gabungkan produk dengan kemasan/varian berbeda (misal Semen sak dan Semen eceran) biar mereka pakai satu stok fisik yang sama di gudang.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tujuan grup", description: "Di Pusat Produk, pilih minimal dua produk dengan satuan berbeda, lalu klik Buat atau gabungkan grup stok. Aksi memerlukan product.update dan inventory.update. Pilih Buat grup baru dan isi nama, atau Gabungkan ke grup yang ada lalu pilih Grup tujuan.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Satuan dan stok", description: "Untuk grup baru, pilih Sumber stok dan isi Konversi satuan. Stok bersama mengikuti sumber yang dipilih; stok semua produk tidak dijumlahkan karena satuan mewakili persediaan fisik yang sama. Saat menggabungkan, satuan acuan grup tujuan tetap dan stok mengikuti anggota acuan tersebut. Isi konversi satuan baru terhadap acuan, periksa anggota lama, dan perbaiki konflik satuan sebelum lanjut.", icon: <Settings className="w-8 h-8" /> },
        { title: "Tinjau dan simpan", description: "Periksa tujuan, sumber stok, konversi, perpindahan grup, serta stok sekarang dan setelah disimpan bagi semua anggota terdampak. Klik Buat grup stok atau Gabungkan ke grup stok sesuai tujuan. Kembali mempertahankan draft. Jika data berubah, muat ulang lalu tinjau kembali sebelum menyimpan.", icon: <Package className="w-8 h-8" /> },
        { title: "Ringkasan dan Tetapkan stok akhir", description: "Buka grup dari produk atau tab Aktivitas Grup. Di Ringkasan, Pohon persediaan menghubungkan akar Stok bersama ke setiap satuan lewat garis cabang. Setiap cabang menampilkan konversi terhadap satuan acuan, SKU, stok setara, dan harga jual; stok setara bukan stok tambahan. Gunakan Atur konversi, Atur harga, atau Tambah satuan sesuai izin. Di ponsel, cabang tersusun ke bawah. Tetapkan stok akhir memerlukan inventory.update dan menyimpan jumlah akhir secara langsung, bukan menambah jumlah dan bukan pengajuan persetujuan. Pilih satuan input dan tinjau dampak ke semua satuan sebelum menyimpan.", icon: <Settings className="w-8 h-8" /> },
        { title: "Satuan, Harga, Tambah satuan, dan Riwayat", description: "Satuan dan Harga memerlukan product.update. Tinjau perubahan satuan sebelum menyimpan; pilih Pertahankan stok bersama atau Ikuti stok satuan sumber. Pengaturan lanjutan tersedia bila diperlukan. Di Harga, HPP belum diisi berarti margin belum diketahui; gunakan Pratinjau harga lalu Terapkan harga grup. Tambah satuan memerlukan product.create dan menampilkan Stok dari grup tanpa menambah persediaan. Riwayat memuat aktivitas yang benar-benar tercatat dengan filter Semua aktivitas atau Perubahan konversi dan pagination.", icon: <History className="w-8 h-8" /> },
        { title: "Pilih sumber harga", description: "Buka grup > Harga dengan izin product.update. Pilih Sumber harga dari anggota aktif, lalu isi Harga jual sumber dan HPP sumber. Simpan perubahan detail produk, grup, atau satuan terlebih dahulu sebelum membuka aksi harga dari editor produk. Pengikut grup baru dan lama memakai Manual; harga jual dan HPP lama dipertahankan saat pengikut beralih ke Manual. Anggota nonaktif tetap tampil sebagai informasi dan hasil pratinjau.", icon: <Settings className="w-8 h-8" /> },
        { title: "Atur Auto atau Manual", description: "Auto mengikuti konversi dari sumber. Pilih tanpa penyesuaian, diskon, atau markup untuk harga jual; diskon jual tidak mengurangi HPP. Buka faktor eksak bila perlu. Manual memungkinkan harga jual dan HPP sendiri. Kembali ke Auto mempertahankan harga jual dengan menghitung faktor, lalu HPP mengikuti sumber. Satuan baru memakai Manual agar harga jual dan HPP dapat diisi sendiri. Pada produk baru dengan beberapa satuan, satuan terkecil menjadi sumber; pilih Auto pada pengikut bila ingin mengikuti sumber.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pratinjau lalu terapkan", description: "Klik Pratinjau harga. Sebelum dihitung, angka pengikut adalah harga tersimpan dengan status Belum dihitung. Periksa sebelum/sesudah harga jual, HPP, dan margin setiap satuan, lalu klik Terapkan harga grup. Mengubah draf membatalkan pratinjau; hitung lagi. Jika data berubah, muat ulang data terbaru dan tinjau ulang draf sebelum menerapkan. Perlu ditinjau menjelaskan sumber nonaktif/tidak tersedia, konversi, faktor saat sumber nol, atau HPP yang belum diisi; perbaiki bidang terkait. HPP kosong tidak sama dengan nol. Sumber jual nol dengan faktor valid menghasilkan nol dan mempertahankan faktor; tanpa faktor, harga lama dipertahankan sampai diperbaiki.", icon: <Settings className="w-8 h-8" /> },
        { title: "Contoh Snowman V5", description: "Jika pengikut dipilih Auto, beli 10 pak, 1 pak = 12 pcs: masukkan stok 120 pcs memakai HPP pcs. Dengan HPP pcs Rp2.000 dan harga jual pcs Rp3.000, HPP pak Rp24.000. Harga pak lama Rp32.400 menyimpan faktor 9/10 (diskon 10%). Saat harga pcs menjadi Rp3.500, harga pak Rp37.800; HPP tetap Rp24.000. HPP Unit pada Penerimaan Barang yang disetujui memperbarui harga produk sesuai satuan dan aturan grup. Hanya perubahan HPP master nyata memproyeksikan ulang grup; jika penulisan HPP pengikut Auto ditolak, ubah sumber atau pilih Manual terlebih dahulu.", icon: <Settings className="w-8 h-8" /> },
        { title: "Ajukan perubahan stok di Inventori", description: "Buka Inventaris > Update Stok > Banyak Produk (Massal), lalu gunakan Cari produk. Stok Bersama menghitung dampak semua satuan; pilih satu produk saja per grup stok. Stok Produk Ini hanya membuat log produk tersebut tanpa mengubah stok grup. Semua pengajuan di Inventori, termasuk Set stok akhir, menunggu persetujuan owner (approval).", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "owner-database-reset",
      title: "Reset Database",
      description: "Reset Database hanya untuk Owner dan berlaku pada toko yang sedang login. Pilih kategori atau sub-data tertentu, misalnya hanya Riwayat Harga tanpa menghapus produk, stok, atau harga saat ini.",
      icon: <Database className="w-5 h-5 text-danger-600" />,
      steps: [
        { title: "Buka Tab Reset Database", description: "Masuk ke Pengaturan lalu pilih tab Reset Database. Tab ini hanya terlihat oleh Owner.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih Kategori atau Sub-data", description: "Centang kategori untuk memilih semua sub-data, atau centang sub-data satu per satu. Tanda sebagian menunjukkan beberapa sub-data dipilih. Pilih Semua mencentang semuanya; Hapus Semua Pilihan mengosongkan pilihan. Untuk menghapus riwayat harga saja, centang hanya Katalog Produk > Riwayat Harga.", icon: <Database className="w-8 h-8" /> },
        { title: "Review Dampak", description: "Klik Lihat Dampak Reset. Periksa jumlah data dan ikon kunci untuk data terkait yang wajib ikut terhapus. Pilih sub-data yang diwajibkan bila ada dependensi. Jika Transaksi Penjualan terhubung ke nota, pilih juga Penjualan & Keuangan > Nota Percetakan. Memilih Nota Percetakan saja mempertahankan transaksi; urutan nomor nota tetap berlanjut. Pelanggan dengan piutang manual tetap dilindungi. Pengeluaran yang terhubung ke giro atau belanja terdahulu, termasuk giro yang belum memiliki catatan hutang, serta pembelian yang terhubung ke catatan hutang yang dilindungi, tidak dapat di-reset. Mengubah pilihan membatalkan preview dan teks konfirmasi; lihat dampak lagi. Kategori global, akun pengguna, pengaturan toko, RBAC, dan chat assistant tetap dipertahankan.", icon: <FileText className="w-8 h-8" /> },
        { title: "Pastikan Operasional Aman", description: "Tutup shift kasir dan tunggu proses import atau batch selesai. Reset tidak berjalan jika masih ada proses aktif.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Konfirmasi dengan Phrase", description: "Baca preview sekali lagi, lalu ketik RESET DATABASE persis. Reset bersifat irreversible, tidak ada seed otomatis, dan jika gagal semua perubahan di-rollback.", icon: <AlertTriangle className="w-8 h-8" /> },
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
      id: "admin-categories",
      title: "Mengelola Kategori dan Memindahkan Produk",
      description: "Kelola kategori sesuai izin. Penghapusan yang melibatkan aturan harga atau pemindahan produk lintas toko perlu dilakukan oleh Owner.",
      icon: <Tag className="w-5 h-5 text-brand-600" />,
      steps: CATEGORY_HELP_STEPS,
    },
    {
      id: "admin-products",
      title: "Kelola Produk",
      description: "Tempat buat kelola semua barang di tokomu. Kamu bisa tambah produk baru, pasang harga jual, dan atur variannya biar siap dijual kasir.",
      icon: <Package className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Produk", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Katalog', kemudian klik menu 'Produk' (ikon paket).", icon: <Package className="w-8 h-8" /> },
        { title: "Tambah Produk Baru", description: "Klik '+ Tambah Produk' di pojok kanan atas. Isi Nama Produk, Kategori, Merek bila ada, Harga Jual, Harga Modal (HPP), Stok Awal, SKU, dan foto produk. Klik 'Tambah unit lain (opsional)' untuk satuan lain, lalu isi konversi seperti 1 dus = 12 pcs. Satuan terkecil menjadi Sumber harga. Satuan pengikut memakai Manual agar harga jual dan HPP dapat diisi sendiri. Buka Detail tambahan untuk SKU, barcode, mode Auto/Manual, dan penyesuaian diskon atau markup harga jual. Pilih Auto bila ingin mengikuti sumber serta konversi. Diskon jual tidak mengurangi HPP. Badge Unit kecil dan Unit besar mengikuti konversi. Masukkan stok awal sekali dalam unit utama; semua unit memakai stok bersama setelah disimpan. Foto yang diunggah disimpan di Cloudflare R2. Setelah lengkap, klik 'Simpan'. Jika merek belum ada, ketik nama merek baru lalu klik Tambah.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Ubah Data Produk", description: "Cari produk di tabel, lalu klik ikon Edit. Isi Deskripsi produk bila perlu, atau kosongkan untuk menghapusnya. Deskripsi juga tersedia saat menambah produk. Di daftar Produk dan kartu POS, deskripsi tampil maksimal dua baris; arahkan kursor, fokuskan dengan keyboard, atau ketuk untuk membaca teks lengkap dalam balon. Tekan Escape untuk menutupnya. Di tampilan grid, tabel, dan daftar ponsel halaman Produk, setiap satuan memiliki badge berwarna berbeda yang menampilkan stoknya, misalnya 32 dus 6 pcs atau 65 pak. Stok kosong tetap tampil, misalnya 0 dus. Konversi seperti 1 dus = 12 pcs tampil di bawah badge jika datanya valid dan satuannya berbeda dari satuan dasar. Sesuaikan Merek, Harga Agen, atau Harga Dinas bila perlu, lalu klik Simpan.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-suppliers",
      title: "Kelola Pemasok (Supplier)",
      description: "Catat kode unik, alamat, dan nomor kontak supplier-mu di sini biar gampang saat mau pesan barang atau cek riwayat belanja toko.",
      icon: <Truck className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Menu Supplier", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Katalog', lalu klik menu 'Supplier' (ikon truk).", icon: <Truck className="w-8 h-8" /> },
        { title: "Buka Form Tambah", description: "Klik tombol hitam '+ Tambah Supplier' di pojok kanan atas halaman untuk memunculkan form input data.", icon: <FileText className="w-8 h-8" /> },
        { title: "Simpan Data Supplier", description: "Ketik Kode Supplier unik seperti SP0001, Nama Perusahaan Supplier, Contact Person (PIC), No WhatsApp, dan Alamat lengkap, lalu klik tombol 'Simpan' di pojok kanan bawah modal.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-crm",
      title: "Kelola Data Pelanggan (CRM)",
      description: "Catat profil dan pantau piutang pelanggan. Pelanggan dengan riwayat piutang manual tidak dapat dihapus, termasuk yang sudah lunas, agar catatan pembayaran tetap tersimpan.",
      icon: <Users className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Pelanggan", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Pelanggan', lalu klik menu 'Pelanggan' (ikon kontak).", icon: <Users className="w-8 h-8" /> },
        { title: "Input Data Pelanggan", description: "Klik tombol hitam '+ Pelanggan Baru' di kanan atas tabel. Isi form pop-up Nama lengkap, No Handphone, dan Alamat, kemudian klik tombol 'Simpan'.", icon: <FileText className="w-8 h-8" /> },
        { title: "Kelola Piutang Manual", description: "Buka detail pelanggan > Piutang Manual > Tambah Piutang. Piutang manual untuk utang lama atau tagihan di luar kasir tidak menambah penjualan, order, atau mengubah stok. Isi nominal lebih dari nol, tanggal utang paling lambat hari ini dalam WIB, tanggal jatuh tempo sama atau setelah tanggal utang, dan catatan bila perlu, lalu Simpan Piutang. Pelanggan mengikuti profil yang dibuka. Untuk cicilan atau pelunasan, klik Bayar Piutang Manual dari detail atau tab Piutang, isi nominal maksimal sisa piutang, pilih satu metode, lalu Simpan Pembayaran. Buka Riwayat pembayaran; filter Semua piutang tetap menampilkan catatan lunas. Melihat memerlukan customer.read, sedangkan menambah dan membayar memerlukan customer.update.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-expenses",
      title: "Mengelola Pengeluaran & Bukti Transaksi",
      description: "Catat semua pengeluaran operasional toko di sini dan jangan lupa lampirkan foto struk belanjanya biar pembukuan rapi.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Halaman Keuangan", description: "Buka menu 'Keuangan' di sidebar kiri. Pada bagian Pengeluaran, pilih Filter kategori untuk menyaring daftar, atau Semua kategori untuk menampilkan semuanya. Jumlah dan grafik tetap mencakup seluruh bulan. Untuk mencatat biaya, klik tombol 'Tambah Pengeluaran' di bagian atas.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Periksa dan bayar giro", description: "Di Hutang Pemasok, buka Giro Pembelian. Giro lama berstatus Belum diketahui: pilih Periksa riwayat, hubungkan hutang manual yang sama bila ada, periksa pembayaran yang sudah tercatat, dan tambahkan pembayaran sebelumnya beserta tanggalnya. Centang bahwa riwayat pembayaran sudah lengkap lalu simpan. Untuk giro yang sudah diperiksa, pilih Catat pembayaran dan isi nominal serta tanggal pembayaran aktual; pembayaran boleh sebagian atau lunas. Jika hasil belum pasti, gunakan Pastikan pembayaran pada peramban dan akun yang sama. Jika data peramban terhapus, periksa riwayat sebelum mencatat lagi. Untuk giro yang sudah diperiksa, pilih Hubungkan hutang manual untuk hutang yang benar-benar sama dan bernominal sama. Periksa catatan kedua hutang, riwayat pembayaran, dan bukti; tentukan pembayaran yang sama atau transaksi berbeda untuk setiap pasangan yang cocok, lalu centang konfirmasi dan simpan. Pembayaran yang sama dihitung sekali dan catatan kedua hutang disimpan pada giro. Periksa pengeluaran manual agar pembayaran yang dipindahkan tidak tercatat dua kali dalam arus kas. Melihat memerlukan expense:read dan perubahan memerlukan expense:update.", icon: <History className="w-8 h-8" /> },
        { title: "Isi Data Pengeluaran", description: "Ketik nama pemohon, pilih kategori pengeluaran, masukkan jumlah nominal, dan keterangan pengeluaran. Untuk kategori baru, pilih Tambah kategori, isi namanya, lalu klik Simpan kategori. Kategori tersimpan dapat dipilih kembali dan digunakan di Filter kategori. Pilih Gaji/Mingguan agar nominal masuk kolom Gaji / Mingguan di RP bulan; kategori Gaji bawaan dan kategori lain masuk Nilai. Simpan perubahan lalu unduh ulang Excel untuk memperbarui laporan.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih & Putar Gambar Bukti", description: "Klik 'Pilih gambar bukti', atur orientasi dengan 'Putar kiri' atau 'Putar kanan', lalu klik 'Unggah foto' untuk menyimpannya ke R2.", icon: <FileText className="w-8 h-8" /> },
        { title: "Fallback & Simpan", description: "Periksa pratinjau. Jika R2 gagal, gunakan input prnt.sc yang muncul, lalu klik 'Simpan'.", icon: <Settings className="w-8 h-8" /> },
        { title: "Kenali Badge Sumber", description: "Badge Manual berasal dari form pengeluaran. Badge Pembelian Barang dibuat otomatis setelah seluruh produknya disetujui dan tidak dapat diedit atau dihapus dari halaman Keuangan. Badge Daftar Belanja (Legacy) hanya menandai data lama.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Tambah Pemasukan", description: "Pada Pemasukan tanpa transaksi, klik Tambah Pemasukan. Isi tanggal, keterangan / sumber, nominal, dan kategori RC. Pilih satu atau beberapa metode pembayaran dan pastikan jumlahnya sama dengan nominal. Simpan, lalu gunakan Ubah/Hapus sesuai izin. Unduh ulang Excel agar RC memuat data terbaru.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Tambah Belanja Transfer", description: "Klik Tambah Belanja Transfer pada Pengeluaran. Isi tanggal transfer, penerima / supplier, keterangan, nominal, serta bukti opsional. Simpan tanpa menambah stok. Catatan dapat dikoreksi sesuai izin. Unduh ulang Excel untuk melihat PENGELUARAN BELANJA pada VIA TRANSFER; RP menghitung pengeluaran sekali.", icon: <FileSpreadsheet className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-custom-invoice-date",
      title: "Mengubah Tanggal Invoice",
      description: "Admin bisa mengatur tanggal bisnis invoice tanpa mengubah waktu audit sistem. Alasan perubahan tercatat di riwayat, lalu cetak ulang invoice final setelah nomor atau tanggal berubah.",
      icon: <History className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Riwayat", description: "Masuk ke menu 'Riwayat'. Tanggal utama di tabel adalah Tanggal Invoice, sedangkan label 'Dibuat' menunjukkan waktu record dibuat sistem. Gunakan filter Metode pembayaran untuk mencari transaksi; transaksi dengan beberapa metode berbeda memiliki badge Multi-payment.", icon: <History className="w-8 h-8" /> },
        { title: "Pilih Ubah Tanggal Invoice", description: "Klik menu titik tiga pada transaksi target, lalu pilih 'Ubah Tanggal Invoice'. Menu ini hanya muncul untuk Owner/Admin.", icon: <Settings className="w-8 h-8" /> },
        { title: "Isi Tanggal, Jam, dan Alasan", description: "Pilih tanggal invoice baru. Jam boleh dikosongkan agar sistem mempertahankan jam invoice sebelumnya. Tulis alasan perubahan sebelum menyimpan.", icon: <FileText className="w-8 h-8" /> },
        { title: "Cetak Ulang Invoice", description: "Setelah disimpan, nomor invoice/draft akan disesuaikan dengan tanggal baru. Buka detail transaksi untuk melihat timeline perubahan, lalu cetak ulang invoice final.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-export-reports",
      title: "Ekspor Laporan Keuangan (Excel & PDF)",
      description: "Unduh laporan bulanan Excel 8 sheet atau jurnal transaksi Excel/PDF. Saldo inventaris dan hutang tercatat diisi otomatis.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Laporan Keuangan", description: "Dari sidebar kiri, masuk ke menu 'Laporan Keuangan' (di bawah kategori Keuangan).", icon: <TrendingUp className="w-8 h-8" /> },
        { title: "Buka Menu Ekspor", description: "Di pojok kanan atas halaman, klik tombol 'Ekspor'.", icon: <FileText className="w-8 h-8" /> },
        { title: "Pilih bulan dan tahun", description: "Laporan bulanan · Excel 8 sheet menjadi pilihan awal. Pilih bulan dan tahun, lalu periksa rentang WIB dan daftar sheet; bulan berjalan memuat data sampai hari ini. Di RP bulan, hanya kategori Gaji/Mingguan masuk kolom Gaji / Mingguan. Kategori Gaji bawaan dan kategori lainnya masuk Nilai; rekap mengikuti pembagian yang sama dan total dihitung sekali. Setelah mengubah kategori di Keuangan, unduh ulang Excel.", icon: <Settings className="w-8 h-8" /> },
        { title: "Periksa KPI Biaya", description: "KPI Pengeluaran menjumlahkan entri manual dan Pembelian Barang. Laba Bersih (Estimasi) adalah Laba Kotor dikurangi seluruh pengeluaran dan bukan laporan laba akrual formal.", icon: <TrendingUp className="w-8 h-8" /> },
        { title: "Unduh laporan", description: "Klik Unduh Excel. Modal awal memakai inventaris bulan sebelumnya dan stok akhir memakai nilai periode. Stok negatif tidak dihitung; Stok bersama diurai dari satuan terbesar ke terkecil memakai HPP tiap satuan dan dihitung sekali. Produk dengan nama sama dalam satu toko, termasuk akhiran -new pada nama, otomatis dinilai sekali meskipun ID atau grup stoknya berbeda. Sumber saldo mengikuti perubahan stok nyata terakhir; edit harga tidak mengganti sumber dan saldo yang habis tetap nol. Angka, ukuran, dan model tetap dibedakan; akhiran -new pada SKU saja tidak menyatukan produk berbeda. HPP kosong dikonversi otomatis dari satuan terkecil yang memiliki HPP; seluruh HPP kosong atau riwayat HPP belum tersedia ditandai belum lengkap. RP bulan berisi pengeluaran manual. Pengeluaran Belanja memuat transfer pembelian berdasarkan tanggal pengeluaran, transfer belanja terdahulu berdasarkan tanggal pembayaran, dan giro berdasarkan bulan jatuh tempo. Piutang & Hutang memuat sisa giro serta hutang manual. Kas menghitung pembayaran aktual giro pada tanggal dibayar. Jika riwayat giro belum diketahui, nilai terkait belum lengkap. Buka PANDUAN untuk melihat alur dan rumus.", icon: <Download className="w-8 h-8" /> },
        { title: "Ekspor jurnal atau PDF", description: "Pilih Jurnal transaksi · Excel / PDF untuk memakai format dan periode Harian, Mingguan, 30 hari terakhir, atau Bulanan. Klik Unduh; jika gagal, gunakan Coba lagi dengan pilihan yang sama.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-export-customer-recap",
      title: "Ekspor Rekap Pelanggan per Tipe",
      description: "Unduh rekap pelanggan berdasarkan tipe Agen, Umum, Pemerintah, dan Industri dalam format Excel atau PDF, lengkap dengan Top 10 Produk dan analisis AI.",
      icon: <FileSpreadsheet className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Pelanggan", description: "Masuk ke menu 'Pelanggan' di sidebar, lalu buka bagian 'Rekap Pelanggan'. Bagian ini tertutup saat pertama dibuka; klik 'Buka' untuk menampilkan ringkasan. Pilihan buka atau tutup akan diingat di browser ini.", icon: <Users className="w-8 h-8" /> },
        { title: "Klik Ekspor", description: "Klik tombol 'Ekspor' pada header Rekap Pelanggan.", icon: <Download className="w-8 h-8" /> },
        { title: "Pilih Periode", description: "Pilih Harian, Mingguan, Bulanan, atau Tahunan. Mingguan memakai periode Senin sampai hari ini.", icon: <History className="w-8 h-8" /> },
        { title: "Pilih Format", description: "Pilih Excel (.xlsx) untuk mendapatkan sheet Agen, Umum, Pemerintah, Industri, dan Ringkasan, atau pilih PDF untuk dokumen dengan section per tipe dan halaman ringkasan terakhir.", icon: <FileSpreadsheet className="w-8 h-8" /> },
        { title: "Baca Ringkasan", description: "Periksa tabel pelanggan, Produk Favorit, Top 10 Produk per tipe, dan Analisis AI pada Ringkasan. Jika analisis AI tidak tersedia, file tetap dapat digunakan.", icon: <Sparkles className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-shopping-request",
      title: "Membuat Daftar Belanja",
      description: "Buat daftar barang yang perlu dibeli, lengkap dengan supplier, foto produk, jumlah kebutuhan, dan catatan.",
      icon: <ShoppingCart className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Daftar Belanja", description: "Masuk ke menu Supplier lalu klik tab 'Daftar Belanja'. Kartu ringkasan menampilkan antrean aktif, total qty menunggu, jumlah yang sudah disetujui, dan rasio qty di-ACC. Pilih filter Transfer atau Giro; untuk Giro, isi tanggal jatuh tempo bila perlu. Tanggal yang tercatat tampil pada badge kartu. Klik Hapus filter untuk melihat semua daftar, atau Buat Daftar Belanja untuk membuat pengajuan baru.", icon: <Truck className="w-8 h-8" /> },
        { title: "Pilih atau Tambah Supplier", description: "Supplier tujuan wajib dipilih. Jika belum tersedia, gunakan tambah supplier cepat dengan mengisi nama dan tipe.", icon: <Settings className="w-8 h-8" /> },
        { title: "Tambah Produk", description: "Cari produk melalui nama atau SKU, lalu isi jumlah kebutuhan. Thumbnail, stok terkini, unit, dan grup membantu memastikan produk yang dipilih sudah tepat. Setelah barang masuk daftar, pilihan Satuan dapat diganti ke varian dalam grup stok yang sama. Angka jumlah tetap, misalnya 12 pcs menjadi 12 dus.", icon: <Package className="w-8 h-8" /> },
        { title: "Isi Kebutuhan & Simpan", description: "Nama default mengikuti nomor dokumen; Anda dapat menggantinya dengan nama unik di toko. Klik Simpan Daftar Belanja untuk mengajukan. Gunakan Tindakan lainnya untuk edit, batal, atau cetak; popup menutup setelah aksi berhasil. Di pratinjau struk, gunakan panah kiri dan kanan untuk melihat halaman ringkas dan lengkap satu per satu. Klik Cetak untuk mencetak keduanya pada halaman A4 terpisah. Harga beli ditetapkan saat persetujuan final; Pengeluaran dicatat saat penerimaan pertama yang berisi barang disetujui. Stok berubah saat penerimaan disetujui.", icon: <Settings className="w-8 h-8" /> },
        { title: "Hapus daftar dan periksa riwayat", description: "Dengan izin supplier.shopping_request.delete:delete, pilih Tindakan lainnya > Hapus daftar, periksa stok yang akan dikurangi, isi alasan, lalu konfirmasi. Stok dari penerimaan yang disetujui dikurangi; jika stok tidak cukup atau riwayatnya tidak dapat dipastikan, penghapusan ditolak. Pilih status Dibatalkan untuk melihat riwayat. Nama daftar bisa dipakai lagi. Pengeluaran dan pembayaran tetap tercatat; HPP dan harga jual tidak otomatis diubah.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-change-price",
      title: "Mengubah Harga Produk & HPP",
      description: "Ubah harga jual produk, harga modal (HPP), Harga Dinas, dan Harga Agen dengan gampang lewat form edit di menu ini.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Tab Produk", description: "Masuk ke menu 'Produk' di sidebar, pastikan Anda berada di tab 'Produk'. Gunakan Sebelumnya atau Berikutnya di atas maupun bawah daftar untuk berpindah halaman. Setelah menggulir satu layar, tombol Kembali ke atas (panah ke atas) muncul di kanan bawah untuk kembali dengan mulus; gerakannya mengikuti pengaturan perangkat. Nilai inventaris memakai HPP tiap satuan aktif. Stok bersama diurai dari satuan terbesar ke terkecil dan setiap bagian dihitung sekali. Produk dengan nama sama dalam satu toko, termasuk akhiran -new pada nama, otomatis dinilai sekali meskipun ID atau grup stoknya berbeda. Sumber saldo mengikuti perubahan stok nyata terakhir; edit harga tidak mengganti sumber dan saldo yang habis tetap nol. Angka, ukuran, dan model tetap dibedakan; akhiran -new pada SKU saja tidak menyatukan produk berbeda. HPP kosong dihitung otomatis melalui konversi dari satuan terkecil yang memiliki HPP. Jika seluruh HPP kosong, nilainya ditandai belum lengkap. Riwayat HPP yang belum tersedia tetap kosong, bukan nol.", icon: <Package className="w-8 h-8" /> },
        { title: "Atur Harga Grup", description: "Klik Ubah Harga atau Edit pada produk, lalu Atur harga grup / Manual. Periksa Sumber harga: harga jual dan HPP sumber menjadi acuan pengikut Auto; gunakan diskon/markup untuk harga jual pengikut atau pilih Manual untuk mengisi sendiri. Klik Pratinjau harga, periksa dampak seluruh satuan, lalu Terapkan harga grup.", icon: <Settings className="w-8 h-8" /> },
        { title: "Harga Agen, Dinas & Transaksi", description: "Harga Agen dan Dinas mengikuti harga jual secara default, termasuk saat harga grup berubah. Isi manual untuk harga tetap produk/satuan ini; harga ini ditandai badge Harga manual. Klik Ikuti harga jual atau kosongkan kolom, lalu Simpan Harga, untuk kembali otomatis. Harga manual lama tetap ada. Minta Owner mengatur diskon atau tambahan otomatis di Produk > Harga Khusus. Di POS, harga custom nota hanya berlaku untuk transaksi tersebut; harga grup tidak mengubah harga transaksi yang sudah ada di keranjang. Jika data grup berubah, buat pratinjau baru sebelum menerapkan.", icon: <FileText className="w-8 h-8" /> },
        { title: "Pantau Riwayat", description: "Buka tab 'Riwayat Harga' di bagian atas halaman untuk memantau grafik dan log perubahan harga barang dari waktu ke waktu.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-change-stock-individual",
      title: "Mengubah Stok Individual Produk",
      description: "Ubah jumlah stok fisik untuk satu produk tertentu secara langsung melalui formulir edit produk.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Menu Produk", description: "Buka menu samping (sidebar) sebelah kiri layar Anda, masuk ke kategori 'Katalog', kemudian klik menu 'Produk' (ikon paket).", icon: <Package className="w-8 h-8" /> },
        { title: "Cari Produk", description: "Cari produk yang ingin diubah stoknya di dalam tabel daftar produk. Untuk mencari kemasan tertentu, klik 'Filter', lalu pilih 'Satuan', misalnya dus atau pcs. Pilihan satuan berasal dari semua produk aktif toko dan bisa digabung dengan pencarian, kategori, serta status stok. Saat satuan diganti, daftar kembali ke halaman pertama. Pilih 'Semua satuan' atau klik Reset untuk menghapus filter satuan.", icon: <Search className="w-8 h-8" /> },
        { title: "Klik Tombol Ubah Produk", description: "Klik tombol aksi 'Ubah Produk' (ikon pensil/edit) di kolom paling kanan untuk membuka modal edit produk.", icon: <Settings className="w-8 h-8" /> },
        { title: "Ubah Stok Saat Ini", description: "Pada form modal 'Ubah Produk' yang muncul, cari input 'Stok Saat Ini', lalu ketikkan jumlah stok terbaru yang Anda inginkan.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Simpan Perubahan", description: "Klik tombol 'Simpan Produk' di pojok kanan bawah modal untuk memperbarui stok produk secara langsung di sistem.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-shopping-request-correction",
      title: "Koreksi Daftar Belanja",
      description: "Owner atau role yang diberi izin dapat mengubah daftar belanja setelah diproses, termasuk jumlah diterima, harga, barang, pembayaran, dan pilihan katalog.",
      icon: <History className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka koreksi", description: "Di Supplier > Daftar Belanja, buka Tindakan lainnya pada daftar yang sudah diproses lalu pilih Edit daftar. Arsip yang dibatalkan tetap terkunci.", icon: <Pencil className="w-8 h-8" /> },
        { title: "Tinjau dampak", description: "Ubah data yang diperlukan, masukkan alasan, lalu pilih Tinjau dampak. Periksa stok, total berdasarkan jumlah diterima, periode laporan, dan peringatan kelebihan pembayaran.", icon: <GitCompareArrows className="w-8 h-8" /> },
        { title: "Simpan dan cek riwayat", description: "Jika harga beli berubah, pilih HPP atau harga jual katalog secara terpisah. Simpan perubahan, lalu buka badge Diubah atau Stok berubah untuk melihat pelaku, alasan, dan nilai sebelum-sesudah.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-update-stok-massal",
      title: "Update Stok",
      description: "Update satu produk atau banyak produk dari tombol Update Stok di halaman Inventaris. Pilihan massal sebelumnya dikenal sebagai Banyak Produk (Bulk). Thumbnail/foto produk tampil di pencarian, kartu pilihan, dan preview dengan foto produk/varian.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Update Stok", description: "Masuk ke menu 'Inventaris' di sidebar kiri, lalu klik tombol 'Update Stok' di sebelah tombol 'Input / Transaksi'.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Pilih Satu Produk (Single) / Banyak Produk (Massal) - Update Stok Massal", description: "Pilih 'Satu Produk (Single)' untuk update satu produk dengan tampilan ringkas, atau pilih 'Banyak Produk (Massal)' untuk membuka workflow Update Stok Massal yang sudah ada.", icon: <Settings className="w-8 h-8" /> },
        { title: "Cari Produk", description: "Di jalur Satu Produk, cari dan pilih satu produk. Di jalur Banyak Produk (Massal), gunakan kolom 'Cari produk' untuk menambahkan beberapa produk atau varian ke daftar. Thumbnail/foto produk muncul di hasil pencarian dan kartu pilihan agar barang mudah dicek.", icon: <Search className="w-8 h-8" /> },
        { title: "Atur Aksi & Jumlah", description: "Pilih aksi (Tambah stok, Kurangi stok, atau Set stok akhir) dan masukkan jumlah kuantitas stok yang baru.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih Mode Stok", description: "Pilih 'Stok Bersama' untuk membagikan perubahan stok ke seluruh varian dalam grup, atau 'Stok Produk Ini' untuk mengubah stok produk tersebut saja tanpa memengaruhi varian lain.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Cek Preview", description: "Pada Satu Produk, cek ringkasan sebelum dan sesudah. Pada Banyak Produk (Massal), perhatikan tabel preview dengan foto produk/varian dan pastikan tidak ada produk duplikat.", icon: <FileText className="w-8 h-8" /> },
        { title: "Ajukan Perubahan", description: "Ketik catatan jika diperlukan, lalu klik tombol 'Ajukan Update Stok'. Pengajuan akan dikirim ke Owner untuk disetujui (Status Pending) sebelum stok resmi diperbarui.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-import-products",
      title: "Impor Massal Produk, Stok, & Kode Supplier",
      description: "Nggak perlu input manual satu-satu, kamu bisa langsung masukin banyak produk atau stok sekaligus pakai file Excel.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Pilih Menu Import", description: "Di halaman Produk, klik tombol 'Import' (dropdown) di pojok kanan atas layar.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih Jenis Import", description: "Pilih 'Impor Produk Massal' untuk mengunggah katalog produk baru/lama, atau 'Impor Stok Massal' khusus untuk menyesuaikan stok gudang.", icon: <FileText className="w-8 h-8" /> },
        { title: "Impor Kode Supplier Massal", description: "Pilih 'Impor Kode Supplier Massal' untuk memperbarui relasi supplier saja. Berkas wajib memiliki kolom SKU dan Kode Supplier; pisahkan beberapa kode supplier dengan koma, periksa pratinjau, lalu klik Terapkan Impor.", icon: <FileText className="w-8 h-8" /> },
        { title: "Unggah File Excel", description: "Pilih file .xlsx atau .csv, maksimal 5 MB. Impor produk memerlukan nama, SKU, harga, dan satuan; kategori opsional. Produk baru tanpa kategori masuk ke Tanpa Kategori, sedangkan produk lama tetap memakai kategorinya jika kolom kosong. Untuk produk dalam grup stok, ubah kategori grup melalui Produk sebelum mengimpor. Impor stok hanya memerlukan nama, satuan, dan stok; pilih produk di pratinjau jika beberapa produk cocok.", icon: <FileText className="w-8 h-8" /> },
        { title: "Mapping Harga Jual & HPP", description: "Petakan nama kolom Excel agar sesuai dengan kolom sistem, terutama Harga Jual dan HPP. Kolom opsional seperti Harga Agen, Harga Dinas, dan Kode Supplier bisa ikut diisi. Harga Agen/Dinas di atas 0 dari file diprioritaskan. Jika kolomnya tidak ada, kosong, atau bernilai 0, masing-masing mengikuti harga jual; pratinjau menampilkan alasan tersebut. Di preview, sistem otomatis memilih aksi untuk duplikat SKU yang sudah jelas sebagai varian dan memilih satu baris harga terbaik untuk konflik harga satuan yang sama. Jika mayoritas Harga Jual lebih rendah daripada HPP, sistem menghentikan import agar mapping bisa diperiksa kembali.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "admin-stock-group",
      title: "Mengatur Grup Stok (Stock Group)",
      description: "Gabungkan produk dengan kemasan/varian berbeda (misal Semen sak dan Semen eceran) biar mereka pakai satu stok fisik yang sama di gudang.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tujuan grup", description: "Di Pusat Produk, pilih minimal dua produk dengan satuan berbeda, lalu klik Buat atau gabungkan grup stok. Aksi memerlukan product.update dan inventory.update. Pilih Buat grup baru dan isi nama, atau Gabungkan ke grup yang ada lalu pilih Grup tujuan.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Satuan dan stok", description: "Untuk grup baru, pilih Sumber stok dan isi Konversi satuan. Stok bersama mengikuti sumber yang dipilih; stok semua produk tidak dijumlahkan karena satuan mewakili persediaan fisik yang sama. Saat menggabungkan, satuan acuan grup tujuan tetap dan stok mengikuti anggota acuan tersebut. Isi konversi satuan baru terhadap acuan, periksa anggota lama, dan perbaiki konflik satuan sebelum lanjut.", icon: <Settings className="w-8 h-8" /> },
        { title: "Tinjau dan simpan", description: "Periksa tujuan, sumber stok, konversi, perpindahan grup, serta stok sekarang dan setelah disimpan bagi semua anggota terdampak. Klik Buat grup stok atau Gabungkan ke grup stok sesuai tujuan. Kembali mempertahankan draft. Jika data berubah, muat ulang lalu tinjau kembali sebelum menyimpan.", icon: <Package className="w-8 h-8" /> },
        { title: "Ringkasan dan Tetapkan stok akhir", description: "Buka grup dari produk atau tab Aktivitas Grup. Di Ringkasan, Pohon persediaan menghubungkan akar Stok bersama ke setiap satuan lewat garis cabang. Setiap cabang menampilkan konversi terhadap satuan acuan, SKU, stok setara, dan harga jual; stok setara bukan stok tambahan. Gunakan Atur konversi, Atur harga, atau Tambah satuan sesuai izin. Di ponsel, cabang tersusun ke bawah. Tetapkan stok akhir memerlukan inventory.update dan menyimpan jumlah akhir secara langsung, bukan menambah jumlah dan bukan pengajuan persetujuan. Pilih satuan input dan tinjau dampak ke semua satuan sebelum menyimpan.", icon: <Settings className="w-8 h-8" /> },
        { title: "Satuan, Harga, Tambah satuan, dan Riwayat", description: "Satuan dan Harga memerlukan product.update. Tinjau perubahan satuan sebelum menyimpan; pilih Pertahankan stok bersama atau Ikuti stok satuan sumber. Pengaturan lanjutan tersedia bila diperlukan. Di Harga, HPP belum diisi berarti margin belum diketahui; gunakan Pratinjau harga lalu Terapkan harga grup. Tambah satuan memerlukan product.create dan menampilkan Stok dari grup tanpa menambah persediaan. Riwayat memuat aktivitas yang benar-benar tercatat dengan filter Semua aktivitas atau Perubahan konversi dan pagination.", icon: <History className="w-8 h-8" /> },
        { title: "Pilih sumber harga", description: "Buka grup > Harga dengan izin product.update. Pilih Sumber harga dari anggota aktif, lalu isi Harga jual sumber dan HPP sumber. Simpan perubahan detail produk, grup, atau satuan terlebih dahulu sebelum membuka aksi harga dari editor produk. Pengikut grup baru dan lama memakai Manual; harga jual dan HPP lama dipertahankan saat pengikut beralih ke Manual. Anggota nonaktif tetap tampil sebagai informasi dan hasil pratinjau.", icon: <Settings className="w-8 h-8" /> },
        { title: "Atur Auto atau Manual", description: "Auto mengikuti konversi dari sumber. Pilih tanpa penyesuaian, diskon, atau markup untuk harga jual; diskon jual tidak mengurangi HPP. Buka faktor eksak bila perlu. Manual memungkinkan harga jual dan HPP sendiri. Kembali ke Auto mempertahankan harga jual dengan menghitung faktor, lalu HPP mengikuti sumber. Satuan baru memakai Manual agar harga jual dan HPP dapat diisi sendiri. Pada produk baru dengan beberapa satuan, satuan terkecil menjadi sumber; pilih Auto pada pengikut bila ingin mengikuti sumber.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pratinjau lalu terapkan", description: "Klik Pratinjau harga. Sebelum dihitung, angka pengikut adalah harga tersimpan dengan status Belum dihitung. Periksa sebelum/sesudah harga jual, HPP, dan margin setiap satuan, lalu klik Terapkan harga grup. Mengubah draf membatalkan pratinjau; hitung lagi. Jika data berubah, muat ulang data terbaru dan tinjau ulang draf sebelum menerapkan. Perlu ditinjau menjelaskan sumber nonaktif/tidak tersedia, konversi, faktor saat sumber nol, atau HPP yang belum diisi; perbaiki bidang terkait. HPP kosong tidak sama dengan nol. Sumber jual nol dengan faktor valid menghasilkan nol dan mempertahankan faktor; tanpa faktor, harga lama dipertahankan sampai diperbaiki.", icon: <Settings className="w-8 h-8" /> },
        { title: "Contoh Snowman V5", description: "Jika pengikut dipilih Auto, beli 10 pak, 1 pak = 12 pcs: masukkan stok 120 pcs memakai HPP pcs. Dengan HPP pcs Rp2.000 dan harga jual pcs Rp3.000, HPP pak Rp24.000. Harga pak lama Rp32.400 menyimpan faktor 9/10 (diskon 10%). Saat harga pcs menjadi Rp3.500, harga pak Rp37.800; HPP tetap Rp24.000. HPP Unit pada Penerimaan Barang yang disetujui memperbarui harga produk sesuai satuan dan aturan grup. Hanya perubahan HPP master nyata memproyeksikan ulang grup; jika penulisan HPP pengikut Auto ditolak, ubah sumber atau pilih Manual terlebih dahulu.", icon: <Settings className="w-8 h-8" /> },
        { title: "Ajukan perubahan stok di Inventori", description: "Buka Inventaris > Update Stok > Banyak Produk (Massal), lalu gunakan Cari produk. Stok Bersama menghitung dampak semua satuan; pilih satu produk saja per grup stok. Stok Produk Ini hanya membuat log produk tersebut tanpa mengubah stok grup. Semua pengajuan di Inventori, termasuk Set stok akhir, menunggu persetujuan owner (approval).", icon: <ShieldCheck className="w-8 h-8" /> },
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
      id: "cashier-shift-settings",
      title: "Shift Dimatikan oleh Owner",
      description: "Jika Owner mematikan fitur shift, popup shift tidak akan muncul dan kamu bisa langsung memproses pembayaran. Setting ini dikontrol Owner dari Pengaturan.",
      icon: <Settings className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Cek Status POS", description: "Buka menu Kasir seperti biasa. Saat shift dimatikan, popup 'Belum Ada Shift Aktif' tidak akan muncul.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Proses Pembayaran", description: "Tambahkan produk ke keranjang dan klik 'Bayar' tanpa perlu membuka shift terlebih dahulu.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Hubungi Owner", description: "Jika popup shift masih muncul atau setting perlu diubah, hubungi Owner karena hanya Owner yang dapat mengatur mode shift.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "cashier-pos",
      title: "Memproses Penjualan (POS)",
      description: "Layar utama kasir untuk melayani pembeli. Kamu bisa cari barang, pasang diskon, dan cetak struk pembayaran dengan cepat. Pada nota biasa, isi Pajak (%) di modal Pembayaran setelah diskon. Total, Uang Pas, dan sisa tagihan langsung mengikuti pajak; tarif tersimpan bersama transaksi dan tampil di bagian atas nota serta PDF. Pada Cetak Nota Penawaran, isi PPN (%). DPP Nilai Lain dihitung 11/12 jumlah setelah diskon, lalu PPN dihitung dari DPP dan dicetak sebagai nominal rupiah. Tarif menerima 0–100% dengan maksimal dua desimal. Klik Simpan Pajak atau langsung cetak; pajak disimpan sebelum mencetak dan memperbarui total serta sisa tagihan.",
      icon: <ShoppingCart className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka POS Kasir", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Operasi', lalu klik menu 'Kasir' (POS - ikon kalkulator). Klik Ringkas panel untuk menyembunyikan status shift, pencarian, dan filter; klik Buka panel untuk menampilkannya kembali. Tarik pegangan di bawah panel untuk mengubah tingginya. Anda juga bisa fokus ke pegangan lalu memakai panah atas/bawah, Home, atau End. Klik Ukuran awal untuk mengembalikan tinggi otomatis. Pencarian dan filter tetap tersimpan saat panel diringkas.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Pilih produk dan satuan", description: "Cari produk atau pilih dari kartu. Badge di kanan kategori menampilkan stok satuan terpilih, misalnya 32 dus 6 pcs. Konversinya tampil di bawah badge, misalnya 1 dus = 12 pcs, jika datanya tersedia dan satuannya berbeda dari satuan dasar. Stok dan konversi mengikuti pilihan satuan Anda. Pilihan satuan kecil tampil di sebelah kiri dan satuan besar di sebelah kanan. Klik kartu produk untuk menambahkannya; di PC, panel keranjang otomatis terbuka, termasuk jika sebelumnya ditutup. Di ponsel, keranjang tidak terbuka otomatis; ketuk tombol Keranjang untuk membukanya. Produk dengan stok kosong tetap meminta konfirmasi sebelum ditambahkan. Anda juga dapat mengganti satuan langsung dari keranjang; jumlah angkanya tetap dan harga otomatis mengikuti satuan baru.", icon: <Package className="w-8 h-8" /> },
        { title: "Atur jumlah", description: "Ketik jumlah bulat lebih dari nol pada kolom kuantitas di keranjang, lalu tekan Enter atau keluar dari kolom; Anda juga bisa memakai tombol minus dan plus. Tombol plus tetap aktif saat stok kosong atau negatif. Jika jumlah dinaikkan melebihi stok, periksa popup Jumlah melebihi stok, lalu pilih Tetap Tambahkan untuk menerapkan jumlah atau Batal untuk mempertahankan jumlah sebelumnya. Stok bisa menjadi negatif saat transaksi diproses. Jumlah desimal belum dapat dipakai untuk produk dan layanan.", icon: <Package className="w-8 h-8" /> },
          { title: "Proses Pembayaran", description: "Klik tombol Bayar, lalu pilih pelanggan di modal Pembayaran. Harga dan total otomatis mengikuti tipe pelanggan serta satuan yang dipilih. Harga Agen/Dinas yang diatur diprioritaskan, lalu aturan Harga Khusus yang cocok, kemudian harga normal. Pilih metode pembayaran atau Tempo/Tagihan; Tempo memerlukan pelanggan dan menampilkan badge tersendiri. Tanggal dan jam langsung terisi saat form dibuka dalam WIB; Owner/Admin dapat mengubahnya. Simpan Faktur Sementara memakai nomor otomatis. Pengaturan No. Faktur tersedia di modal Cetak Nota Penawaran bersama data penerima: pengguna dengan izin edit draft dapat mengetik nomor custom atau memilih Gunakan otomatis. Nomor disimpan ke transaksi sebelum dicetak dan dipakai saat cetak ulang. Bila sumber waktu tidak tersedia, sistem memakai sinkronisasi terakhir atau jam server. Jika modal ditutup saat keranjang masih berisi barang, klik Bayar lagi untuk melanjutkan isian selama halaman Kasir tetap terbuka. Setelah checkout berhasil atau Faktur Sementara tersimpan, isian direset.", icon: <DollarSign className="w-8 h-8" /> },
      ]
    },
    {
      id: "cashier-pos-quick-edit",
      title: "Edit Cepat Produk di Keranjang POS",
      description: "Periksa produk dan gunakan harga custom untuk satu nota langsung dari keranjang sesuai izin akun Anda.",
      icon: <Tag className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Temukan Aksi di Kartu", description: "Tambahkan produk ke keranjang. Tombol Edit tersedia sesuai izin edit produk; tombol Harga tersedia sesuai izin Ubah harga di nota. Keduanya berada di bagian bawah kartu, di sebelah kiri pengatur jumlah.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Periksa Referensi Harga", description: "Setiap baris produk menampilkan Harga Normal, Harga Agen, dan Harga Dinas. Nilai yang belum tersedia ditandai 'Belum diatur'.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Ubah Harga Nota", description: "Klik Harga untuk membuka Ubah Harga Nota. Isi Harga custom per satuan, periksa harga otomatis, pembulatan dan subtotal item, lalu klik Terapkan harga. Harga ini hanya berlaku untuk nota tersebut dan tersedia meskipun Harga Khusus toko nonaktif. Untuk mengubah Nama, Kategori, dan Merek seluruh varian, gunakan Edit.", icon: <Package className="w-8 h-8" /> },
        { title: "Kenali dan Kembalikan Harga", description: "Badge amber Harga custom tampil di keranjang, pembayaran, dan detail riwayat. Harga tetap tersimpan pada draft dan transaksi; nota berikutnya kembali memakai harga otomatis. Buka Harga lalu klik Kembalikan harga otomatis untuk menghapus harga custom. Penanda tidak ikut dicetak pada nota atau PDF. Perubahan harga produk permanen dilakukan melalui halaman Produk.", icon: <ShoppingCart className="w-8 h-8" /> },
      ]
    },
    {
      id: "cashier-credit",
      title: "Menerima Pembayaran Cicilan / Piutang",
      description: "Kalau ada pelanggan yang bayar belanjaan secara tempo/nyicil, catat pembayaran cicilan atau pelunasannya lewat menu ini. Untuk transaksi berstatus DP, Riwayat menampilkan DP masuk dan Sisa di bawah total transaksi, baik di komputer maupun ponsel. DP masuk menunjukkan jumlah pembayaran yang sudah tercatat; Sisa menunjukkan tagihan yang belum dibayar.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Cari Faktur Tempo", description: "Buka menu samping (sidebar) sebelah kiri, masuk ke kategori 'Operasi', klik menu 'Riwayat' (ikon kartu dompet), lalu ketikkan nama pelanggan di kolom pencarian tabel.", icon: <Users className="w-8 h-8" /> },
        { title: "Proses Bayar Cicilan", description: "Klik baris transaksi pelanggan yang berstatus merah 'Belum Lunas'. Pada rincian transaksi di panel kanan, klik tombol 'Bayar Cicilan', ketik nominal uang cicilan yang dibayarkan, lalu klik 'Simpan'.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Cetak Bukti Pembayaran", description: "Setelah pembayaran tercatat berhasil, klik ikon printer ('Cetak Struk') di bagian pojok kanan atas detail transaksi untuk memberikan struk bukti cicilan.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "cashier-history-payment-amounts",
      title: "Membaca Nominal Pembayaran di Riwayat",
      description: "Setiap badge pembayaran di Riwayat menampilkan metode dan nominalnya, sehingga transaksi tunggal maupun multipayment dapat dicek tanpa membuka struk.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Riwayat Transaksi", description: "Masuk ke menu Operasi > Riwayat, lalu cari invoice atau pelanggan yang ingin diperiksa.", icon: <History className="w-8 h-8" /> },
        { title: "Baca badge pembayaran", description: "Pada kolom Pembayaran atau bagian bawah kartu transaksi, baca format metode dan nominal seperti QRIS · Rp 15.000 atau CASH · Rp 1.000.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Periksa multipayment", description: "Jika transaksi memiliki beberapa metode, setiap badge menampilkan nominalnya sendiri. Badge Multi-payment menandai transaksi dengan lebih dari satu metode.", icon: <FileText className="w-8 h-8" /> },
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
      title: "Menerapkan Diskon Item",
      description: "Atur diskon tiap item saat pembayaran, atau terapkan nominal/persen yang sama ke beberapa item. Diskon item tercatat di nota dan PDF.",
      icon: <TrendingUp className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Pembayaran", description: "Masukkan barang ke keranjang lalu klik Bayar. Pada daftar item di modal Pembayaran, klik Diskon di sebelah item yang ingin diberi potongan.", icon: <Package className="w-8 h-8" /> },
        { title: "Atur Diskon Item", description: "Pilih Rp atau %, isi nilai, lalu terapkan. Rp adalah potongan total baris: 3 barang × Rp10.000 dengan diskon Rp5.000 menjadi Rp25.000. Untuk beberapa item, centang baris yang diinginkan lalu klik Diskon ... item terpilih dan Terapkan diskon; nilainya dihitung untuk setiap baris dan menggantikan diskon sebelumnya.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Periksa dan Bayar", description: "Periksa subtotal item dan total pembayaran. Buka Diskon lagi untuk mengubah potongan, atau klik Hapus diskon untuk menghapusnya, lalu selesaikan pembayaran atau simpan draft. Nota biasa, nota penawaran, dan PDF menampilkan Diskon item di bawah nama barang.", icon: <ShoppingCart className="w-8 h-8" /> },
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
        { title: "Memeriksa Pending Transaksi", description: "Buka menu 'Riwayat' di sidebar kiri. Pada baris filter status di atas tabel, klik opsi 'Pending' untuk memfilter daftar transaksi yang membutuhkan persetujuan Anda. Gunakan filter Metode pembayaran untuk mencari transaksi berdasarkan metode yang tercatat; transaksi dengan beberapa metode berbeda memiliki badge Multi-payment.", icon: <Search className="w-8 h-8" /> },
        { title: "Menyetujui Pending Transaksi", description: "Pada baris transaksi pending yang sesuai, klik ikon titik tiga ('Aksi Lainnya') di ujung kanan, pilih 'Setujui', lalu pada modal yang muncul tentukan metode pembayaran dan jumlah bayar sebelum mengklik tombol hijau 'Setujui'.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Tutup Shift", description: "Di akhir hari, klik profil Anda di pojok kanan atas, klik 'Tutup Shift'. Hitung dan ketik nominal uang fisik di laci saat itu, lalu klik tombol merah 'Konfirmasi Akhiri Shift'.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "cashier-piutang-tab",
      title: "Mencatat Pembayaran Piutang (Tab Piutang)",
      description: "Catat cicilan atau pelunasan dari menu Pelanggan. Pelanggan dengan riwayat piutang manual tidak dapat dihapus, termasuk yang sudah lunas, agar catatan pembayaran tetap tersimpan.",
      icon: <DollarSign className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Halaman Pelanggan", description: "Buka menu Pelanggan, lalu tab Piutang. Piutang manual tampil di bagian Piutang Manual dan detail pelanggan. Melihat memerlukan customer.read, sedangkan menambah dan membayar memerlukan customer.update.", icon: <Users className="w-8 h-8" /> },
        { title: "Catat atau Pilih Piutang", description: "Untuk utang lama, buka detail pelanggan > Tambah Piutang; pelanggan mengikuti profil yang dibuka. Isi nominal lebih dari nol, tanggal utang paling lambat hari ini dalam WIB, tanggal jatuh tempo sama atau setelah tanggal utang, dan catatan bila perlu, lalu Simpan Piutang. Catatan ini tidak menambah penjualan, order, atau mengubah stok. Untuk membayar, pilih Bayar Piutang pada invoice atau Bayar Piutang Manual pada catatan manual.", icon: <Search className="w-8 h-8" /> },
        { title: "Pilih Metode Pembayaran", description: "Invoice dapat memakai satu atau beberapa metode pembayaran. Invoice DP Umum tanpa pelanggan terdaftar dapat langsung dicicil atau dilunasi tanpa memilih pelanggan; pembayaran tetap tercatat pada invoice. Piutang manual memakai satu metode per pembayaran: Tunai, Debit, Kartu Kredit, QRIS, atau Transfer. Isi nominal lebih dari nol, maksimal sisa piutang; pembayaran boleh sebagian atau lunas.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Selesaikan Pembayaran", description: "Tambahkan catatan bila perlu. Invoice memakai Proses Pembayaran; piutang manual memakai Simpan Pembayaran. Buka Riwayat pembayaran untuk memeriksa cicilan dan pelunasan manual; catatan lunas tetap tersedia melalui filter Semua piutang.", icon: <ShieldCheck className="w-8 h-8" /> },
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
        { title: "Pilih & Putar Gambar Bukti", description: "Klik 'Pilih gambar bukti', gunakan 'Putar kiri' atau 'Putar kanan' bila perlu, lalu klik 'Unggah foto' untuk menyimpan foto pembayaran ke R2.", icon: <FileText className="w-8 h-8" /> },
        { title: "Tambah & Simpan", description: "Periksa pratinjau dan klik '+ Tambah Gambar Lain' bila perlu. Jika R2 gagal, gunakan input prnt.sc yang muncul, lalu klik 'Simpan'.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    }
  ],
  SALES: [
    {
      id: "sales-daily-income",
      title: "Melihat Pemasukan Harian",
      description: "Sales dapat melihat uang diterima pada satu tanggal, rincian ATK, Percetakan, subkategori, metode pembayaran, dan Outstanding DP sesuai izin Owner.",
      icon: <TrendingUp className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Laporan Keuangan", description: "Masuk ke Laporan Keuangan. Sales melihat tampilan pemasukan harian dan tidak melihat laba, HPP, pengeluaran, produk terlaris, atau ekspor laporan.", icon: <TrendingUp className="w-8 h-8" /> },
        { title: "Pilih tanggal WIB", description: "Gunakan pemilih tanggal untuk melihat hari ini atau tanggal sebelumnya. Pembayaran awal/DP mengikuti tanggal nota yang tersimpan, sehingga nota yang dipindah ke tanggal lain tidak masuk pemasukan hari ini. Pelunasan nota lama tetap masuk pada hari pembayaran.", icon: <History className="w-8 h-8" /> },
        { title: "Baca rincian pemasukan", description: "Periksa total pemasukan, Outstanding DP, kategori ATK dan Percetakan, subkategori, serta metode pembayaran. Outstanding DP memakai sisa pembayaran terkini dari nota DP hingga tanggal pilihan, bukan saldo historis, dan tidak termasuk Tempo. Contoh nota Rp50.000 dengan DP Rp25.000: pemasukan Rp25.000 dan sisa DP Rp25.000. Akses kelima bagian diatur terpisah oleh Owner melalui izin RBAC.", icon: <DollarSign className="w-8 h-8" /> },
      ],
    },
    {
      id: "sales-draft",
      title: "Membuat Draft Transaksi",
      description: "Simpan pesanan yang belum dibayar sebagai Draft agar bisa dilanjutkan kasir. Di formulir faktur sementara dan pratinjau Cetak Nota Penawaran, isi Nama pada nota untuk tiap item; Nama POS tetap terlihat sebagai acuan. Nama khusus hanya berlaku pada dokumen ini dan tidak mengubah produk, harga, atau stok POS.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka POS", description: "Buka menu samping (sidebar) sebelah kiri, pilih kategori 'Operasi', dan klik menu 'Kasir' (POS).", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Tambah Barang ke Keranjang", description: "Klik produk yang dipesan agar masuk ke keranjang. Pada formulir faktur sementara atau pratinjau nota penawaran, pengguna dengan izin edit draft dapat mengisi Nama pada nota sepanjang 1–300 karakter; nama tidak boleh kosong. Nama POS hanya untuk acuan. Klik Kembalikan nama POS untuk memakai nama asal. Saat mencetak, nama disimpan lebih dulu; jika gagal, perbaiki kesalahan lalu coba lagi. Buka kembali dokumen untuk memakai nama tersimpan. Pengguna yang hanya memiliki akses baca tetap dapat melihat dan mencetak nama tersimpan; kertas dan PDF hanya memuat Nama pada nota, tanpa acuan POS atau tombol pengeditan.", icon: <Package className="w-8 h-8" /> },
        { title: "Simpan Sebagai Draft", description: "Buka Pembayaran, lengkapi pelanggan dan catatan, lalu pilih Simpan Faktur Sementara. Tanggal dan jam langsung terisi saat form dibuka dalam WIB; Owner/Admin dapat mengubahnya, sedangkan Kasir/Sales memakai waktu otomatis server. Pengaturan No. Faktur ada di modal Cetak Nota Penawaran bersama data penerima. Pengguna dengan izin edit draft dapat mengetik nomor custom atau klik Gunakan otomatis. Nomor disimpan ke transaksi sebelum dicetak dan dipakai saat cetak ulang. Nomor yang sudah digunakan ditolak; perbaiki nomor lalu coba cetak kembali. Sales dapat mencetak nomor tersimpan sesuai izin yang berlaku.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "sales-invoice",
      title: "Mencetak Invoice / Struk",
      description: "Cetak invoice atau nota tagihan belanja untuk diserahkan ke pembeli sebagai bukti transaksi.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Riwayat Transaksi", description: "Buka menu samping (sidebar) sebelah kiri, pilih kategori 'Operasi', dan klik menu 'Riwayat'. Gunakan filter Metode pembayaran untuk mencari transaksi yang memuat Tunai, Transfer, QRIS, Debit, Kartu Kredit, atau Tempo/Tagihan. Transaksi dengan lebih dari satu metode berbeda menampilkan badge Multi-payment dan badge setiap metodenya.", icon: <History className="w-8 h-8" /> },
        { title: "Pilih Transaksi", description: "Cari transaksi di tabel, lalu klik Lihat Struk untuk membuka invoice. Untuk mengubah invoice reguler, klik Ubah di samping Lihat Struk jika memiliki izin; aksi tidak tersedia untuk transaksi gabungan atau nota Percetakan yang sudah diproses. Di bawah total produk, isi, ubah, atau kosongkan Catatan Transaksi lalu klik Simpan. Catatan tersimpan digunakan saat struk atau invoice dicetak ulang; jika catatan sudah berubah di sesi lain, tutup dan buka kembali transaksi. Pada produk, buka Harga, diskon & satuan untuk mengisi harga transaksi, diskon rupiah atau persen per baris, serta memilih satuan lain dalam grup stok. Harga satuan baru mengikuti harga jual dan pembulatan toko, lalu dapat diubah lagi. Pada transaksi menunggu persetujuan atau sementara, harga dihitung ulang saat persetujuan dan harga yang diubah bisa berubah; periksa harga dan total sebelum menyetujui. Periksa total sebelum menyimpan; status dan saldo pembayaran mengikuti total baru. Transaksi tanpa pelanggan terdaftar tidak dapat menyisakan tagihan setelah total dinaikkan. Produk pada Surat Jalan tidak dapat dihapus atau diubah jumlah dan satuannya. Jika riwayat stok lama belum dapat dibuktikan, jumlah dan satuan perlu diperiksa sebelum diubah.", icon: <Search className="w-8 h-8" /> },
        { title: "Cetak Invoice", description: "Pada rincian transaksi, klik ikon printer atau tombol Cetak Invoice. Nota biasa menampilkan Pajak sebagai persen di bagian atas nota dan PDF. Tarif dapat diisi sejak modal Pembayaran. Pada Cetak Nota Penawaran, PPN (%) dihitung dari DPP Nilai Lain (11/12 jumlah setelah diskon), lalu DPP dan PPN dicetak sebagai nominal rupiah. Pengguna dengan izin edit transaksi/draft dapat mengisi 0–100% dengan maksimal dua desimal. Simpan Pajak atau cetak untuk menyimpan perubahan ke total dan sisa tagihan. Metode pajak penawaran dipertahankan saat dilanjutkan ke pembayaran. Jika penyimpanan gagal, input tetap tersimpan di layar; coba lagi atau buka kembali nota bila transaksi berubah.", icon: <FileText className="w-8 h-8" /> },
      ]
    },
    {
      id: "sales-sj",
      title: "Membuat Surat Jalan (Delivery Order)",
      description: "Buat surat jalan pengiriman barang untuk pesanan yang sudah lunas atau sudah bayar DP. Stok barang dikurangi saat transaksi disimpan atau disetujui. Surat Jalan transaksi baru tidak mengurangi stok lagi.",
      icon: <Truck className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Cetak Surat Jalan", description: "Di halaman Riwayat Transaksi, cari transaksi lunas/DP. Klik tombol aksi titik tiga '...' di ujung kanan, pilih 'Cetak Surat Jalan'.", icon: <History className="w-8 h-8" /> },
        { title: "Edit Langsung di Struk", description: "Struk langsung terbuka. Klik penerima, nama barang, jumlah, atau keterangan untuk mengedit. Jumlah awal mengikuti sisa barang setelah pengiriman yang disetujui dan menunggu approval. Isi 0 untuk tidak menyertakan barang; nama barang hanya berubah pada surat jalan ini.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih Pengiriman", description: "Dokumen aktif terbaru dibuka otomatis. Gunakan pilihan Dokumen untuk melihat pengiriman lain, atau Pengiriman baru untuk sisa barang. Mengubah dokumen tersimpan memerlukan izin Ubah Surat Jalan; dokumen yang dibatalkan atau ditolak hanya dapat dilihat dan dicetak.", icon: <Truck className="w-8 h-8" /> },
        { title: "Simpan & Cetak", description: "Klik Simpan & Cetak agar perubahan tersimpan sebelum dicetak. Gunakan Cetak untuk cetak ulang tanpa membuat pengiriman baru. Approval mengikuti pengaturan RBAC; transaksi baru tidak mengurangi stok lagi. Pada transaksi lama yang stoknya dikelola Surat Jalan, perubahan jumlah dokumen yang disetujui menyesuaikan stok berdasarkan riwayat yang terbukti. Perubahan yang belum disimpan tetap tersedia bila penyimpanan gagal; pilih Lanjut edit atau Buang perubahan saat menutup atau berpindah dokumen.", icon: <FileText className="w-8 h-8" /> },
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
      description: "Alur kerja harian orang gudang dari mulai cek log mutasi, terima kiriman barang masuk, hingga lapor barang rusak. Untuk Penerimaan Barang, pilih Pembelian Barang yang sudah disetujui, periksa peringatan penerimaan lain yang masih PENDING, pilih Sesuai atau Tidak Sesuai per produk, isi jumlah diterima, lalu klik 'Ajukan ke Owner'. Catatan produk wajib diisi saat jumlah diterima berbeda dari jumlah dipesan yang tersedia.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Verifikasi Mutasi Log", description: "Buka menu 'Inventaris' di sidebar. Klik tab 'Riwayat' -> sub-tab 'Log Stok' di pagi hari untuk memastikan mutasi stok harian berjalan sesuai catatan. Di layar HP, geser bar sub-tab Riwayat secara horizontal dan baca log sebagai kartu ringkas.", icon: <History className="w-8 h-8" /> },
        { title: "Input Penerimaan Barang", description: "Buka Penerimaan Barang dari Inventaris atau Supplier. Pilih pembelian, isi jumlah dan kesesuaian, lalu periksa HPP dan harga jual seluruh satuan yang ditampilkan. Isi harga jual satuan aktif untuk barang Sesuai; HPP dan harga Agen/Dinas boleh kosong. Pada Pembayaran Pembelian, pilih Transfer atau Giro dan isi nominal. Klik Tambah Giro untuk membagi pembayaran, misalnya satu giro jatuh tempo 7 hari dan satu lagi 30 hari. Isi tanggal setiap giro dan pastikan total pembayaran sama dengan total pembelian, lalu ajukan ke Owner. Jika seluruh jumlah 0, pembayaran dan Pengeluaran belum dicatat. Jadwal ditetapkan saat penerimaan pertama yang berisi barang disetujui dan digunakan kembali pada penerimaan berikutnya.", icon: <Package className="w-8 h-8" /> },
        { title: "Review per produk", description: "Buka Proses atau Ubah Penerimaan, lalu klik Edit. Role dengan izin inventory.inbound_receipt.edit:update dapat mengganti Barang Diterima dari produk pembelian yang sama dan mengubah Jumlah Diterima, kesesuaian, satuan, harga, serta catatan. Produk tujuan harus belum ada pada baris lain; hapus barisnya dahulu jika masih tercatat. Isi catatan saat jumlah berbeda, lalu Simpan Perubahan. Baris yang diubah perlu disetujui kembali. Role dengan izin inventory.inbound_receipt.approve:update dapat menyetujui tiap produk. Dokumen tetap PENDING selama masih ada produk Belum Ada Aksi. Penolakan seluruh dokumen membutuhkan inventory.inbound_receipt.reject:update dan alasan. Dokumen yang sudah difinalisasi tidak dapat diedit melalui alur ini.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Finalisasi stok dan harga", description: "Setelah semua produk disetujui, penerimaan otomatis APPROVED. Stok dan harga satuan untuk barang Sesuai diperbarui dalam transaksi yang sama, mengikuti aturan harga grup. Barang Tidak Sesuai tidak mengubah harga. Stok bersama dicatat sebagai satu bundle di Log Stok memakai nama supplier.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Catat Barang Pecah/Rusak", description: "Jika ditemukan produk rusak, klik tombol 'Input / Transaksi' -> 'Laporkan Barang Rusak'. Masukkan kode barang, kuantitas yang rusak, isi alasan penyesuaian, lalu klik 'Simpan'.", icon: <Settings className="w-8 h-8" /> },
      ]
    },
    {
      id: "inventory-tugas-harian",
      title: "Menyelesaikan Tugas Harian",
      description: "Cek daftar pekerjaan harianmu di sini, seperti mencocokkan stok fisik harian dan memverifikasi Log OUT. Untuk tugas 'Log OUT Belum Diverifikasi', klik Setujui jika catatan sudah benar, klik Perlu Koreksi jika data perlu diperbaiki, lalu gunakan tombol Koreksi untuk mengajukan produk/qty/alasan yang benar. Log Stok hanya menampilkan warna dan badge status verifikasi, tanpa tombol koreksi atau setujui. Tab Tugas dan Pusat Kerja Hari Ini langsung tersedia sesuai izin akun.",
      icon: <TrendingUp className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Cek Tugas Aktif", description: "Buka menu 'Inventaris' di sidebar kiri, lalu langsung klik tab 'Tugas' untuk melihat checklist tugas harian dan mingguan.", icon: <ShoppingCart className="w-8 h-8" /> },
        { title: "Lakukan Matching Stok", description: "Matching Stok Harian hanya dibuka pukul 15:00-20:00 WIB. Klik tugas 'Matching Stok Harian' (atau tombol 'Input / Transaksi' -> 'Cocokkan Stok (Harian)'), klik input Stok Gudang per baris, lalu cek indikator otomatis: hijau berarti sesuai, merah berarti selisih, dan kuning berarti belum valid. Isi catatan untuk baris selisih, lalu klik 'Submit Matching'.", icon: <History className="w-8 h-8" /> },
        { title: "Input Laporan Kerusakan", description: "Klik tugas 'Laporan Barang Rusak', cari produk reject, isi kuantitas, lalu klik 'Pilih gambar bukti'. Atur dengan tombol Putar, lalu klik 'Unggah foto'. Jika R2 gagal, gunakan input prnt.sc yang muncul sebelum mengirim laporan.", icon: <ShieldCheck className="w-8 h-8" /> },
        { title: "Verifikasi Log OUT Belum Diverifikasi", description: "Klik tugas 'Log OUT Belum Diverifikasi', periksa daftar barang keluar hari ini, lalu pilih 'Setujui' atau 'Perlu Koreksi'. Jika perlu koreksi, tombol Koreksi membuka form perbaikan produk, qty, alasan, dan catatan. Setelah koreksi disetujui Owner/Admin/Inventory lain, cek ulang baris tersebut lalu klik Setujui.", icon: <Settings className="w-8 h-8" /> },
        { title: "Check Out Inventaris", description: "Di akhir hari, buka panel Check Out lalu klik 'Check Out'. Periksa ringkasan pergerakan stok, status dokumen, dan workflow. Jika masih ada tugas wajib yang belum selesai, isi alasan pengecualian per kategori sebelum klik 'Tutup Hari'. Baca ringkasan tersimpan di Riwayat > Riwayat Tugas Harian.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "inventory-tugas-mingguan",
      title: "Menyelesaikan Tugas Mingguan",
      description: "Cek tugas akhir pekanmu di sini, seperti upload foto kebersihan rak gudang dan melakukan stock opname (hitung stok besar).",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Tugas Mingguan", description: "Buka menu 'Inventaris' di sidebar kiri, klik tab 'Tugas' di bagian atas halaman, lalu pilih sub-tab 'Tugas Mingguan'.", icon: <Package className="w-8 h-8" /> },
        { title: "Pilih Gambar Bukti Kebersihan", description: "Klik tugas 'Proof Kebersihan Gudang', lalu klik 'Pilih gambar bukti'. Gunakan 'Putar kiri' atau 'Putar kanan', lalu klik 'Unggah foto'. Jika R2 gagal, gunakan input prnt.sc yang muncul. Cek pratinjau lalu klik 'Submit Proof'.", icon: <Settings className="w-8 h-8" /> },
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
      title: "Import Stok Massal (Excel/CSV)",
      description: "Nggak usah edit stok satu-satu, kamu bisa update ribuan stok barang sekaligus pakai file Excel atau CSV.",
      icon: <FileText className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Pilih Menu Import", description: "Di halaman Produk, klik tombol 'Import' (dropdown) di pojok kanan atas layar.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih Impor Stok Massal", description: "Pilih 'Impor Stok Massal' untuk masuk ke halaman penyesuaian kuantitas stok dari berkas Excel atau CSV.", icon: <FileText className="w-8 h-8" /> },
        { title: "Upload File", description: "Pilih file .xlsx atau .csv dengan kolom nama barang, stok, dan satuan, maksimal 5 MB. Kategori/jenis tidak diperlukan dan tidak dipakai untuk pencocokan. File katalog lama dengan kolom kategori tetap bisa diunggah.", icon: <FileText className="w-8 h-8" /> },
        { title: "Periksa perubahan stok", description: "Petakan kolom dan periksa pratinjau. Produk dicocokkan dari nama dan satuan. Jika beberapa produk cocok, pilih produk yang benar. Produk yang tidak ditemukan dan stok sebelum/sesudah yang sama dilewati. Mode Tambah menjumlahkan baris duplikat, sedangkan mode Set memakai baris terakhir.", icon: <Settings className="w-8 h-8" /> },
        { title: "Terapkan dan pantau progres", description: "Klik Terapkan Impor Stok. Kamu boleh menutup panel impor; tombol Impor berubah menjadi Progres Impor Stok untuk membuka kembali progres dan hasilnya, termasuk setelah halaman dimuat ulang saat job masih berjalan. Status Sedang diproses tampil sampai penyimpanan selesai. Jika proses terhenti, status gagal akan muncul; periksa stok dan riwayat sebelum mengimpor ulang. Perubahan stok dari Admin tetap menunggu persetujuan Owner.", icon: <History className="w-8 h-8" /> },
      ]
    },
    {
      id: "inventory-update-stok-massal",
      title: "Update Stok",
      description: "Update satu produk atau banyak produk dari tombol Update Stok di halaman Inventaris. Pilihan massal sebelumnya dikenal sebagai Banyak Produk (Bulk). Thumbnail/foto produk tampil di pencarian, kartu pilihan, dan preview dengan foto produk/varian.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Buka Update Stok", description: "Masuk ke menu 'Inventaris' di sidebar kiri, lalu klik tombol 'Update Stok' di sebelah tombol 'Input / Transaksi'.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Pilih Satu Produk (Single) / Banyak Produk (Massal) - Update Stok Massal", description: "Pilih 'Satu Produk (Single)' untuk update satu produk dengan tampilan ringkas, atau pilih 'Banyak Produk (Massal)' untuk membuka workflow Update Stok Massal yang sudah ada.", icon: <Settings className="w-8 h-8" /> },
        { title: "Cari Produk", description: "Di jalur Satu Produk, cari dan pilih satu produk. Di jalur Banyak Produk (Massal), gunakan kolom 'Cari produk' untuk menambahkan beberapa produk atau varian ke daftar. Thumbnail/foto produk muncul di hasil pencarian dan kartu pilihan agar barang mudah dicek.", icon: <Search className="w-8 h-8" /> },
        { title: "Atur Aksi & Jumlah", description: "Pilih aksi (Tambah stok, Kurangi stok, atau Set stok akhir) dan masukkan jumlah kuantitas stok yang baru.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pilih Mode Stok", description: "Pilih 'Stok Bersama' untuk membagikan perubahan stok ke seluruh varian dalam grup, atau 'Stok Produk Ini' untuk mengubah stok produk tersebut saja tanpa memengaruhi varian lain.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Cek Preview", description: "Pada Satu Produk, cek ringkasan sebelum dan sesudah. Pada Banyak Produk (Massal), perhatikan tabel preview dengan foto produk/varian dan pastikan tidak ada produk duplikat.", icon: <FileText className="w-8 h-8" /> },
        { title: "Ajukan Perubahan", description: "Ketik catatan jika diperlukan, lalu klik tombol 'Ajukan Update Stok'. Pengajuan akan dikirim ke Owner untuk disetujui (Status Pending) sebelum stok resmi diperbarui.", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    },
    {
      id: "inventory-stock-group",
      title: "Mengatur Grup Stok (Stock Group)",
      description: "Mengelompokkan produk-produk variasi atau kemasan berbeda agar berbagi satu stok fisik yang sama di gudang.",
      icon: <Warehouse className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tujuan grup", description: "Di Pusat Produk, pilih minimal dua produk dengan satuan berbeda, lalu klik Buat atau gabungkan grup stok. Aksi memerlukan product.update dan inventory.update. Pilih Buat grup baru dan isi nama, atau Gabungkan ke grup yang ada lalu pilih Grup tujuan.", icon: <Warehouse className="w-8 h-8" /> },
        { title: "Satuan dan stok", description: "Untuk grup baru, pilih Sumber stok dan isi Konversi satuan. Stok bersama mengikuti sumber yang dipilih; stok semua produk tidak dijumlahkan karena satuan mewakili persediaan fisik yang sama. Saat menggabungkan, satuan acuan grup tujuan tetap dan stok mengikuti anggota acuan tersebut. Isi konversi satuan baru terhadap acuan, periksa anggota lama, dan perbaiki konflik satuan sebelum lanjut.", icon: <Settings className="w-8 h-8" /> },
        { title: "Tinjau dan simpan", description: "Periksa tujuan, sumber stok, konversi, perpindahan grup, serta stok sekarang dan setelah disimpan bagi semua anggota terdampak. Klik Buat grup stok atau Gabungkan ke grup stok sesuai tujuan. Kembali mempertahankan draft. Jika data berubah, muat ulang lalu tinjau kembali sebelum menyimpan.", icon: <Package className="w-8 h-8" /> },
        { title: "Ringkasan dan Tetapkan stok akhir", description: "Buka grup dari produk atau tab Aktivitas Grup. Di Ringkasan, Pohon persediaan menghubungkan akar Stok bersama ke setiap satuan lewat garis cabang. Setiap cabang menampilkan konversi terhadap satuan acuan, SKU, stok setara, dan harga jual; stok setara bukan stok tambahan. Gunakan Atur konversi, Atur harga, atau Tambah satuan sesuai izin. Di ponsel, cabang tersusun ke bawah. Tetapkan stok akhir memerlukan inventory.update dan menyimpan jumlah akhir secara langsung, bukan menambah jumlah dan bukan pengajuan persetujuan. Pilih satuan input dan tinjau dampak ke semua satuan sebelum menyimpan.", icon: <Settings className="w-8 h-8" /> },
        { title: "Satuan, Harga, Tambah satuan, dan Riwayat", description: "Satuan dan Harga memerlukan product.update. Tinjau perubahan satuan sebelum menyimpan; pilih Pertahankan stok bersama atau Ikuti stok satuan sumber. Pengaturan lanjutan tersedia bila diperlukan. Di Harga, HPP belum diisi berarti margin belum diketahui; gunakan Pratinjau harga lalu Terapkan harga grup. Tambah satuan memerlukan product.create dan menampilkan Stok dari grup tanpa menambah persediaan. Riwayat memuat aktivitas yang benar-benar tercatat dengan filter Semua aktivitas atau Perubahan konversi dan pagination.", icon: <History className="w-8 h-8" /> },
        { title: "Pilih sumber harga", description: "Buka grup > Harga dengan izin product.update. Pilih Sumber harga dari anggota aktif, lalu isi Harga jual sumber dan HPP sumber. Simpan perubahan detail produk, grup, atau satuan terlebih dahulu sebelum membuka aksi harga dari editor produk. Pengikut grup baru dan lama memakai Manual; harga jual dan HPP lama dipertahankan saat pengikut beralih ke Manual. Anggota nonaktif tetap tampil sebagai informasi dan hasil pratinjau.", icon: <Settings className="w-8 h-8" /> },
        { title: "Atur Auto atau Manual", description: "Auto mengikuti konversi dari sumber. Pilih tanpa penyesuaian, diskon, atau markup untuk harga jual; diskon jual tidak mengurangi HPP. Buka faktor eksak bila perlu. Manual memungkinkan harga jual dan HPP sendiri. Kembali ke Auto mempertahankan harga jual dengan menghitung faktor, lalu HPP mengikuti sumber. Satuan baru memakai Manual agar harga jual dan HPP dapat diisi sendiri. Pada produk baru dengan beberapa satuan, satuan terkecil menjadi sumber; pilih Auto pada pengikut bila ingin mengikuti sumber.", icon: <Settings className="w-8 h-8" /> },
        { title: "Pratinjau lalu terapkan", description: "Klik Pratinjau harga. Sebelum dihitung, angka pengikut adalah harga tersimpan dengan status Belum dihitung. Periksa sebelum/sesudah harga jual, HPP, dan margin setiap satuan, lalu klik Terapkan harga grup. Mengubah draf membatalkan pratinjau; hitung lagi. Jika data berubah, muat ulang data terbaru dan tinjau ulang draf sebelum menerapkan. Perlu ditinjau menjelaskan sumber nonaktif/tidak tersedia, konversi, faktor saat sumber nol, atau HPP yang belum diisi; perbaiki bidang terkait. HPP kosong tidak sama dengan nol. Sumber jual nol dengan faktor valid menghasilkan nol dan mempertahankan faktor; tanpa faktor, harga lama dipertahankan sampai diperbaiki.", icon: <Settings className="w-8 h-8" /> },
        { title: "Contoh Snowman V5", description: "Jika pengikut dipilih Auto, beli 10 pak, 1 pak = 12 pcs: masukkan stok 120 pcs memakai HPP pcs. Dengan HPP pcs Rp2.000 dan harga jual pcs Rp3.000, HPP pak Rp24.000. Harga pak lama Rp32.400 menyimpan faktor 9/10 (diskon 10%). Saat harga pcs menjadi Rp3.500, harga pak Rp37.800; HPP tetap Rp24.000. HPP Unit pada Penerimaan Barang yang disetujui memperbarui harga produk sesuai satuan dan aturan grup. Hanya perubahan HPP master nyata memproyeksikan ulang grup; jika penulisan HPP pengikut Auto ditolak, ubah sumber atau pilih Manual terlebih dahulu.", icon: <Settings className="w-8 h-8" /> },
        { title: "Ajukan perubahan stok di Inventori", description: "Buka Inventaris > Update Stok > Banyak Produk (Massal), lalu gunakan Cari produk. Stok Bersama menghitung dampak semua satuan; pilih satu produk saja per grup stok. Stok Produk Ini hanya membuat log produk tersebut tanpa mengubah stok grup. Semua pengajuan di Inventori, termasuk Set stok akhir, menunggu persetujuan owner (approval).", icon: <ShieldCheck className="w-8 h-8" /> },
      ]
    }
  ],
  AI_ASSISTANT: [
    {
      id: "ai-assistant-system-help",
      title: "Tanya Cara Pakai Fitur & Menu POS",
      description: "Bingung cara pakai menu tertentu atau mau tahu apa aja hak akses akunmu? Tanya aja langsung ke Pak Teladan. Daftar quick prompt role selalu disesuaikan dengan tool yang tersedia untuk role tersebut, jadi saran aksinya tetap relevan dengan aksesmu. Quick prompt Owner yang punya glow effect, yaitu Rekap finansial bulanan dan Rekap pelanggan bulanan, tetap tersedia seperti sebelumnya. Untuk panduan operasional FAQ, jawabannya tampil sebagai diagram langkah yang aman sesuai akses role kamu. Pak Teladan juga bisa membantu membuka modal inti sesuai izin akunmu. Kalau ada notifikasi belum dibaca, tombol Pak Teladan menampilkan badge merah dan panel chat langsung ngasih heads-up yang bisa kamu buka.",
      icon: <Bot className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Klik Tombol Robot", description: "Pencet tombol robot bulat warna biru (Pak Teladan) yang ngambang di pojok kanan bawah layar.", icon: <Bot className="w-8 h-8" /> },
        { title: "Pilih Quick Prompt Role", description: "Pilih ide cepat yang muncul sesuai tool role kamu, atau tulis pertanyaan sendiri pakai bahasa santai sehari-hari. Contoh: Inventory mendapat prompt update stok, Sales mendapat prompt rekap pelanggan, dan Kasir mendapat prompt mulai shift.", icon: <Search className="w-8 h-8" /> },
        { title: "Baca Diagram Langkah", description: "Kalau pertanyaanmu cocok dengan panduan FAQ, Pak Teladan menampilkan stepper berisi langkah terpercaya, sumber FAQ, dan tombol buka halaman yang sesuai aksesmu.", icon: <Sparkles className="w-8 h-8" /> },
        { title: "Tetap Kamu yang Konfirmasi", description: "Pak Teladan bisa membantu navigasi dan membuka modal Tambah Produk, Pelanggan, Supplier, Sales, Pengeluaran, Shift, serta Inventori. Ia tidak mengisi atau menyimpan form secara otomatis; pemeriksaan dan konfirmasi akhir tetap kamu lakukan.", icon: <ShieldCheck className="w-8 h-8" /> },
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
      description: "Pantau performa tokomu dari mana aja dengan gampang! Owner bisa memakai quick prompt Rekap finansial bulanan. Pak Teladan menyiapkan kartu PDF atau Excel tanpa auto-download; klik Download saat siap, lalu gunakan Download ulang dan baca saran dari data yang sama.",
      icon: <TrendingUp className="w-5 h-5 text-brand-600" />,
      steps: [
        { title: "Tanyakan Penjualan", description: "Tanya aja omzet pada tanggal tertentu, misalnya: 'Hari ini dapet omzet berapa?' atau 'Rangkuman penjualan kemarin dong'.", icon: <TrendingUp className="w-8 h-8" /> },
        { title: "Perhitungan Data", description: "Pak Teladan bakal langsung mengumpulkan data nota penjualan yang sudah selesai (Lunas, DP, atau Tempo) pada tanggal tersebut.", icon: <DollarSign className="w-8 h-8" /> },
        { title: "Analisis Menyeluruh", description: "Untuk permintaan analisis, Pak Teladan memeriksa ringkasan, metode pembayaran, produk, kategori, sales, shift, kehilangan stok, dan tren sekaligus. Jika periode tidak disebutkan, rentangnya 30 hari terakhir.", icon: <Sparkles className="w-8 h-8" /> },
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
        { title: "Daftar Terlaris", description: "Produk terlaris dikelompokkan ke Stationery/ATK, Kertas, Cartridge, dan Tinta supaya lebih mudah merencanakan stok.", icon: <Sparkles className="w-8 h-8" /> },
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
      description: "Pengen tahu seberapa sering pelanggan setiamu belanja? Owner bisa memakai quick prompt Rekap pelanggan bulanan. Pak Teladan menyiapkan kartu PDF atau Excel tanpa auto-download; klik Download saat siap, lalu gunakan Download ulang dan baca saran dari dataset yang sama.",
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

function conciseStepCallout(description: string) {
  const sentence = description.split(/(?<=[.!?])\s/)[0]?.trim() || description.trim();
  return sentence.length > 180 ? `${sentence.slice(0, 177).trim()}...` : sentence;
}

const PRINTING_RECEIPT_GUIDE: Omit<AccordionItem, "id"> = {
  title: "Membuat Nota Percetakan",
  description: "Isi dan simpan nota langsung di tab Percetakan, lalu proses pembayaran atau DP dan temukan kembali melalui Riwayat. Menu tiga titik di Riwayat juga menyediakan Void dan Hapus untuk semua jenis transaksi sesuai izin dan status. Void memerlukan transaction.update bagi role yang diberi izin; surat jalan PENDING/CONFIRMED terkait ikut dibatalkan dan nota sumber dipertahankan. Hapus memerlukan transaction.delete bagi role yang diberi izin dan menghapus permanen transaksi, nota Percetakan sumber, serta seluruh surat jalan terkait. Jurnal stok serta snapshot dokumen dalam audit tetap tersimpan. Pada semua jenis transaksi, termasuk ATK, Percetakan, dan nota penawaran, riwayat stok kosong atau tidak konsisten menjadi peringatan saat Hapus yang tetap terlihat setelah berhasil dan tercatat di audit. Stok yang tidak dapat dipastikan tidak dikembalikan; pemeriksaan izin dan dampak keuangan tetap berlaku. Hapus setelah Void tidak mengembalikan stok lagi.",
  icon: <FileText className="w-5 h-5 text-brand-600" />,
  steps: [
    { title: "Pilih jenis nota", description: "Buka Kasir > Percetakan, lalu pilih SPANDUK, PERCETAKAN, PLAT, STEMPEL, atau PRINT. Setiap subtab memiliki daftar nota tersimpan sendiri.", icon: <ShoppingCart className="w-8 h-8" /> },
    { title: "Buat nota kosong", description: "Klik Buat Nota Kosong. Nota langsung tersimpan di subtab terpilih; No. Nota terisi otomatis dan masih dapat diubah selama draft. Judul nota di atas lembar awalnya mengikuti nomor nota. Ganti judul selama draft agar mudah dibedakan di daftar; perubahan tersimpan otomatis. Judul hanya penanda internal dan tidak tampil pada cetakan atau PDF. Cari nota lewat judul, nomor, atau pelanggan, lalu pilih dari daftar untuk membukanya kembali.", icon: <FileText className="w-8 h-8" /> },
    { title: "Isi dan tunggu tersimpan", description: "Isi pelanggan, nama item atau file, bahan, banyaknya, dan harga langsung pada lembar nota. Item dan bahan boleh diketik bebas. Nama dan bahan panjang membungkus otomatis; baris meninggi tanpa mengecilkan huruf, lalu berlanjut ke halaman berikutnya bila perlu. Geser pembatas header untuk mengatur lebar kolom; pada A5, bahan mengikuti kolom Nama Barang. Fokuskan pembatas dengan Tab lalu gunakan ArrowLeft/ArrowRight (Shift untuk langkah lebih besar), atau pilih Reset lebar kolom untuk ukuran bawaan. Lebar tersimpan per nota dan dipakai juga pada Cetak / PDF. Jika baris kosong tidak lagi muat, isi nama atau bahan di panel Item berikutnya di bawah nota; item masuk ke halaman nota saat mulai diisi. Buka Baris dan hubungan stok lalu Hubungkan stok bila perlu; Jumlah pemakaian adalah total bahan untuk baris tersebut. Tunggu Tersimpan sebelum berpindah nota atau membayar. Jika Gagal menyimpan, pilih Coba simpan lagi; Muat ulang versi tersimpan mengganti perubahan lokal setelah konfirmasi.", icon: <Package className="w-8 h-8" /> },
    { title: "Bayar dan cetak", description: "Klik Bayar / DP untuk nota aktif, lalu pilih metode dan pelunasan atau DP sesuai kebutuhan. Satu nota menjadi satu transaksi. Klik Cetak / PDF lalu Cetak atau Unduh PDF untuk memakai desain asal; stok bahan terkait berkurang saat transaksi berhasil. Pembayaran lanjutan mengikuti transaksi. Di ponsel, gunakan Daftar nota untuk membuka daftar serta Perkecil nota atau Perbesar nota untuk mengatur tampilan.", icon: <DollarSign className="w-8 h-8" /> },
    { title: "Temukan dan koreksi nota", description: "Buka Riwayat, pilih Kategori transaksi PERCETAKAN lalu Subkategori asal nota, atau cari nomor nota. Di komputer, tabel otomatis menyesuaikan lebar yang tersedia; klik Sesuaikan tabel di atas tabel untuk menghitung ulang ukurannya. Di ponsel, transaksi tampil sebagai kartu. Untuk penjualan ATK, pilih ATK lalu kategori produk. Mengganti Kategori mengosongkan Subkategori dan kembali ke halaman pertama; Semua Kategori menonaktifkan Subkategori. Buka transaksi untuk cetak ulang memakai template asal. Layanan cetak lama tanpa jenis tercatat masuk PERCETAKAN tanpa subkategori. Untuk koreksi, klik Edit nota diproses di bawah Lihat Struk pada transaksi Percetakan di Riwayat, atau buka nota tersimpan di Kasir > Percetakan dan klik Edit nota diproses. Baca peringatan, centang 'Saya memahami dampaknya terhadap transaksi, stok, dan piutang.', lalu pilih Tetap edit nota. Izin printing_receipt.processed:update hanya aktif untuk Owner secara default dan dapat diberikan ke role lain melalui Hak Akses. Perubahan tidak tersimpan otomatis. Klik Tinjau perubahan, bandingkan total, pembayaran, piutang, dan bahan sebelum serta sesudah, lalu Simpan dan perbarui transaksi. Nota yang sebelumnya lunas dapat kembali memiliki piutang jika total naik; total tidak boleh di bawah pembayaran bersih. Nomor nota, pelanggan terdaftar, dan riwayat pembayaran tetap. Nota dibatalkan atau refund tidak dapat diedit. Nota menunggu persetujuan tetap pending; stok dan piutang baru diterapkan setelah disetujui. Jika keluar sebelum menyimpan, konfirmasikan pembuangan perubahan.", icon: <History className="w-8 h-8" /> },
  ],
};

const OFFLINE_SYNC_GUIDE: AccordionItem = {
  id: "offline-sync",
  title: "Menyiapkan dan memeriksa transaksi offline",
  description: "Siapkan POS di perangkat dan periksa transaksi yang menunggu sinkronisasi.",
  icon: <Database className="w-5 h-5 text-brand-600" />,
  steps: [
    { title: "Siapkan POS", description: "Saat online, masuk sebagai kasir yang akan bertransaksi, buka Kasir > Offline Sync, buat dan ulangi PIN offline, lalu pilih Siapkan POS offline. Setelah pembaruan ini, siapkan kembali PIN pada setiap perangkat; ulangi sedikitnya setiap tujuh hari dan setelah pembaruan aplikasi. PIN mengenkripsi halaman POS; katalog dan antrean transaksi belum terenkripsi.", icon: <ShoppingCart className="w-8 h-8" /> },
    { title: "Buka saat offline", description: "Saat koneksi terputus, buka alamat POS, pilih akun, masukkan PIN, lalu pilih Buka POS offline. Kasir dapat memproses produk sesuai izin yang terakhir diperiksa; layanan dan harga khusus tersedia kembali saat online. Transaksi tersimpan di perangkat dan masih memerlukan pemeriksaan server; jangan hapus data situs sebelum tersinkronisasi.", icon: <AlertTriangle className="w-8 h-8" /> },
    { title: "Periksa setelah terhubung", description: "Masuk sebagai kasir asal, buka Kasir > Offline Sync, dan periksa status serta alasan kegagalan. Pilih Coba lagi jika tersedia. Owner dapat mengunduh transaksi yang belum tersimpan di server, termasuk transaksi lama tanpa identitas, untuk rekonsiliasi; asalnya tidak ditetapkan otomatis.", icon: <ShieldCheck className="w-8 h-8" /> },
  ],
};

export const HELP_ROLE_CONTENT: Record<string, AccordionItem[]> = Object.fromEntries(
  Object.entries(RAW_HELP_ROLE_CONTENT).map(([role, guides]) => [
    role,
    [...guides, ...(["OWNER", "ADMIN", "CASHIER", "SALES"].includes(role)
      ? [{ ...PRINTING_RECEIPT_GUIDE, id: `${role.toLowerCase()}-printing-receipts` },
         { ...OFFLINE_SYNC_GUIDE, id: `${role.toLowerCase()}-offline-sync` }]
      : [])].map((guide) => ({
      ...guide,
      steps: guide.steps.map((step, stepIndex) => {
        const audited = AUDITED_HELP_STEP_TARGETS[guide.id]?.[stepIndex];
        if (!audited) {
          throw new Error(`Kontrak visual Bantuan belum tersedia: ${role}/${guide.id}/${stepIndex + 1}`);
        }
        return {
          ...step,
          visual: {
            page: audited[0],
            target: audited[1],
            callout: step.visual?.callout ?? conciseStepCallout(step.description),
          },
        };
      }),
    })),
  ]),
);

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
  const allContent = useMemo(() => HELP_ROLE_CONTENT[targetRole] || [], [targetRole]);
  const showSessionHelp = targetRole !== "AI_ASSISTANT"
    && (!searchQuery || /sesi|login|masuk|keluar|perangkat|koneksi|hak akses|keranjang/i.test(searchQuery));
  const content = useMemo(() => {
    if (!searchQuery) return allContent;
    return allContent.filter((item) => searchInContent(item, searchQuery));
  }, [allContent, searchQuery]);

  const [openId, setOpenId] = useState<string | null>(content[0]?.id ?? null);

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

  if (searchQuery && content.length === 0 && !showSessionHelp) {
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
      {showSessionHelp && (
        <section aria-labelledby="help-device-sessions" className="rounded-2xl border border-brand-100 bg-brand-50 p-5 text-sm text-brand-900">
          <h2 id="help-device-sessions" className="font-bold">Masuk di banyak perangkat</h2>
          <p className="mt-1">Satu akun bisa aktif di beberapa perangkat. Pilih Keluar untuk mengakhiri sesi pada perangkat ini.</p>
          <p className="mt-2">Saat koneksi sedang dipulihkan, biarkan tab tetap terbuka. Jika sesi berakhir, pilih Masuk lagi dan gunakan akun serta toko yang sama untuk memulihkan item keranjang yang tersimpan di tab itu.</p>
        </section>
      )}
      {!searchQuery && (
        <Link href="/changelog" prefetch={false} className="flex items-center gap-4 rounded-2xl border border-brand-200 bg-brand-50 p-5 text-brand-900 transition-colors hover:bg-brand-100">
          <History className="h-7 w-7 shrink-0 text-brand-700" aria-hidden="true" />
          <div>
            <h2 className="text-sm font-bold">Catatan Perubahan</h2>
            <p className="mt-1 text-sm">Buka Lainnya → Catatan Perubahan untuk melihat gambar fitur dan alur singkat. Label menunjukkan pembaruan besar atau kecil serta jenisnya, termasuk perbaikan bug. Popup Sorotan 7 hari merangkum pembaruan dalam satu daftar ringkas.</p>
          </div>
        </Link>
      )}
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

      {!searchQuery && (
        <aside
          data-help-preview-tip="true"
          className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sky-950"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sky-600 shadow-sm">
            <ZoomIn className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-bold">Tips Melihat Panduan Visual</h2>
            <p className="mt-1 text-sm leading-relaxed text-sky-800">
              Preview otomatis mengikuti ukuran perangkat Anda. Klik preview untuk membuka modal; di ponsel,
              cubit layar untuk memakai zoom 1×–3×, sedangkan di desktop arahkan kursor untuk memperbesar detail.
              Gunakan scrollbar internal bila halaman lebih lebar atau lebih panjang dari area preview. Setiap halaman
              utama punya animasi ambient kecil; animasi otomatis berhenti saat Reduced Motion aktif di perangkat.
            </p>
          </div>
        </aside>
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
                    <HelpDiagramStepper
                      steps={item.steps}
                      guideId={item.id}
                      guideTitle={item.title}
                      role={targetRole}
                    />
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
