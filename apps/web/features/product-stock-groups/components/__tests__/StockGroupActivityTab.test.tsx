import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { StockGroupActivityList } from "../StockGroupActivityTab";

describe("StockGroupActivityList", () => {
  it("renders non-conversion group activity rows with open stock unit action", () => {
    const html = renderToStaticMarkup(
      <StockGroupActivityList
        activities={[
          {
            id: "activity-1",
            stockGroupId: "group-1",
            productId: "product-1",
            type: "VARIANT_ADDED",
            note: "Tambah dus",
            createdBy: "owner-1",
            person: "Owner",
            createdAt: "2026-06-16T01:00:00.000Z",
            stockGroup: { id: "group-1", displayName: "HVS A4" },
            product: {
              id: "product-1",
              name: "HVS A4",
              sku: "HVS-A4-DUS",
              unit: "dus",
            },
          },
        ]}
        onOpenStockGroup={() => undefined}
      />,
    );

    expect(html).toContain("Varian Ditambahkan");
    expect(html).toContain("HVS A4");
    expect(html).toContain("HVS-A4-DUS - dus");
    expect(html).toContain("Tambah dus");
    expect(html).toContain("Buka Stok Unit");
  });
});
