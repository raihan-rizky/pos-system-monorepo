"use client";

import { useState } from "react";
import { PackageOpen } from "lucide-react";

export function InboundReceiptProductThumbnail({
  imageUrl,
  productName,
}: {
  imageUrl?: string | null;
  productName: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const src = imageUrl?.trim();

  return (
    <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
      {src && src !== failedUrl ? (
        <img
          src={src}
          alt={`Foto ${productName}`}
          width={48}
          height={48}
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(src)}
          className="h-full w-full bg-white object-contain p-1"
        />
      ) : (
        <span
          role="img"
          aria-label={`Foto ${productName} belum tersedia`}
          title="Foto belum tersedia"
        >
          <PackageOpen className="h-5 w-5 text-slate-400" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
