import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AssistantWorkflowMessage } from "../AssistantWorkflowMessage";

describe("AssistantWorkflowMessage", () => {
  it("renders trusted workflow steps and navigation links", () => {
    const html = renderToStaticMarkup(
      <AssistantWorkflowMessage
        workflow={{
          id: "faq-q01-add-product",
          title: "Tambah produk baru",
          route: "/products",
          actionLabel: "Buka Produk",
          sourceRef: "docs/help/faq.md#q1",
          steps: [
            {
              id: "faq-q01-add-product-step-1",
              title: "Buka katalog",
              description: "Masuk ke halaman Produk.",
              route: "/products",
              actionLabel: "Buka Produk",
              iconKey: "package",
            },
            {
              id: "faq-q01-add-product-step-2",
              title: "Isi data",
              description: "Isi nama, SKU, harga, stok, dan satuan.",
              route: "/products",
              actionLabel: "Buka Produk",
              iconKey: "package",
            },
          ],
        }}
      />,
    );

    expect(html).toContain("Tambah produk baru");
    expect(html).toContain("Buka katalog");
    expect(html).toContain('href="/products"');
    expect(html).not.toContain("prefill");
    expect(html).not.toContain("otomatis klik");
  });
});
