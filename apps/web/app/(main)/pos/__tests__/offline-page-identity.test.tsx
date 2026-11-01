import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => ({ value: ({ "x-pos-user-id": "cashier-1", "x-pos-store-id": "store-1" } as Record<string, string>)[name] }) }) }));
vi.mock("../pos-initial-data", () => ({ loadPOSInitialData: async () => ({ products: null, categories: [] }) }));
vi.mock("../POSClientPage", () => ({ default: () => <div>POS</div> }));

import POSPage from "../page";

it("binds the server-rendered POS page to the identity used for offline preparation", async () => {
  const html = renderToStaticMarkup(await POSPage());
  expect(html).toContain('data-offline-pos-cashier="cashier-1"');
  expect(html).toContain('data-offline-pos-store="store-1"');
});
