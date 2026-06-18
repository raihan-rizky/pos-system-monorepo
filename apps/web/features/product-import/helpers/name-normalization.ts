const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bMsnTik\b/gi, "Mesin Tik"],
  [/\bR\.?\s*Pita\b/gi, "Ribbon Pita"],
  [/\bKlir\b/gi, "Clear"],
  [/\bC\.?\s*Form\b/gi, "Continuous Form"],
  [/\bFc\b/gi, "Fotocopy"],
  [/\bKrbon\b/gi, "Karbon"],
  [/\bTC\b/gi, "Tape Cutter"],
  [/\bht\b/gi, "Hitam"],
  [/\bmr\b/gi, "Merah"],
  [/\bBr\b/gi, "Biru"],
  [/\bW\/B\b/gi, "Whiteboard"],
  [/\bCklt\b/gi, "Coklat"],
  [/\bTl\b/gi, "Tali"],
  [/\bDF\b/gi, "Double Folio"],
  [/\bBateray\b/gi, "Baterai"],
  [/\bC D - R W\b/gi, "Compact Disc Rewritable"],
  [/\bC D - R\b/gi, "Compact Disc Recordable"],
  [/\bBk\b/gi, "Buku"],
  [/\bBh\b/gi, "Buah"],
  [/\bLbr\b/gi, "Lembar"],
  [/\bSleting\b/gi, "Zipper / Retsleting"],
];

export function collapseWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function expandProductNameAbbreviations(value: unknown): string {
  if (typeof value !== "string") return String(value ?? "");

  return collapseWhitespace(
    ABBREVIATIONS.reduce(
      (current, [pattern, replacement]) => current.replace(pattern, replacement),
      value,
    ),
  );
}

export function normalizeProductDuplicateKey(input: {
  name: string;
  category: string;
}): string {
  const name = expandProductNameAbbreviations(input.name).toLowerCase();
  const category = collapseWhitespace(input.category).toLowerCase();

  return `${name}|${category}`;
}
