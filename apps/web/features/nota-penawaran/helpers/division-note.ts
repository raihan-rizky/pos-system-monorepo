/**
 * Encode / decode a "Divisi / Bagian" value inside the transaction note
 * field so it persists without a schema migration.
 *
 * Format: `[DIVISI:value]` appended at the end of the note string.
 */

const DIVISI_TAG_RE = /\[DIVISI:([^\]]*)\]/;

/**
 * Append a `[DIVISI:…]` tag to an existing note string.
 * Returns the original note untouched if `division` is empty.
 */
export function encodeDivisionInNote(
  note: string | null | undefined,
  division: string,
): string | null {
  const trimmed = division.trim();
  if (!trimmed) return note?.trim() || null;

  const base = note?.trim() || "";
  return base ? `${base} [DIVISI:${trimmed}]` : `[DIVISI:${trimmed}]`;
}

/**
 * Extract the division from a note string that was encoded with
 * `encodeDivisionInNote`. Returns the division value and the
 * cleaned note (with the tag removed).
 */
export function decodeDivisionFromNote(note: string | null | undefined): {
  division: string;
  cleanNote: string | null;
} {
  if (!note) return { division: "", cleanNote: null };

  const match = note.match(DIVISI_TAG_RE);
  if (!match) return { division: "", cleanNote: note };

  const division = match[1] ?? "";
  const cleanNote = note.replace(DIVISI_TAG_RE, "").trim() || null;

  return { division, cleanNote };
}
