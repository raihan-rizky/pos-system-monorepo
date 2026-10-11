import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The repository uses a node-only test runner. Drive the component's event
// handlers and effect lifecycle without introducing a DOM dependency.
const hooks = vi.hoisted(() => ({
  values: [] as any[], index: 0, effectIndex: 0,
  dependencies: [] as unknown[][],
  effects: [] as (() => void)[], dirty: false, data: null as any,
}));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: any) => {
      const value = typeof next === "function" ? next(hooks.values[index]) : next;
      if (!Object.is(value, hooks.values[index])) hooks.dirty = true;
      hooks.values[index] = value;
    }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
  useEffect: (effect: () => void, deps: unknown[]) => {
    const index = hooks.effectIndex++;
    if (!hooks.dependencies[index] || deps.some((value, i) => !Object.is(value, hooks.dependencies[index][i]))) {
      hooks.effects.push(effect);
      hooks.dependencies[index] = deps;
    }
  },
}));
vi.mock("../../hooks/useShoppingRequests", () => ({
  useShoppingRequest: () => ({ data: hooks.data }),
  useFinalizeShoppingRequest: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useRejectShoppingRequest: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("@/components/providers/RoleProvider", () => ({ useRole: () => ({ canPerform: () => true }) }));
vi.mock("../ProductAutocomplete", () => ({ ProductAutocomplete: () => null }));
vi.mock("../ShoppingRequestUnitSelect", () => ({ ShoppingRequestUnitSelect: () => null }));
vi.mock("@/features/inventory-management/components/ProductStockThumbnail", () => ({ ProductStockThumbnail: () => null }));
vi.mock("@pos/ui", () => ({ Button: () => null, Modal: () => null }));
import { ShoppingRequestFinalApprovalModal } from "../ShoppingRequestFinalApprovalModal";

function request(id: string) {
  return { id, items: [{ id: `item-${id}`, productId: "pcs", productName: "Kertas", productSku: "PCS", unit: "pcs", requestedQty: 1, imageUrl: null, product: { costPrice: 100, stockGroup: { id: "group" } } }] };
}

function render(requestId: string | null): ReactElement<any> {
  let tree: ReactElement<any>;
  let passes = 0;
  do {
    hooks.dirty = false;
    hooks.index = hooks.effectIndex = 0;
    tree = ShoppingRequestFinalApprovalModal({ requestId, onClose: vi.fn() });
    hooks.effects.splice(0).forEach((effect) => effect());
    if (++passes > 10) throw new Error("Component did not settle");
  } while (hooks.dirty);
  return tree!;
}

function find(tree: any, predicate: (node: ReactElement<any>) => boolean): ReactElement<any> {
  const nodes: ReactElement<any>[] = [];
  function visit(node: any) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object" || !node.props) return;
    nodes.push(node);
    visit(node.props.children);
  }
  visit(tree);
  const result = nodes.find(predicate);
  if (!result) throw new Error("Expected control was not rendered");
  return result;
}
const quantity = (tree: ReactElement<any>) => find(tree, (node) => node.type === "input" && node.props.type === "number");
const confirmation = (tree: ReactElement<any>) => find(tree, (node) => node.type === "input" && node.props.type === "checkbox" && !node.props.className);
const approve = (tree: ReactElement<any>) => find(tree, (node) => node.props.children === "Setujui dan Catat Pembelian");

describe("final approval session", () => {
  beforeEach(() => {
    hooks.values = []; hooks.dependencies = []; hooks.effects = [];
    hooks.data = request("A");
  });

  function confirmAndEnterReason() {
    let tree = render("A");
    quantity(tree).props.onChange({ target: { value: "2" } });
    tree = render("A");
    confirmation(tree).props.onChange({ target: { checked: true } });
    find(tree, (node) => node.type === "textarea").props.onChange({ target: { value: "Alasan permohonan A" } });
    expect(approve(render("A")).props.disabled).toBe(false);
  }

  it.each([false, true])("requires a new confirmation and reason for the next session (close first: %s)", (closeFirst) => {
    confirmAndEnterReason();
    if (closeFirst) { hooks.data = null; render(null); }
    hooks.data = request(closeFirst ? "A" : "B");
    const id = hooks.data.id;
    let tree = render(id);
    expect(find(tree, (node) => node.type === "textarea").props.value).toBe("");
    quantity(tree).props.onChange({ target: { value: "2" } });
    tree = render(id);
    expect(confirmation(tree).props.checked).toBe(false);
    expect(approve(tree).props.disabled).toBe(true);
  });

  it("preserves draft prices and quantities when the same request refetches", () => {
    let tree = render("A");
    quantity(tree).props.onChange({ target: { value: "2" } });
    const price = find(tree, (node) => node.type === "input" && node.props.type === "number" && node.props.value === 100);
    price.props.onChange({ target: { value: "250" } });
    hooks.data = request("A");
    tree = render("A");
    expect(quantity(tree).props.value).toBe(2);
    expect(find(tree, (node) => node.type === "input" && node.props.type === "number" && node.props.min === "0" && node.props.step === "0.01" && node.props.value !== 2).props.value).toBe(250);
  });
});
