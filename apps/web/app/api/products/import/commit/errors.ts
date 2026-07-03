import { NextResponse } from "next/server";

import { SAME_UNIT_PRICE_CONFLICT_MESSAGE } from "@/features/product-import/helpers/same-unit-price-conflicts";
import {
  PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED,
  PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED_MESSAGE,
} from "@/features/product-import/helpers/price-column-sanity";

export function productImportCommitErrorResponse(error: Error) {
  if (error.message.startsWith(`${PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED}:`)) {
    const [, priceBelowCostRowCount, comparableRowCount] = error.message.split(":");
    return NextResponse.json(
      {
        code: PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED,
        message: PRODUCT_IMPORT_PRICE_COLUMNS_SUSPECTED_SWAPPED_MESSAGE,
        comparableRowCount: Number(comparableRowCount),
        priceBelowCostRowCount: Number(priceBelowCostRowCount),
      },
      { status: 422 },
    );
  }
  if (error.message.startsWith("MISSING_CATEGORIES:")) {
    return NextResponse.json(
      {
        message: "Missing category confirmation",
        missingCategories: error.message.replace("MISSING_CATEGORIES:", "").split(", "),
      },
      { status: 409 },
    );
  }
  if (error.message.startsWith("DUPLICATE_SKUS:")) {
    return NextResponse.json(
      {
        message: "Import contains duplicate SKUs. Mark extra rows as skip.",
        duplicateSkus: error.message.replace("DUPLICATE_SKUS:", "").split(","),
      },
      { status: 409 },
    );
  }
  if (error.message.startsWith("SAME_UNIT_PRICE_CONFLICTS:")) {
    return NextResponse.json(
      {
        message: SAME_UNIT_PRICE_CONFLICT_MESSAGE,
        conflictGroups: JSON.parse(error.message.replace("SAME_UNIT_PRICE_CONFLICTS:", "")),
      },
      { status: 409 },
    );
  }
  if (error.message.startsWith("ROW_DECISION_REQUIRED:")) {
    return NextResponse.json(
      {
        message: "Existing SKU rows require update or skip decisions",
        rowNumber: Number(error.message.replace("ROW_DECISION_REQUIRED:", "")),
      },
      { status: 409 },
    );
  }
  if (error.message.startsWith("ROW_CONFLICT:")) {
    return NextResponse.json(
      {
        message: "Import row conflicts with an existing SKU assigned to another product",
        rowNumber: Number(error.message.replace("ROW_CONFLICT:", "")),
      },
      { status: 409 },
    );
  }
  if (error.message === "BATCH_NOT_FOUND") {
    return NextResponse.json({ message: "Import batch not found" }, { status: 404 });
  }
  if (error.message === "BATCH_ALREADY_COMMITTED") {
    return NextResponse.json({ message: "Import batch is already committed" }, { status: 409 });
  }
  if (error.message.startsWith("IMPORT_INCOMPLETE:")) {
    const [, committed, total] = error.message.split(":");
    return NextResponse.json(
      {
        message: "Import has not finished all chunks",
        committedRowCount: Number(committed),
        totalRows: Number(total),
      },
      { status: 409 },
    );
  }
  if (error.message.startsWith("CHUNKED_IMPORT_REQUIRED:")) {
    const [, rowCount, chunkSize] = error.message.split(":");
    return NextResponse.json(
      {
        message: "Large product imports must use the chunked import flow",
        rowCount: Number(rowCount),
        chunkSize: Number(chunkSize),
      },
      { status: 409 },
    );
  }
  return null;
}
