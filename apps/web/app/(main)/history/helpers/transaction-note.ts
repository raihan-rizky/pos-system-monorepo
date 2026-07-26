import { decodeDivisionFromNote } from "@/features/nota-penawaran/helpers/division-note";

/**
 * Matches the "Pelunasan piutang <amount> (<METHOD>)" annotation appended by
 * the debt-payment API (apps/web/app/api/customers/[id]/pay-debt/route.ts).
 * Kept identical to the regex already duplicated in ReceiptModal.tsx and
 * invoice-pdf-data.ts — do not refactor those call sites as part of this
 * change, just don't add a third inline copy here.
 */
const PELUNASAN_ANNOTATION_RE =
  /(?: \| )?Pelunasan(?: piutang)? [\d.,]+ \([A-Z]+\)(?:, [\d.,]+ \([A-Z]+\))*/g;

/**
 * Renders a transaction's `note` field for display on the Riwayat page.
 *
 * `Transaction.note` is not free text: several subsystems append
 * machine-readable annotations to it (a `[DIVISI:…]` tag for quotation
 * division, and a "Pelunasan piutang …" suffix on debt payment). Those must
 * be stripped so the user only sees the text they actually wrote.
 *
 * Intentionally NOT stripped: the "Offline sync: <reason>" annotation added
 * by the offline-sync API. No existing display surface hides it, and it is
 * genuinely useful context in a history view — leave it visible.
 */
export function displayTransactionNote(
  note: string | null | undefined,
): string | null {
  if (!note) return null;

  const { cleanNote } = decodeDivisionFromNote(note);
  const withoutDivision = cleanNote ?? "";

  const withoutPelunasan = withoutDivision.replace(PELUNASAN_ANNOTATION_RE, "");

  const collapsed = withoutPelunasan
    .trim()
    .replace(/^\|\s*/, "")
    .replace(/\s*\|$/, "")
    .trim();

  return collapsed || null;
}
