import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Package, Save } from "lucide-react";

import HelpDiagramStepper from "../components/HelpDiagramStepper";

describe("HelpDiagramStepper", () => {
  it("uses ordered workflow semantics without marking previous selections complete", () => {
    const html = renderToStaticMarkup(
      <HelpDiagramStepper
        steps={[
          { title: "Buka katalog", description: "Masuk ke Produk.", icon: <Package /> },
          { title: "Simpan produk", description: "Klik Simpan.", icon: <Save /> },
        ]}
      />,
    );

    expect(html).toContain("<ol");
    expect(html).toContain('aria-current="step"');
    expect(html).not.toContain("data-completed");
    expect(html).not.toContain("lucide-check");
  });
});
