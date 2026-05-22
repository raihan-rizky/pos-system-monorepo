import React from "react";
import { FileSpreadsheet, Image as ImageIcon } from "lucide-react";

export type ImportMethod = "file" | "image";

export function MethodSelector({
  value,
  onChange,
}: {
  value: ImportMethod;
  onChange: (method: ImportMethod) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <button
        type="button"
        onClick={() => onChange("file")}
        className={`flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 transition-all ${
          value === "file"
            ? "border-slate-900 bg-slate-50 text-slate-900"
            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
        }`}
      >
        <FileSpreadsheet className={`w-8 h-8 ${value === "file" ? "text-slate-900" : "text-slate-400"}`} />
        <div className="text-center">
          <div className="font-bold">Spreadsheet</div>
          <div className="text-xs mt-1 opacity-80">Import dari CSV atau Excel</div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onChange("image")}
        className={`flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 transition-all ${
          value === "image"
            ? "border-slate-900 bg-slate-50 text-slate-900"
            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
        }`}
      >
        <div className="relative">
          <ImageIcon className={`w-8 h-8 ${value === "image" ? "text-slate-900" : "text-slate-400"}`} />
          <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full shadow-sm">
            AI
          </div>
        </div>
        <div className="text-center">
          <div className="font-bold">Gambar</div>
          <div className="text-xs mt-1 opacity-80">Ekstrak dari daftar harga</div>
        </div>
      </button>
    </div>
  );
}
