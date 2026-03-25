import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
  hint?: string;
}

export function Input({
  label,
  error,
  icon,
  hint,
  className = "",
  id,
  ...props
}: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-surface-700"
        >
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={`
            w-full px-4 py-2.5 rounded-xl
            bg-white border border-surface-200
            text-surface-900 placeholder:text-surface-400
            transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400
            hover:border-surface-300
            disabled:bg-surface-50 disabled:cursor-not-allowed
            ${icon ? "pl-10" : ""}
            ${error ? "border-danger-400 focus:ring-danger-400" : ""}
            ${className}
          `}
          {...props}
        />
      </div>
      {error && (
        <p className="text-sm text-danger-500 animate-fade-in">{error}</p>
      )}
      {hint && !error && (
        <p className="text-xs text-surface-400">{hint}</p>
      )}
    </div>
  );
}
