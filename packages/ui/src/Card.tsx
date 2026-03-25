import React from "react";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  glass?: boolean;
  padding?: "sm" | "md" | "lg";
  onClick?: () => void;
  style?: React.CSSProperties;
}

const paddingClasses = {
  sm: "p-3",
  md: "p-5",
  lg: "p-6",
};

export function Card({
  children,
  className = "",
  hover = false,
  glass = false,
  padding = "md",
  onClick,
  style,
}: CardProps) {
  return (
    <div
      onClick={onClick}
      style={style}
      className={`
        rounded-2xl border border-surface-200
        ${paddingClasses[padding]}
        ${glass
          ? "bg-white/70 backdrop-blur-xl shadow-glass"
          : "bg-white shadow-sm"
        }
        ${hover
          ? "cursor-pointer transition-all duration-300 hover:shadow-card-hover hover:-translate-y-1 active:translate-y-0 active:shadow-md"
          : ""
        }
        ${onClick ? "cursor-pointer" : ""}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
