import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import HelpPage from "../page";

vi.mock("@/components/providers/RoleProvider", () => ({
  useRole: () => ({ role: "OWNER" }),
}));

describe("HelpPage", () => {
  it("uses a wide content container so full app-shell previews are not clipped", () => {
    const html = renderToStaticMarkup(<HelpPage />);

    expect(html).toContain('data-help-page-layout="wide"');
    expect(html).toContain("max-w-[1600px]");
    expect(html).not.toContain("max-w-5xl");
  });
});
