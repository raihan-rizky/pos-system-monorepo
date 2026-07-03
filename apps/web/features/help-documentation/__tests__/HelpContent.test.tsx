import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import HelpContent from '../components/HelpContent';

describe('HelpContent', () => {
  it('renders informal AI assistant description correctly', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="AI_ASSISTANT" />
    );

    // Verify informal description
    expect(html).toContain('Kenalan dulu yuk sama Pak Teladan!');
    expect(html).toContain('operasional toko biar makin gampang');

    // Verify informal list responsibilities
    expect(html).toContain('Ngasih tau cara pakai menu');
    expect(html).toContain('Ngecek sisa stok barang');
    expect(html).toContain('Nyari kontak supplier');
    expect(html).toContain('Ngerangkum keuangan harian toko');
    expect(html).toContain('minta klarifikasi singkat');
  });

  it('renders informal AI assistant step titles', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="AI_ASSISTANT" />
    );

    // Verify titles of features
    expect(html).toContain('Cek Harga Jual Barang Super Cepat');
    expect(html).toContain('Intip Sisa Stok Barang di Gudang');
    expect(html).toContain('Cari Barang yang Stoknya Mau Habis');
    expect(html).toContain('Pantau Omzet &amp; Cuan Toko');
    expect(html).toContain('Cek Transaksi Pending &amp; Draft');
  });

  it('documents the updated inbound receipt submission and revision flow', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="INVENTORY" searchQuery="Ajukan ke Owner" />
    );

    expect(html).toContain('Ajukan ke Owner');
    expect(html).toContain('Sudah dibuat');
    expect(html).toContain('Perlu Revisi');
    expect(html).toContain('Edit &amp; Ajukan');
  });

  it('documents the Log OUT verification queue and correction-only Stock Log history', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="INVENTORY" searchQuery="Verifikasi Log OUT" />
    );

    expect(html).toContain('Log OUT Belum Diverifikasi');
    expect(html).toContain('Setujui');
    expect(html).toContain('Perlu Koreksi');
    expect(html).toContain('tombol Koreksi');
    expect(html).toContain('Log Stok hanya menampilkan warna dan badge');
  });

  it('documents the individual stock update via the edit product button', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="ADMIN" searchQuery="Mengubah Stok Individual" />
    );

    expect(html).toContain('Mengubah Stok Individual');
    expect(html).toContain('Ubah Stok Saat Ini');
    expect(html).toContain('Simpan Perubahan');
  });

  it('documents product-first mass stock update modes for stock groups', () => {
    const html = renderToStaticMarkup(
      <HelpContent targetRole="INVENTORY" searchQuery="Update Stok Massal" />
    );

    expect(html).toContain('Update Stok Massal');
    expect(html).toContain('Cari produk');
    expect(html).toContain('Stok Bersama');
    expect(html).toContain('Stok Produk Ini');
    expect(html).toContain('Pilih satu produk saja per grup stok');
  });
});
