export function getColumnMappingKey(rawHeaders: string[], index: number): string {
  const rawHeader = String(rawHeaders[index] ?? "").trim();
  if (!rawHeader) return "";

  let occurrence = 0;
  for (let i = 0; i <= index; i += 1) {
    if (String(rawHeaders[i] ?? "").trim() === rawHeader) occurrence += 1;
  }

  return occurrence <= 1 ? rawHeader : `${rawHeader}__${occurrence}`;
}
