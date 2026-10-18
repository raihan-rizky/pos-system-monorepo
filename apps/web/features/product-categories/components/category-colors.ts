export const CATEGORY_COLORS = [
  { label: "Biru", value: "#2563eb" },
  { label: "Hijau", value: "#059669" },
  { label: "Ungu", value: "#7c3aed" },
  { label: "Merah muda", value: "#db2777" },
  { label: "Jingga", value: "#ea580c" },
  { label: "Kuning", value: "#facc15" },
  { label: "Toska", value: "#0891b2" },
  { label: "Merah", value: "#dc2626" },
  { label: "Abu-abu", value: "#64748b" },
] as const;

export function categoryColorStyle(value?: string | null) {
  const backgroundColor = value && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : "#f1f5f9";
  const hex = backgroundColor.length === 4 ? backgroundColor.slice(1).split("").map(c => c + c).join("") : backgroundColor.slice(1);
  const channels = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const light = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  const darkContrast = (light + 0.05) / (0.008816 + 0.05);
  const whiteContrast = 1.05 / (light + 0.05);
  const color = Math.max(whiteContrast, darkContrast) < 4.5 ? "#000000" : whiteContrast > darkContrast ? "#ffffff" : "#0f172a";
  return { backgroundColor, color };
}
