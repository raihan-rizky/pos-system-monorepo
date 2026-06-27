import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InternalStockOutModal } from "../InternalStockOutModal";

vi.mock("@pos/ui", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    Modal: ({ children, title }: any) => (
      <div data-testid="modal-mock">
        {title}
        {children}
      </div>
    ),
  };
});

const createInternalStockOutRequestMock = vi.hoisted(() => vi.fn());
const createInternalUseStockLogMock = vi.hoisted(() => vi.fn());

vi.mock("../../api/inventory-management-api", () => ({
  createInternalStockOutRequest: createInternalStockOutRequestMock,
  createInternalUseStockLog: createInternalUseStockLogMock,
}));

describe("InternalStockOutModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows product search, cart, and reason textarea", () => {
    const html = renderToStaticMarkup(
      <InternalStockOutModal
        open
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(html).toContain("Stock Out Internal");
    expect(html).toContain("Cari nama produk atau scan barcode/SKU");
    expect(html).toContain("Keranjang Stock Out");
    expect(html).toContain("name=\"reason\"");
  });

  it("shows submit button", () => {
    const html = renderToStaticMarkup(
      <InternalStockOutModal
        open
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(html).toContain("Kirim Permintaan");
  });

  it("describes stock-log approval instead of the old internal request workflow", () => {
    const html = renderToStaticMarkup(
      <InternalStockOutModal
        open
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );

    expect(html).toContain("log stok pending");
    expect(html).not.toContain("Owner akan me-review permintaan ini");
  });
});
