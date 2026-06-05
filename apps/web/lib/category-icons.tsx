import {
  Disc,
  Droplets,
  FileText,
  IdCard,
  Image as ImageIcon,
  Package,
  PenTool,
  Printer,
  Settings,
  Stamp,
} from "lucide-react";

const CATEGORY_ICONS = {
  disc: Disc,
  droplets: Droplets,
  "file-text": FileText,
  "id-card": IdCard,
  image: ImageIcon,
  package: Package,
  "pen-tool": PenTool,
  printer: Printer,
  settings: Settings,
  stamp: Stamp,
} as const;

type CategoryIconName = keyof typeof CATEGORY_ICONS;

interface CategoryIconProps {
  value?: string | null;
  className?: string;
}

function normalizeCategoryIcon(value?: string | null): CategoryIconName {
  if (value && value in CATEGORY_ICONS) {
    return value as CategoryIconName;
  }
  return "package";
}

export function CategoryIcon({
  value,
  className = "h-3.5 w-3.5",
}: CategoryIconProps) {
  const Icon = CATEGORY_ICONS[normalizeCategoryIcon(value)];
  return <Icon className={className} aria-hidden="true" />;
}

