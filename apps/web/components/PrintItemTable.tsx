"use client";

import React, { useRef, useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import "./print-item-table.css";

interface PrintItemTableProps {
  columnCount: number;
  columns?: ReactNode;
  headings: ReactNode;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  rowActions?: { count: number; add: () => void; removeLast: () => void; lastRowEmpty: boolean };
}

export function PrintItemTable({ columnCount, columns, headings, children, className, disabled, rowActions }: PrintItemTableProps) {
  const [blankRows, setBlankRows] = useState(0);
  const addButton = useRef<HTMLButtonElement>(null);
  const addedRowCount = rowActions?.count ?? blankRows;
  const removeLabel = rowActions?.lastRowEmpty === false ? "Hapus baris tambahan terakhir" : "Hapus baris kosong terakhir";

  return (
    <div className="print-item-table">
      <table className={className}>
        {columns}
        <thead>{headings}</thead>
        <tbody>
          {children}
          {!rowActions && Array.from({ length: blankRows }, (_, row) => (
            <tr key={`blank-${row}`} className="print-item-blank-row">
              {Array.from({ length: columnCount }, (_, column) => <td key={column} />)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="print-item-table-controls">
        <button
          ref={addButton}
          type="button"
          aria-label="Tambah baris kosong"
          title="Tambah baris kosong"
          disabled={disabled}
          onClick={rowActions?.add ?? (() => setBlankRows(count => count + 1))}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
        {addedRowCount > 0 && (
          <button
            className="print-item-table-remove"
            type="button"
            aria-label={removeLabel}
            title={removeLabel}
            disabled={disabled}
            onClick={() => {
              if (addedRowCount === 1) addButton.current?.focus();
              if (rowActions) rowActions.removeLast();
              else setBlankRows(count => count - 1);
            }}
          >
            <Minus size={18} aria-hidden="true" />
          </button>
        )}
        <output className="sr-only">{addedRowCount} baris tambahan</output>
      </div>
    </div>
  );
}
