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
});
