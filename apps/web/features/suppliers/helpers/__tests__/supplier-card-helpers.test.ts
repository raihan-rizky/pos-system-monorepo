import { describe, expect, it, vi } from "vitest";

import {
  buildEmptyStateContent,
  buildSupplierCardKeyDown,
  buildSupplierCardA11yProps,
  isSupplierCardInteractiveTarget,
  KPI_ACCENTS,
} from "../supplier-card-helpers";

describe("buildEmptyStateContent", () => {
  it("returns CTA copy for the no-suppliers variant", () => {
    expect(buildEmptyStateContent("no-suppliers")).toEqual({
      title: "Belum ada supplier",
      description:
        "Tambahkan supplier pertama untuk mulai mencatat pembelian dan restock.",
      ctaLabel: "Tambah Supplier",
    });
  });

  it("returns reset copy for the no-match variant", () => {
    expect(buildEmptyStateContent("no-match")).toEqual({
      title: "Tidak ada supplier cocok",
      description:
        "Ubah pencarian atau reset filter untuk melihat supplier lain.",
      ctaLabel: "Reset Filter",
    });
  });
});

describe("buildSupplierCardKeyDown", () => {
  it("invokes the handler on Enter and stops propagation", () => {
    const handler = vi.fn();
    const event = {
      key: "Enter",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.KeyboardEvent<HTMLElement>;

    buildSupplierCardKeyDown(handler)(event);

    expect(handler).toHaveBeenCalledWith(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
  });

  it("invokes the handler on Space and stops propagation", () => {
    const handler = vi.fn();
    const event = {
      key: " ",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.KeyboardEvent<HTMLElement>;

    buildSupplierCardKeyDown(handler)(event);

    expect(handler).toHaveBeenCalledWith(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("does nothing for unrelated keys", () => {
    const handler = vi.fn();
    const event = {
      key: "Escape",
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as React.KeyboardEvent<HTMLElement>;

    buildSupplierCardKeyDown(handler)(event);

    expect(handler).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});

describe("buildSupplierCardA11yProps", () => {
  it("returns button-like a11y props so the card is focusable and activatable", () => {
    expect(buildSupplierCardA11yProps()).toEqual({
      role: "button",
      tabIndex: 0,
    });
  });
});

describe("isSupplierCardInteractiveTarget", () => {
  it("flags nested action buttons so the parent click handler skips them", () => {
    const button = document_createElement("button");
    const anchor = document_createElement("a");
    const input = document_createElement("input");
    const div = document_createElement("div");

    expect(isSupplierCardInteractiveTarget(button)).toBe(true);
    expect(isSupplierCardInteractiveTarget(anchor)).toBe(true);
    expect(isSupplierCardInteractiveTarget(input)).toBe(true);
    expect(isSupplierCardInteractiveTarget(div)).toBe(false);
  });
});

describe("KPI_ACCENTS", () => {
  it("exposes one accent per KPI card", () => {
    expect(KPI_ACCENTS).toHaveLength(4);
    expect(KPI_ACCENTS[0]).toMatchObject({ bgClass: expect.any(String), iconClass: expect.any(String) });
  });
});

function document_createElement<T extends keyof HTMLElementTagNameMap>(tag: T) {
  const element: any = {
    tagName: tag.toUpperCase(),
    dataset: {},
  };
  Object.defineProperty(element, "closest", {
    value: (selector: string) => {
      const targets = ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"];
      if (targets.includes(element.tagName) && selector.includes(element.tagName.toLowerCase())) {
        return element;
      }
      if (selector.includes("[data-card-stop]") && element.dataset?.cardStop === "true") {
        return element;
      }
      return null;
    },
  });
  return element;
}