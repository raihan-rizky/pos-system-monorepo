"use client";

import type { ColumnMapping, ImportColumn } from "../types";
import { IMPORT_COLUMNS } from "../types";

const HEADER_ALIASES: Record<string, string> = {
  productname: "name",
  product_name: "name",
  nama: "name",
  namaproduk: "name",
  nama_item: "name",
  namaitem: "name",
  kode: "sku",
  code: "sku",
  kode_item: "sku",
  kodeitem: "sku",
  kategori: "category",
  harga: "price",
  harga_level_1: "price",
  hargalevel1: "price",
  hargadinas: "hargaDinas",
  harga_dinas: "hargaDinas",
  hargapemerintah: "hargaDinas",
  harga_pemerintah: "hargaDinas",
  harga_level_2: "hargaDinas",
  hargalevel2: "hargaDinas",
  stok: "stock",
  satuan: "unit",
  konversi: "unitMultiplierToBase",
  unit_multiplier_to_base: "unitMultiplierToBase",
  unitmultiplier: "unitMultiplierToBase",
  multiplier: "unitMultiplierToBase",
  hpp: "costPrice",
  harga_pokok: "costPrice",
  hargapokok: "costPrice",
  cost: "costPrice",
  costprice: "costPrice",
  cost_price: "costPrice",
  min_stock: "minStock",
  minimumstock: "minStock",
  gambar: "imageUrl",
  image: "imageUrl",
};

function normalizeHeaderKey(value: string): string {
  const compact = value.replace(/[\s-]+/g, "_");
  return compact.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

/**
 * Read raw column headers from a CSV or XLSX file on the client side.
 * Uses dynamic import of xlsx so it only loads when needed.
 */
export async function readFileHeaders(file: File): Promise<string[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  return (matrix[0] ?? []).map((h) => String(h ?? "").trim()).filter(Boolean);
}

/**
 * Build an initial column mapping with auto-suggestions.
 * Known columns and aliases map automatically; unknowns start as "".
 */
export function buildAutoMapping(rawHeaders: string[]): ColumnMapping {
  const known = new Set<string>(IMPORT_COLUMNS);
  const mapping: ColumnMapping = {};
  const alreadyMapped = new Set<string>();

  for (const raw of rawHeaders) {
    const key = normalizeHeaderKey(raw);
    const aliased = HEADER_ALIASES[key] ?? key;

    if (known.has(aliased) && !alreadyMapped.has(aliased)) {
      mapping[raw] = aliased as ImportColumn;
      alreadyMapped.add(aliased);
    } else {
      mapping[raw] = "";
    }
  }

  return mapping;
}

/**
 * Check which required columns are unmapped.
 */
export function getMissingRequiredColumns(mapping: ColumnMapping): string[] {
  const mapped: Set<string> = new Set(Object.values(mapping).filter(Boolean));
  const required = ["name", "sku", "category", "price", "unit"];
  return required.filter((col) => !mapped.has(col));
}
