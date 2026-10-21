/** Mirrors packages/config/tailwind.config.ts and the financial KpiCard status
 * tones. Keep Excel light for printing; use darker brand/accent shades for text. */
export const MONTHLY_CONTENT_PALETTES = {
  brand: { head: "0160A1", ink: "0B446E", light: "F0F7FF", stripe: "E0EFFE" },
  brandDeep: { head: "065285", ink: "072B49", light: "E0EFFE", stripe: "BAE0FD" },
  brandMedium: { head: "0079C7", ink: "065285", light: "F0F7FF", stripe: "BAE0FD" },
  accent: { head: "C24A09", ink: "7C3210", light: "FFF7ED", stripe: "FFEED4" },
  accentSoft: { head: "9A3B10", ink: "431706", light: "FFEED4", stripe: "FED9A8" },
  success: { head: "047857", ink: "047857", light: "ECFDF5", stripe: "D1FAE5" },
  warning: { head: "B45309", ink: "92400E", light: "FFFBEB", stripe: "FEF3C7" },
  danger: { head: "DC2626", ink: "991B1B", light: "FEF2F2", stripe: "FEE2E2" },
  surface: { head: "475569", ink: "334155", light: "F8FAFC", stripe: "F1F5F9" },
  input: { head: "B45309", ink: "92400E", light: "FEF3C7", stripe: "FEF3C7" },
} as const;

/** Ordered like monthlySheetNames: visible tab colors and worksheet bands agree. */
export const MONTHLY_SHEET_THEMES = [
  { primary: "0160A1", soft: "E0EFFE", stripe: "F0F7FF" },
  { primary: "047857", soft: "D1FAE5", stripe: "ECFDF5" },
  { primary: "0079C7", soft: "E0EFFE", stripe: "F0F7FF" },
  { primary: "065285", soft: "BAE0FD", stripe: "F0F7FF" },
  { primary: "C24A09", soft: "FFEED4", stripe: "FFF7ED" },
  { primary: "9A3B10", soft: "FED9A8", stripe: "FFF7ED" },
  { primary: "0B446E", soft: "E0EFFE", stripe: "F8FAFC" },
] as const;
