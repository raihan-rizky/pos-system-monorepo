import type {
  SupplierCodeImportPreview,
  SupplierCodeImportRow,
} from "../types";

type Reference = { id: string; name: string };

const HEADER_ALIASES: Record<string, "sku" | "supplierCode"> = {
  sku: "sku",
  kodeproduk: "sku",
  kodebarang: "sku",
  productcode: "sku",
  suppliercode: "supplierCode",
  kodesupplier: "supplierCode",
  kodepemasok: "supplierCode",
};

function normalizeHeader(value: unknown) {
  const key = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return HEADER_ALIASES[key] ?? "";
}

function normalizeCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function uniqueCodes(value: unknown) {
  return Array.from(
    new Set(
      String(value ?? "")
        .split(/[,;\n]/)
        .map(normalizeCode)
        .filter(Boolean),
    ),
  );
}

export function buildSupplierCodeImportRecords(matrix: unknown[][]) {
  const headers = (matrix[0] ?? []).map(normalizeHeader);
  const records = matrix
    .slice(1)
    .filter((row) => row.some((cell) => String(cell ?? "").trim()))
    .map((row) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (header && !(header in record)) record[header] = row[index];
      });
      return record;
    });

  return { headers: headers.filter(Boolean), records };
}

export function normalizeSupplierCodeImportRows(
  records: Array<Record<string, unknown>>,
  productsBySku: Map<string, Reference>,
  suppliersByCode: Map<string, Reference>,
): SupplierCodeImportPreview {
  const seenSkus = new Set<string>();
  const rows: SupplierCodeImportRow[] = records.map((record, index) => {
    const rowNumber = index + 2;
    const sku = normalizeCode(record.sku);
    const supplierCodes = uniqueCodes(record.supplierCode);
    const product = productsBySku.get(sku);
    const errors: string[] = [];

    if (!sku) errors.push("SKU wajib diisi.");
    else if (!product) errors.push(`Produk dengan SKU ${sku} tidak ditemukan.`);
    else if (seenSkus.has(sku)) {
      errors.push(`SKU ${sku} muncul lebih dari sekali di dalam berkas.`);
    }
    if (sku) seenSkus.add(sku);

    if (supplierCodes.length === 0) errors.push("Kode supplier wajib diisi.");

    const suppliers = supplierCodes
      .map((code) => ({ code, supplier: suppliersByCode.get(code) }))
      .filter((entry) => {
        if (entry.supplier) return true;
        errors.push(`Kode supplier ${entry.code} tidak ditemukan.`);
        return false;
      });

    return {
      rowNumber,
      sku,
      productId: product?.id,
      productName: product?.name,
      supplierCodes,
      supplierIds: suppliers.map((entry) => entry.supplier!.id),
      supplierNames: suppliers.map((entry) => entry.supplier!.name),
      errors,
    };
  });
  const validRows = rows.filter((row) => row.errors.length === 0).length;

  return {
    rows,
    totalRows: rows.length,
    validRows,
    invalidRows: rows.length - validRows,
  };
}
