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
  decorative?: boolean;
  imageUrl?: string | null;
  backupImageUrl?: string;
  categoryName?: string | null;
  size?: keyof typeof sizeClasses;
  className?: string;
}

export function ProductStockThumbnail({
  name,
  decorative = false,
  imageUrl,
  backupImageUrl,
  categoryName,
  size = "md",
  className,
}: ProductStockThumbnailProps) {
  const fallbackSrc = getDefaultProductImage(categoryName);
  const primarySrc = imageUrl?.trim() || fallbackSrc;
  const recoverySrc = backupImageUrl && backupImageUrl !== primarySrc ? backupImageUrl : fallbackSrc;

  return (
    <div
      className={cn(
        "shrink-0 overflow-hidden border border-slate-200 bg-slate-50",
        sizeClasses[size],
        className,
      )}
    >
      <img
        src={primarySrc}
        alt={decorative ? "" : `Foto produk ${name}`}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={({ currentTarget }) => {
          const failedSrc = currentTarget.getAttribute("src");
          if (failedSrc === fallbackSrc) return;
          currentTarget.src = failedSrc === primarySrc ? recoverySrc : fallbackSrc;
        }}
      />
    </div>
  );
}
