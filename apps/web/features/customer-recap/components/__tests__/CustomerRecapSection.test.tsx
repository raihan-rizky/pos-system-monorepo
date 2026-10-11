import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CustomerRecapQuery } from "../../types/customer-recap";
import { CustomerRecapSection } from "../CustomerRecapSection";

vi.mock("../../hooks/useCustomerRecap", () => ({
  useCustomerRecap: () => ({
    data: { summary: {}, trend: [], byType: [], topSpenders: [] },
  }),
}));

vi.mock("../RecapPeriodPicker", () => ({
  RecapPeriodPicker: () => <div />,
}));

vi.mock("../CustomerRecapExportMenu", () => ({
  CustomerRecapExportMenu: () => <div />,
}));

describe("CustomerRecapSection", () => {
  it("starts collapsed", () => {
    const html = renderToStaticMarkup(
      <CustomerRecapSection
        range={{} as CustomerRecapQuery}
        onRangeChange={() => undefined}
        onSelectCustomer={() => undefined}
      />,
    );

    expect(html).toContain("Buka");
    expect(html).not.toContain("customer-recap-content");
  });
});
