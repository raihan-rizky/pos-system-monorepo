"use client";

import React from "react";
import { cn, getDefaultProductImage } from "@/lib/utils";

const sizeClasses = {
  sm: "h-9 w-9 rounded-lg",
  md: "h-12 w-12 rounded-xl",
  lg: "h-16 w-16 rounded-xl",
} as const;

interface ProductStockThumbnailProps {
  name: string;
  imageUrl?: string | null;
  categoryName?: string | null;
  size?: keyof typeof sizeClasses;
  className?: string;
}

export function ProductStockThumbnail({
  name,
  imageUrl,
  categoryName,
  size = "md",
  className,
}: ProductStockThumbnailProps) {
  const fallbackSrc = getDefaultProductImage(categoryName);

  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden border border-slate-200 bg-slate-50",
        sizeClasses[size],
        className,
      )}
    >
      <img
        src={imageUrl || fallbackSrc}
        alt={`Foto produk ${name}`}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.onerror = null;
          event.currentTarget.src = fallbackSrc;
        }}
      />
    </div>
  );
}
