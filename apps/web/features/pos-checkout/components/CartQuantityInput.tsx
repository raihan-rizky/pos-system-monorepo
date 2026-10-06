"use client";

import { useEffect, useId, useRef, useState } from "react";
import { parseCartQuantity } from "../helpers/cart-quantity";

interface CartQuantityInputProps {
  name: string;
  quantity: number;
  onChange: (quantity: number) => void;
  onValidityChange: (valid: boolean) => void;
}

export function CartQuantityInput({
  name,
  quantity,
  onChange,
  onValidityChange,
}: CartQuantityInputProps) {
  const [draft, setDraft] = useState(String(quantity));
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState("");
  const errorId = useId();
  const cancelled = useRef(false);

  useEffect(() => {
    if (!focused) {
      setDraft(String(quantity));
      setError("");
    }
  }, [quantity, focused]);

  const finishEditing = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setFocused(false);
      return;
    }
    if (parseCartQuantity(draft) === null) {
      setDraft(String(quantity));
      setError("Masukkan jumlah bulat lebih dari nol.");
    }
    onValidityChange(true);
    setFocused(false);
  };

  return (
    <span className="flex max-w-36 flex-col items-center">
      <input
        aria-label={`Jumlah ${name}`}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        type="text"
        inputMode="numeric"
        pattern="[0-9]+"
        value={draft}
        className="min-h-11 w-12 rounded-md border border-surface-200 bg-white text-center text-sm font-bold text-surface-900 outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/30"
        onFocus={() => {
          setFocused(true);
          setError("");
        }}
        onChange={(event) => {
          const raw = event.target.value;
          setDraft(raw);
          setError("");
          const parsed = parseCartQuantity(raw);
          onValidityChange(parsed !== null);
          if (parsed !== null) onChange(parsed);
        }}
        onBlur={finishEditing}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            cancelled.current = true;
            setDraft(String(quantity));
            setError("");
            onValidityChange(true);
            event.currentTarget.blur();
          }
        }}
      />
      {error && (
        <span
          id={errorId}
          role="alert"
          className="mt-1 max-w-36 text-center text-[10px] leading-tight text-danger-600"
        >
          {error}
        </span>
      )}
    </span>
  );
}
