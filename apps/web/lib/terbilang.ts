/**
 * Convert a number to Indonesian words ("terbilang").
 * E.g. 1_095_500 → "Satu Juta Sembilan Puluh Lima Ribu Lima Ratus"
 */

const SATUAN = [
  "", "Satu", "Dua", "Tiga", "Empat", "Lima",
  "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas",
];

function terbilangPart(n: number): string {
  if (n < 0) return `Minus ${terbilangPart(Math.abs(n))}`;
  if (n < 12) return SATUAN[n]!;
  if (n < 20) return `${SATUAN[n - 10]} Belas`;
  if (n < 100) return `${SATUAN[Math.floor(n / 10)]} Puluh${n % 10 ? ` ${SATUAN[n % 10]}` : ""}`;
  if (n < 200) return `Seratus${n % 100 ? ` ${terbilangPart(n % 100)}` : ""}`;
  if (n < 1_000) return `${SATUAN[Math.floor(n / 100)]} Ratus${n % 100 ? ` ${terbilangPart(n % 100)}` : ""}`;
  if (n < 2_000) return `Seribu${n % 1_000 ? ` ${terbilangPart(n % 1_000)}` : ""}`;
  if (n < 1_000_000) return `${terbilangPart(Math.floor(n / 1_000))} Ribu${n % 1_000 ? ` ${terbilangPart(n % 1_000)}` : ""}`;
  if (n < 1_000_000_000) return `${terbilangPart(Math.floor(n / 1_000_000))} Juta${n % 1_000_000 ? ` ${terbilangPart(n % 1_000_000)}` : ""}`;
  if (n < 1_000_000_000_000) return `${terbilangPart(Math.floor(n / 1_000_000_000))} Miliar${n % 1_000_000_000 ? ` ${terbilangPart(n % 1_000_000_000)}` : ""}`;
  return `${terbilangPart(Math.floor(n / 1_000_000_000_000))} Triliun${n % 1_000_000_000_000 ? ` ${terbilangPart(n % 1_000_000_000_000)}` : ""}`;
}

export function terbilang(amount: number): string {
  if (amount === 0) return "Nol Rupiah";
  return `${terbilangPart(Math.round(Math.abs(amount)))} Rupiah`;
}
