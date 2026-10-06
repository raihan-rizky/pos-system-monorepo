import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TopProductsList } from "../TopProductsList";
import type { TopProductGroup } from "../../types";

const legacyProducts = [{ name: "Produk daftar lama", quantity: 3, revenue: 45_000 }];

const groups = [
  {
    key: "ATK",
    label: "ATK",
    products: [{ name: "Pensil", quantity: 5, revenue: 25_000 }],
  },
  {
    key: "PAPER",
    label: "Kertas",
    products: [{ name: "Kertas HVS", quantity: 4, revenue: 40_000 }],
  },
  {
    key: "CARTRIDGE",
    label: "Cartridge",
    products: [{ name: "Cartridge HP", quantity: 2, revenue: 100_000 }],
  },
  {
    key: "INK",
    label: "Tinta",
    products: [{ name: "Tinta printer", quantity: 1, revenue: 30_000 }],
  },
  {
    key: "OTHER",
    label: "Lainnya",
    products: [{ name: "Toner HP", quantity: 1, revenue: 50_000 }],
  },
] satisfies TopProductGroup[];

describe("TopProductsList grouped rendering", () => {
  it("renders the category groups instead of the legacy flat list", () => {
    const html = renderToStaticMarkup(
      <TopProductsList data={legacyProducts} groups={groups} />,
    );

    expect(html).toContain("Kertas");
    expect(html).toContain("Cartridge");
    expect(html).toContain("Tinta");
    expect(html).toContain("Lainnya");
    expect(html).toContain("Toner HP");
    expect(html).not.toContain("Produk daftar lama");
  });
});
