import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AutoActionBadge } from "../AutoActionBadge";

describe("AutoActionBadge", () => {
  it("renders text labels for automatic import actions", () => {
    const html = renderToStaticMarkup(
      <AutoActionBadge
        action="auto_create_variant"
        reason="Variant: same product, different unit."
        conversionNeedsReview={false}
      />,
    );

    expect(html).toContain("Auto variant");
    expect(html).toContain("Variant: same product, different unit.");
  });

  it("does not rely on color alone for conversion review state", () => {
    const html = renderToStaticMarkup(
      <AutoActionBadge
        action="auto_create_variant"
        reason="Review needed"
        conversionNeedsReview
      />,
    );

    expect(html).toContain("Review");
    expect(html).toContain("Review needed");
  });
});
