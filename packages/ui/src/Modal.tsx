"use client";

import React, { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";
  className?: string;
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
};

function titleToId(title: string) {
  return `modal-${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-title`;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  className = "",
}: ModalProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, handleEscape]);

  if (!open) return null;

  const titleId = title ? titleToId(title) : undefined;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`
          relative z-10 w-full ${sizeClasses[size]}
          bg-white rounded-2xl shadow-2xl max-h-[85%] flex flex-col translate-y-[-25px]
          animate-scale-in
          ${className}
        `}
      >
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100 shrink-0">
            <h2 id={titleId} className="text-lg font-bold text-surface-900">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup modal"
              className="p-1.5 rounded-lg text-surface-400 hover:text-surface-600 hover:bg-surface-100 transition-colors"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="flex-1 px-6 py-4 overflow-y-auto min-h-0">{children}</div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
